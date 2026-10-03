import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import type { Database } from "@/types/supabase";
import { getReport } from "@/lib/reports/registry";
import { renderScheduledReportPdf } from "@/lib/reports/run-scheduled";
import { EMAIL_FROM } from "@/lib/email/send";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { hourInZone, startOfTodayInZoneIso } from "@/lib/time/zone";

/**
 * GET /api/cron/report-schedules — called hourly by Vercel Cron (see
 * vercel.json). Previously driven by a GitHub Actions workflow instead,
 * because the account was on Vercel's Hobby plan, which caps cron jobs at
 * once/day regardless of schedule string; moved back to native Vercel Cron
 * after the 2026-09 upgrade to Pro (see TASKS.md "Deferred — Vercel plan
 * upgrade for true hourly cron").
 *
 * For every enabled `report_schedules` row whose `hour_local` is at or before
 * the current hour IN THAT SCHEDULE'S OWN ORG TIMEZONE, and that hasn't
 * already run today on that org's calendar: runs its report (scoped to that schedule's org — see
 * renderScheduledReportPdf), renders a PDF, and emails it to the schedule's
 * recipients. "At or before" rather than "equal to" because the scheduler
 * can fire a few minutes late — an exact hour match would then skip that
 * day's send entirely and silently. The "not already run today" check is
 * what keeps this to one send per day. Only schedulable reports (a fixed
 * date window recomputed each run, e.g. "Yesterday", "Month to Date") make
 * sense here — the catalog enforces that at creation time, not this route.
 *
 * Security: Vercel passes Authorization: Bearer {CRON_SECRET}. Reject
 * anything else.
 */
// Renders PDFs and sends email for every due schedule in one run.
export const maxDuration = 300;

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

  // hour_local and "already ran today" are both expressed on the OWNING ORG's
  // clock, and orgs no longer share one — so neither can be a SQL filter any
  // more. Fetch every live schedule and decide per row, after resolving that
  // org's timezone (getOrgTimeZone caches, so N schedules in one org cost one
  // lookup). At this table's size that is cheaper than the round trips a
  // per-org query would take.
  const { data: schedules, error } = await supabase
    .from("report_schedules")
    .select("id, org_id, report_key, recipients, hour_local, last_run_at")
    .eq("enabled", true)
    .is("deleted_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Midnight today on each org's own calendar. A schedule whose last_run_at is
  // at or after its org's dayStart already ran today (success or error — an
  // errored run is not retried until tomorrow, same as before) and is skipped.
  const dayStartByOrg = new Map<string, string>();
  const due: { id: string; org_id: string; report_key: string; recipients: string[]; last_run_at: string | null }[] = [];
  for (const schedule of schedules ?? []) {
    const tz = await getOrgTimeZone(supabase, schedule.org_id);
    if (!dayStartByOrg.has(schedule.org_id)) {
      dayStartByOrg.set(schedule.org_id, startOfTodayInZoneIso(now, tz));
    }
    const dayStart = dayStartByOrg.get(schedule.org_id)!;
    if (hourInZone(now, tz) < schedule.hour_local) continue;
    if (schedule.last_run_at && schedule.last_run_at >= dayStart) continue;
    due.push(schedule);
  }

  const resend = new Resend(process.env.RESEND_API_KEY?.trim());
  let sent = 0;
  let failed = 0;

  for (const schedule of due) {
    const dayStart = dayStartByOrg.get(schedule.org_id)!;
    // Claim before sending: the conditional UPDATE only succeeds for a row
    // that still hasn't run today, so an overlapping/retried GitHub Actions
    // run (not guaranteed exactly-once, and this workflow also allows manual
    // workflow_dispatch) or two hourly ticks in the same day can't
    // double-send the same schedule's report.
    const { data: claimed } = await supabase
      .from("report_schedules")
      .update({ last_run_at: new Date().toISOString() })
      .eq("id", schedule.id)
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
    try {
      const pdfBuffer = await renderScheduledReportPdf(supabase, def, schedule.org_id);
      const { error: sendErr } = await resend.emails.send({
        from: EMAIL_FROM,
        to: schedule.recipients,
        subject: `${def.name} — ${orgDate}`,
        html: `<p>Attached: <strong>${def.name}</strong>, generated ${orgDateTime}.</p>`,
        attachments: [
          {
            filename: `${def.name.replace(/[^a-z0-9-_ ]/gi, "").trim()}.pdf`,
            content: pdfBuffer.toString("base64"),
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
      .update({ last_run_at: new Date().toISOString(), last_run_status: "success", last_run_error: null })
      .eq("id", schedule.id);
  }

  return NextResponse.json({ sent, failed, total: schedules?.length ?? 0 });
}
