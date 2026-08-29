import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import type { Database } from "@/types/supabase";
import { getReport } from "@/lib/reports/registry";
import { renderScheduledReportPdf } from "@/lib/reports/run-scheduled";
import { EMAIL_FROM } from "@/lib/email/send";

/** Current hour (0-23) in America/New_York — the timezone every schedule's
 *  `hour_local` picker is expressed in. */
function currentHourEastern(): number {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false,
  }).format(new Date());
  // "24" shows up for midnight with hour12:false in some environments.
  return Number(hourStr) % 24;
}

/**
 * GET /api/cron/report-schedules — called hourly by a GitHub Actions
 * scheduled workflow (.github/workflows/report-schedules-cron.yml), NOT
 * Vercel Cron — the account is on Vercel's Hobby plan, which caps cron jobs
 * at once/day regardless of schedule string, so an hourly Vercel Cron entry
 * here would get silently throttled and the per-schedule hour picker
 * wouldn't be honored. See TASKS.md "Deferred — Vercel plan upgrade for
 * true hourly cron" for the full writeup; revisit if the plan changes.
 *
 * For every enabled `report_schedules` row whose `hour_local` (America/
 * New_York) matches the current hour: runs its report (scoped to that
 * schedule's org — see renderScheduledReportPdf), renders a PDF, and emails
 * it to the schedule's recipients. Only schedulable reports (a fixed date
 * window recomputed each run, e.g. "Yesterday", "Month to Date") make sense
 * here — the catalog enforces that at creation time, not this route.
 *
 * Security: the calling workflow passes Authorization: Bearer {CRON_SECRET}
 * (same secret Vercel's own cron jobs use, also set as a GitHub Actions
 * repo secret). Reject anything else.
 */
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

  const { data: schedules, error } = await supabase
    .from("report_schedules")
    .select("id, org_id, report_key, recipients")
    .eq("enabled", true)
    .eq("hour_local", currentHourEastern())
    .is("deleted_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY?.trim());
  let sent = 0;
  let failed = 0;

  // Start of the current UTC hour — since America/New_York is always a
  // whole-hour offset from UTC (even across DST), this also marks the start
  // of the current Eastern hour bucket that `hour_local` matches against.
  // Used to claim each schedule before sending, so an overlapping/retried
  // GitHub Actions run (not guaranteed exactly-once, and this workflow also
  // allows manual workflow_dispatch) can't double-send the same schedule's
  // report within the same hour.
  const hourStart = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000).toISOString();

  for (const schedule of schedules ?? []) {
    const { data: claimed } = await supabase
      .from("report_schedules")
      .update({ last_run_at: new Date().toISOString() })
      .eq("id", schedule.id)
      .or(`last_run_at.is.null,last_run_at.lt.${hourStart}`)
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

    try {
      const pdfBuffer = await renderScheduledReportPdf(supabase, def, schedule.org_id);
      const { error: sendErr } = await resend.emails.send({
        from: EMAIL_FROM,
        to: schedule.recipients,
        subject: `${def.name} — ${new Date().toLocaleDateString("en-US")}`,
        html: `<p>Attached: <strong>${def.name}</strong>, generated ${new Date().toLocaleString("en-US")}.</p>`,
        attachments: [
          {
            filename: `${def.name.replace(/[^a-z0-9-_ ]/gi, "").trim()}.pdf`,
            content: pdfBuffer.toString("base64"),
          },
        ],
      });
      if (sendErr) throw new Error(sendErr.message);

      sent++;
      await supabase
        .from("report_schedules")
        .update({ last_run_at: new Date().toISOString(), last_run_status: "success", last_run_error: null })
        .eq("id", schedule.id);
    } catch (err) {
      failed++;
      await supabase
        .from("report_schedules")
        .update({
          last_run_at: new Date().toISOString(),
          last_run_status: "error",
          last_run_error: err instanceof Error ? err.message : "Unknown error",
        })
        .eq("id", schedule.id);
    }
  }

  return NextResponse.json({ sent, failed, total: schedules?.length ?? 0 });
}
