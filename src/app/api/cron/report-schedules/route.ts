import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import type { Database } from "@/types/supabase";
import { getReport } from "@/lib/reports/registry";
import { renderScheduledReportPdf } from "@/lib/reports/run-scheduled";
import { EMAIL_FROM } from "@/lib/email/send";

const EASTERN_TZ = "America/New_York";

/** Wall-clock parts of `d` as they read in America/New_York. */
function easternParts(d: Date): { year: number; month: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  // "24" shows up for midnight with hour12:false in some environments.
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24 };
}

/** Current hour (0-23) in America/New_York — the timezone every schedule's
 *  `hour_local` picker is expressed in. */
function currentHourEastern(now: Date): number {
  return easternParts(now).hour;
}

/** UTC offset (ms) America/New_York is at instant `d` (negative — behind UTC). */
function easternOffsetMs(d: Date): number {
  const p = easternParts(d);
  const minuteSecond = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TZ,
    minute: "numeric",
    second: "numeric",
  }).formatToParts(d);
  const get = (type: string) => Number(minuteSecond.find((x) => x.type === type)?.value ?? "0");
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, get("minute"), get("second"), d.getUTCMilliseconds());
  return wall - d.getTime();
}

/** ISO instant of midnight (start of today) in America/New_York. The offset
 *  is re-derived at the midnight guess itself so DST-transition days (the
 *  offset changes at 2 AM local) still land on the true local midnight. */
function startOfTodayEasternIso(now: Date): string {
  const { year, month, day } = easternParts(now);
  const wallMidnight = Date.UTC(year, month - 1, day);
  const guess = new Date(wallMidnight - easternOffsetMs(now));
  return new Date(wallMidnight - easternOffsetMs(guess)).toISOString();
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
 * New_York) is at or before the current hour AND that hasn't already run
 * today (Eastern): runs its report (scoped to that schedule's org — see
 * renderScheduledReportPdf), renders a PDF, and emails it to the schedule's
 * recipients. "At or before" rather than "equal to" because GitHub's
 * scheduler routinely fires minutes (occasionally an hour+) late — an exact
 * hour match would then skip that day's send entirely and silently. The
 * "not already run today" check is what keeps this to one send per day.
 * Only schedulable reports (a fixed date window recomputed each run, e.g.
 * "Yesterday", "Month to Date") make sense here — the catalog enforces that
 * at creation time, not this route.
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

  const now = new Date();
  // Midnight today in America/New_York. A schedule whose last_run_at is at or
  // after this already ran today (success or error — an errored run is not
  // retried until tomorrow, same as before) and is skipped.
  const dayStart = startOfTodayEasternIso(now);

  const { data: schedules, error } = await supabase
    .from("report_schedules")
    .select("id, org_id, report_key, recipients")
    .eq("enabled", true)
    .lte("hour_local", currentHourEastern(now))
    .is("deleted_at", null)
    .or(`last_run_at.is.null,last_run_at.lt.${dayStart}`);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY?.trim());
  let sent = 0;
  let failed = 0;

  for (const schedule of schedules ?? []) {
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
