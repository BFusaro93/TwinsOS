import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import type { Database } from "@/types/supabase";
import { getReport } from "@/lib/reports/registry";
import { renderScheduledReport, type ScheduledReportFormat } from "@/lib/reports/run-scheduled";
import { escapeHtml, orgEmailFrom, sendEmailRetryingRateLimit } from "@/lib/email/send";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { createOrgOutboundMutedResolver } from "@/lib/orgs/org-canceled";
import { startOfTodayInZoneIso } from "@/lib/time/zone";
import { isDue, recurrenceFromRow } from "@/lib/reports/schedule-recurrence";

/**
 * GET /api/cron/report-schedules — called hourly by Vercel Cron (see
 * vercel.json). Previously driven by a GitHub Actions workflow instead,
 * because the account was on Vercel's Hobby plan, which caps cron jobs at
 * once/day regardless of schedule string; moved back to native Vercel Cron
 * after the 2026-09 upgrade to Pro (see TASKS.md "Deferred — Vercel plan
 * upgrade for true hourly cron").
 *
 * For every enabled `report_schedules` row that isDue() (schedule-recurrence.ts:
 * today is one of its run dates — daily / chosen weekdays / monthly rule /
 * one-off date, inside its start/end window — and the clock has reached
 * hour_local, all on that schedule's OWN ORG's calendar, and it hasn't
 * already run today on that calendar): runs its report (scoped to that
 * schedule's org — see renderScheduledReport), renders it as a PDF or Excel
 * file, and emails it to the schedule's recipients with the schedule's
 * subject/message (or the default wording). "At or after" the hour rather
 * than "equal to" because the scheduler can fire a few minutes late. The
 * "not already run today" conditional claim is what keeps this to one send
 * per org-local day even if the cron fires twice. A one-off schedule is
 * disabled after it sends. Only schedulable reports (a fixed date window
 * recomputed each run) make sense here — the catalog enforces that at
 * creation time, not this route.
 *
 * Security: Vercel passes Authorization: Bearer {CRON_SECRET}. Reject
 * anything else.
 */
// Renders reports and sends email for every due schedule in one run.
export const maxDuration = 300;

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Escaped plain text → HTML paragraphs (blank line = new paragraph). */
function messageToHtml(message: string): string {
  return message
    .split(/\r?\n\s*\r?\n/)
    .map((para) => `<p>${escapeHtml(para).replace(/\r?\n/g, "<br />")}</p>`)
    .join("");
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const isCron =
    process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date();

  // Run dates, hour_local and "already ran today" are all expressed on the
  // OWNING ORG's clock, and orgs don't share one — so none of it can be a SQL
  // filter. Fetch every live schedule and decide per row, after resolving
  // that org's timezone (getOrgTimeZone caches, so N schedules in one org
  // cost one lookup). At this table's size that is cheaper than the round
  // trips a per-org query would take.
  const { data: schedules, error } = await supabase
    .from("report_schedules")
    .select(
      "id, org_id, report_key, recipients, hour_local, last_run_at, frequency, weekdays, monthly_mode, month_day, month_week, month_weekday, start_date, end_date, format, email_subject, email_message"
    )
    .eq("enabled", true)
    .is("deleted_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type ScheduleRow = NonNullable<typeof schedules>[number];
  // Midnight today on each org's own calendar — the claim boundary. A
  // schedule whose last_run_at is at or after it already ran today (success
  // or a non-retryable error) and is skipped.
  const dayStartByOrg = new Map<string, string>();
  const due: ScheduleRow[] = [];
  const orgCanceled = createOrgOutboundMutedResolver(supabase);
  for (const schedule of schedules ?? []) {
    if (await orgCanceled(schedule.org_id)) continue; // canceled orgs get no scheduled report emails
    const tz = await getOrgTimeZone(supabase, schedule.org_id);
    if (!dayStartByOrg.has(schedule.org_id)) {
      dayStartByOrg.set(schedule.org_id, startOfTodayInZoneIso(now, tz));
    }
    if (!isDue(recurrenceFromRow(schedule), now, tz, schedule.last_run_at)) continue;
    due.push(schedule);
  }

  const orgNames = new Map<string, string | null>();
  const orgName = async (orgId: string): Promise<string | null> => {
    if (!orgNames.has(orgId)) {
      const { data } = await supabase.from("organizations").select("name").eq("id", orgId).maybeSingle();
      orgNames.set(orgId, data?.name ?? null);
    }
    return orgNames.get(orgId) ?? null;
  };

  const resend = new Resend(process.env.RESEND_API_KEY?.trim());
  let sent = 0;
  let failed = 0;

  for (const schedule of due) {
    const dayStart = dayStartByOrg.get(schedule.org_id)!;
    // Claim before sending: the conditional UPDATE only succeeds for a row
    // that still hasn't run today on its org's calendar, so an overlapping or
    // retried cron invocation, or two ticks in the same day, can't
    // double-send the same schedule's report.
    const { data: claimed } = await supabase
      .from("report_schedules")
      .update({ last_run_at: new Date().toISOString() })
      .eq("id", schedule.id)
      .eq("enabled", true)
      .is("deleted_at", null)
      .or(`last_run_at.is.null,last_run_at.lt.${dayStart}`)
      .select("id");
    if (!claimed?.length) continue;

    const def = getReport(schedule.report_key);
    if (!def || !def.schedulable || schedule.recipients.length === 0) {
      failed++;
      await supabase
        .from("report_schedules")
        .update({
          last_run_at: new Date().toISOString(),
          last_run_status: "error",
          last_run_error: !def
            ? `Unknown report key: ${schedule.report_key}`
            : !def.schedulable
              ? `Report is not schedulable: ${schedule.report_key}`
              : "No recipients configured",
        })
        .eq("id", schedule.id);
      continue;
    }

    const tz = await getOrgTimeZone(supabase, schedule.org_id);
    // Dates in the subject/body are on the ORG's calendar — the server runs
    // UTC, where an evening run reads as tomorrow.
    const orgDate = now.toLocaleDateString("en-US", { timeZone: tz });
    const orgDateTime = now.toLocaleString("en-US", { timeZone: tz });
    const format: ScheduledReportFormat = schedule.format === "xlsx" ? "xlsx" : "pdf";
    try {
      const rendered = await renderScheduledReport(supabase, def, schedule.org_id, format);
      // Header-safe: no CR/LF from a stored custom subject.
      const subject = (schedule.email_subject?.trim() || `${def.name} — ${orgDate}`).replace(/[\r\n]+/g, " ");
      const partialNote = rendered.truncated
        ? `<p><em>Partial report — only the first ${rendered.rowCount.toLocaleString("en-US")}` +
          (rendered.totalCount !== undefined ? ` of ${rendered.totalCount.toLocaleString("en-US")}` : "") +
          " matching rows are included. Open the report in the app for the full result.</em></p>"
        : "";
      const html =
        (schedule.email_message?.trim() ? messageToHtml(schedule.email_message.trim()) : "") +
        `<p>Attached: <strong>${escapeHtml(def.name)}</strong> (${format === "xlsx" ? "Excel" : "PDF"}), generated ${escapeHtml(orgDateTime)}.</p>` +
        partialNote;
      const { error: sendErr } = await sendEmailRetryingRateLimit(resend, {
        from: orgEmailFrom(await orgName(schedule.org_id)),
        to: schedule.recipients,
        subject,
        html,
        attachments: [
          {
            filename: rendered.filename,
            content: rendered.content.toString("base64"),
            ...(format === "xlsx" ? { contentType: XLSX_CONTENT_TYPE } : {}),
          },
        ],
      });
      if (sendErr) throw new Error(sendErr.message);
    } catch (err) {
      failed++;
      // Nothing was delivered: give the claim back (restore the prior
      // last_run_at) so the next hourly tick retries today, instead of the
      // claim stamp silently swallowing the day's report. The error is still
      // recorded for the schedules UI.
      await supabase
        .from("report_schedules")
        .update({
          last_run_at: schedule.last_run_at,
          last_run_status: "error",
          last_run_error: err instanceof Error ? err.message : "Unknown error",
        })
        .eq("id", schedule.id);
      continue;
    }

    sent++;
    await supabase
      .from("report_schedules")
      .update({
        last_run_at: new Date().toISOString(),
        last_run_status: "success",
        last_run_error: null,
        // A one-off is done once it has gone out.
        ...(schedule.frequency === "once" ? { enabled: false } : {}),
      })
      .eq("id", schedule.id);
  }

  return NextResponse.json({ sent, failed, total: schedules?.length ?? 0 });
}
