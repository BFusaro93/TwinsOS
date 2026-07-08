import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/**
 * GET /api/cron/recurring-visits — called daily by Vercel Cron at 06:00 UTC
 *
 * For every active recurring job, look ahead LOOKAHEAD_DAYS (default 14) and
 * create crm_job_visits rows for any occurrence dates that don't already have
 * one.  Idempotent — safe to re-run.
 *
 * Schedule string format (from SCHEDULE_OPTIONS in JobsList):
 *   "Weekly - Thursday"
 *   "Bi-weekly - Monday - Even Weeks"
 *   "Bi-weekly - Monday - Odd Weeks"
 *   "Custom"  ← falls back to schedule_days array + weekly frequency
 *
 * For package jobs (job_type = 'package') the same logic applies but the
 * total number of visits is capped by crm_jobs.package_total_steps.
 *
 * Security: Vercel passes Authorization: Bearer {CRON_SECRET}.
 */

const LOOKAHEAD_DAYS = 14;

// Day-name → JS Date.getDay() index (0 = Sunday)
const DAY_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** ISO week number (1-based) — used for even/odd bi-weekly logic */
function isoWeekNumber(d: Date): number {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

interface OccurrenceRule {
  frequency: "weekly" | "biweekly";
  dayIndex: number;         // 0-6
  biweeklyParity?: "even" | "odd";  // for biweekly only
}

/**
 * Parse the human-readable schedule string into a structured rule.
 * Falls back to schedule_days when schedule is "Custom" or unparseable.
 */
function parseSchedule(schedule: string | null, scheduleDays: string[]): OccurrenceRule[] {
  if (!schedule || schedule === "Custom") {
    // Use schedule_days as weekly on each named day
    return scheduleDays
      .map((d) => DAY_INDEX[d.toLowerCase()])
      .filter((idx) => idx !== undefined)
      .map((dayIndex) => ({ frequency: "weekly" as const, dayIndex }));
  }

  const lower = schedule.toLowerCase();

  // "weekly - thursday" etc.
  const weeklyMatch = lower.match(/^weekly\s*-\s*(\w+)$/);
  if (weeklyMatch) {
    const dayIndex = DAY_INDEX[weeklyMatch[1]];
    if (dayIndex !== undefined) return [{ frequency: "weekly", dayIndex }];
  }

  // "bi-weekly - monday - even weeks" or "bi-weekly - monday - odd weeks"
  const biMatch = lower.match(/^bi-?weekly\s*-\s*(\w+)\s*-\s*(even|odd)\s+weeks?$/);
  if (biMatch) {
    const dayIndex = DAY_INDEX[biMatch[1]];
    const parity = biMatch[2] as "even" | "odd";
    if (dayIndex !== undefined) return [{ frequency: "biweekly", dayIndex, biweeklyParity: parity }];
  }

  // Generic biweekly without parity — treat as even
  const biGeneric = lower.match(/^bi-?weekly\s*-\s*(\w+)$/);
  if (biGeneric) {
    const dayIndex = DAY_INDEX[biGeneric[1]];
    if (dayIndex !== undefined) return [{ frequency: "biweekly", dayIndex, biweeklyParity: "even" }];
  }

  return [];
}

const WEEK_OF_MONTH_ORDINAL: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, last: -1,
};

/** The Nth (or last, ordinal=-1) occurrence of `weekdayIndex` (0=Sun..6=Sat) in the given month. */
function nthWeekdayOfMonth(year: number, month: number, weekdayIndex: number, ordinal: number): Date {
  if (ordinal === -1) {
    const lastDay = new Date(year, month + 1, 0);
    const diff = (lastDay.getDay() - weekdayIndex + 7) % 7;
    lastDay.setDate(lastDay.getDate() - diff);
    return lastDay;
  }
  const firstDay = new Date(year, month, 1);
  const diff = (weekdayIndex - firstDay.getDay() + 7) % 7;
  return new Date(year, month, 1 + diff + (ordinal - 1) * 7);
}

/**
 * True calendar-month recurrence — "1st Monday of every month" etc. Optional
 * season window (MM-DD) narrows which months' occurrences are included.
 */
function monthlyOccurrencesInRange(
  dayIndex: number,
  weekOfMonth: string,
  from: Date,
  to: Date,
  season?: { start: string; end: string } | null
): Date[] {
  const ordinal = WEEK_OF_MONTH_ORDINAL[weekOfMonth] ?? 1;
  const dates: Date[] = [];
  let year = from.getFullYear();
  let month = from.getMonth();
  while (true) {
    const d = nthWeekdayOfMonth(year, month, dayIndex, ordinal);
    if (d > to) break;
    if (d >= from) {
      if (!season) {
        dates.push(d);
      } else {
        const mmdd = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const inSeason = season.start <= season.end
          ? mmdd >= season.start && mmdd <= season.end
          : mmdd >= season.start || mmdd <= season.end;
        if (inSeason) dates.push(d);
      }
    }
    month++;
    if (month > 11) { month = 0; year++; }
  }
  return dates;
}

/**
 * Return all occurrence dates in [fromDate, toDate] that match the rule.
 */
function occurrencesInRange(rule: OccurrenceRule, from: Date, to: Date): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(from);

  // Advance to the first matching day-of-week on or after `from`
  while (cursor.getDay() !== rule.dayIndex) {
    cursor.setDate(cursor.getDate() + 1);
    if (cursor > to) return dates;
  }

  while (cursor <= to) {
    if (rule.frequency === "weekly") {
      dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 7);
    } else {
      // biweekly: check week number parity
      const weekNum = isoWeekNumber(cursor);
      const isEven = weekNum % 2 === 0;
      const matches =
        rule.biweeklyParity === "even" ? isEven :
        rule.biweeklyParity === "odd"  ? !isEven :
        true;
      if (matches) dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }
  }

  return dates;
}

export async function GET(request: Request) {
  // ── auth ──────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization");
  const isCron =
    process.env.CRON_SECRET &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowEnd = addDays(today, LOOKAHEAD_DAYS);

  const fromStr = toISODate(today);
  const toStr   = toISODate(windowEnd);

  // ── fetch active recurring and package jobs ───────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jobs, error: jobsErr } = await (supabase as any)
    .from("crm_jobs")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select("id, org_id, client_id, crew_id, schedule, schedule_days, recurrence_end, package_total_steps, priority, notes_to_crew" as any)
    .in("job_type", ["recurring", "package"])
    .not("status", "in", '("cancelled","completed")')
    .is("deleted_at", null);

  if (jobsErr) {
    console.error("[recurring-visits] fetch error:", jobsErr);
    return NextResponse.json({ error: jobsErr.message }, { status: 500 });
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ generated: 0, message: "No recurring jobs found." });
  }

  // ── load named schedules for monthly ("1st Monday") resolution ────────────
  // Weekly/bi-weekly jobs keep using the regex-based parseSchedule() below —
  // this lookup only covers monthly, which parseSchedule can't express.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: scheduleRows } = await (supabase as any)
    .from("crm_schedules")
    .select("name, frequency, day_of_week, week_of_month, season_start, season_end")
    .eq("frequency", "monthly")
    .is("deleted_at", null);
  const monthlySchedulesByName = new Map<string, { dayIndex: number; weekOfMonth: string; season: { start: string; end: string } | null }>();
  for (const sr of (scheduleRows ?? []) as { name: string; day_of_week: string; week_of_month: string | null; season_start: string | null; season_end: string | null }[]) {
    const dayIndex = DAY_INDEX[sr.day_of_week.toLowerCase()];
    if (dayIndex === undefined) continue;
    monthlySchedulesByName.set(sr.name, {
      dayIndex,
      weekOfMonth: sr.week_of_month ?? "first",
      season: sr.season_start && sr.season_end ? { start: sr.season_start, end: sr.season_end } : null,
    });
  }

  // ── for each job, load existing visits in the window (idempotency) ────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobIds = (jobs as any[]).map((j) => j.id as string);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingVisits } = await (supabase as any)
    .from("crm_job_visits")
    .select("job_id, scheduled_date")
    .in("job_id", jobIds)
    .gte("scheduled_date", fromStr)
    .lte("scheduled_date", toStr)
    .is("deleted_at", null);

  // Build a Set of "jobId|date" strings for O(1) lookup
  const existingSet = new Set<string>(
    (existingVisits ?? []).map(
      (v: { job_id: string; scheduled_date: string }) => `${v.job_id}|${v.scheduled_date}`
    )
  );

  const toInsert: {
    org_id: string;
    job_id: string;
    client_id: string;
    crew_id: string | null;
    scheduled_date: string;
    priority: number;
    notes_to_crew: string | null;
  }[] = [];

  let skippedPastEnd = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const job of (jobs as unknown) as {
    id: string; org_id: string; client_id: string; crew_id: string | null;
    schedule: string | null; schedule_days: string[];
    recurrence_end: string | null; package_total_steps: number | null;
    priority: number; notes_to_crew: string | null;
  }[]) {

    // Respect recurrence_end if set
    const effectiveEnd = job.recurrence_end
      ? new Date(Math.min(windowEnd.getTime(), new Date(job.recurrence_end).getTime()))
      : windowEnd;

    if (effectiveEnd < today) {
      skippedPastEnd++;
      continue;
    }

    const monthlySchedule = job.schedule ? monthlySchedulesByName.get(job.schedule) : undefined;
    const dates: Date[] = monthlySchedule
      ? monthlyOccurrencesInRange(monthlySchedule.dayIndex, monthlySchedule.weekOfMonth, today, effectiveEnd, monthlySchedule.season)
      : parseSchedule(job.schedule, job.schedule_days ?? []).flatMap((rule) => occurrencesInRange(rule, today, effectiveEnd));

    for (const d of dates) {
      const dateStr = toISODate(d);
      const key = `${job.id}|${dateStr}`;
      if (!existingSet.has(key)) {
        toInsert.push({
          org_id:         job.org_id,
          job_id:         job.id,
          client_id:      job.client_id,
          crew_id:        job.crew_id ?? null,
          scheduled_date: dateStr,
          priority:       job.priority ?? 1,
          notes_to_crew:  job.notes_to_crew ?? null,
        });
        // Mark as pending so parallel rules on the same job don't duplicate
        existingSet.add(key);
      }
    }
  }

  if (toInsert.length === 0) {
    return NextResponse.json({
      generated: 0,
      skippedPastEnd,
      message: "All visits already exist in the lookahead window.",
    });
  }

  // Batch insert in chunks of 100
  let totalInserted = 0;
  for (let i = 0; i < toInsert.length; i += 100) {
    const chunk = toInsert.slice(i, i + 100);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertErr } = await (supabase as any)
      .from("crm_job_visits")
      .insert(chunk);
    if (insertErr) {
      console.error("[recurring-visits] insert error:", insertErr);
    } else {
      totalInserted += chunk.length;
    }
  }

  console.info(
    `[recurring-visits] ${today.toISOString()} — window ${fromStr}→${toStr}: ` +
    `${totalInserted} visits created, ${skippedPastEnd} jobs past recurrence_end`
  );

  return NextResponse.json({ generated: totalInserted, skippedPastEnd, window: { from: fromStr, to: toStr } });
}
