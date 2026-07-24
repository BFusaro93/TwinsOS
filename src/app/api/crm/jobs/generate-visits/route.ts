import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const LOOKAHEAD_DAYS = 14;

const DAY_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function toISODate(d: Date): string { return d.toISOString().slice(0, 10); }
function isoWeekNumber(d: Date): number {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

interface OccurrenceRule {
  frequency: "weekly" | "biweekly";
  dayIndex: number;
  biweeklyParity?: "even" | "odd";
}

function parseSchedule(schedule: string | null, scheduleDays: string[]): OccurrenceRule[] {
  if (!schedule || schedule === "Custom") {
    return scheduleDays
      .map((d) => DAY_INDEX[d.toLowerCase()])
      .filter((idx) => idx !== undefined)
      .map((dayIndex) => ({ frequency: "weekly" as const, dayIndex }));
  }
  const lower = schedule.toLowerCase();
  // Match both "weekly - monday" and "weekly monday" formats
  const weeklyMatch = lower.match(/^weekly\s*(?:-\s*)?(\w+)$/);
  if (weeklyMatch) {
    const dayIndex = DAY_INDEX[weeklyMatch[1]];
    if (dayIndex !== undefined) return [{ frequency: "weekly", dayIndex }];
  }
  const biMatch = lower.match(/^bi-?weekly\s*(?:-\s*)?(\w+)\s*(?:-\s*)?(even|odd)\s+weeks?$/);
  if (biMatch) {
    const dayIndex = DAY_INDEX[biMatch[1]];
    const parity = biMatch[2] as "even" | "odd";
    if (dayIndex !== undefined) return [{ frequency: "biweekly", dayIndex, biweeklyParity: parity }];
  }
  const biGeneric = lower.match(/^bi-?weekly\s*(?:-\s*)?(\w+)$/);
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

/** True calendar-month recurrence — "1st Monday of every month" etc. */
function monthlyOccurrencesInRange(dayIndex: number, weekOfMonth: string, from: Date, to: Date): Date[] {
  const ordinal = WEEK_OF_MONTH_ORDINAL[weekOfMonth] ?? 1;
  const dates: Date[] = [];
  let year = from.getFullYear();
  let month = from.getMonth();
  while (true) {
    const d = nthWeekdayOfMonth(year, month, dayIndex, ordinal);
    if (d > to) break;
    if (d >= from) dates.push(d);
    month++;
    if (month > 11) { month = 0; year++; }
  }
  return dates;
}

function occurrencesInRange(rule: OccurrenceRule, from: Date, to: Date): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(from);
  while (cursor.getDay() !== rule.dayIndex) {
    cursor.setDate(cursor.getDate() + 1);
    if (cursor > to) return dates;
  }
  while (cursor <= to) {
    if (rule.frequency === "weekly") {
      dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 7);
    } else {
      const weekNum = isoWeekNumber(cursor);
      const isEven = weekNum % 2 === 0;
      const matches = rule.biweeklyParity === "even" ? isEven : rule.biweeklyParity === "odd" ? !isEven : true;
      if (matches) dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }
  }
  return dates;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any).from("profiles").select("org_id").eq("id", user.id).single();
  const sessionOrgId: string | null = (profile as any)?.org_id ?? null;

  const body = await request.json() as { jobId: string; lookaheadDays?: number };
  const { jobId, lookaheadDays = LOOKAHEAD_DAYS } = body;
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: job, error: jobErr } = // eslint-disable-next-line @typescript-eslint/no-explicit-any
await (supabase as any).from("crm_jobs").select("*" as any).eq("id", jobId).single();
  if (jobErr || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  // Generate only through the end of the current calendar year — visits are
  // regenerated each year so customers who don't renew are never pre-scheduled.
  const yearEnd = new Date(today.getFullYear(), 11, 31);
  const windowEnd = yearEnd;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobAny = job as any;

  // Package jobs don't recur on a weekly/monthly rule — each numbered visit
  // has its own fixed date already resolved onto crm_job_services (from the
  // package's visit schedule). Generate directly from those dates instead of
  // the day-of-week logic below, which package jobs never populate.
  if (jobAny.job_type === "package") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: jobServices } = await (supabase as any)
      .from("crm_job_services")
      .select("id, start_date")
      .eq("job_id", jobId);

    const dated = (jobServices ?? []).filter(
      (s: { id: string; start_date: string | null }): s is { id: string; start_date: string } => !!s.start_date
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingVisits } = await (supabase as any)
      .from("crm_job_visits")
      .select("job_service_id, scheduled_date")
      .eq("job_id", jobId)
      .is("deleted_at", null);
    // Visits created before job_service_id existed only have a date to dedupe
    // against — keep checking dates too so re-running this doesn't double them up.
    const existingServiceIds = new Set(
      (existingVisits ?? []).map((v: { job_service_id: string | null }) => v.job_service_id).filter(Boolean)
    );
    const existingDates = new Set((existingVisits ?? []).map((v: { scheduled_date: string }) => v.scheduled_date));

    const toInsert = dated
      .filter((s: { id: string; start_date: string }) => !existingServiceIds.has(s.id) && !existingDates.has(s.start_date))
      .map((s: { id: string; start_date: string }) => ({
        job_id: jobId, client_id: jobAny.client_id,
        crew_id: jobAny.crew_id ?? null, scheduled_date: s.start_date,
        job_service_id: s.id,
        priority: jobAny.priority ?? 1, notes_to_crew: jobAny.notes_to_crew ?? null,
      }));

    if (toInsert.length === 0) {
      return NextResponse.json({ generated: 0, message: "All visits already exist." });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertErr } = await (supabase as any).from("crm_job_visits").insert(toInsert as any);
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    return NextResponse.json({ generated: toInsert.length });
  }

  // For recurring jobs: start generating from the job's scheduled_date (the "start recurring" date)
  // if it's in the future; otherwise start from today.
  const jobStartDate = jobAny.scheduled_date
    ? new Date(jobAny.scheduled_date + 'T00:00:00')
    : today;
  const windowStart = jobStartDate > today ? jobStartDate : today;

  const fromStr = toISODate(windowStart);
  const toStr   = toISODate(windowEnd);

  const effectiveEnd = jobAny.recurrence_end
    ? new Date(Math.min(windowEnd.getTime(), new Date(jobAny.recurrence_end as string).getTime()))
    : windowEnd;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from("crm_job_visits")
    .select("scheduled_date")
    .eq("job_id", jobId)
    .gte("scheduled_date", fromStr)
    .lte("scheduled_date", toStr)
    .is("deleted_at", null);


  const existingSet = new Set((existing ?? []).map((v: { scheduled_date: string }) => v.scheduled_date));

  const j = jobAny as {
    org_id: string | null; client_id: string; crew_id: string | null;
    schedule: string | null; schedule_days: string[];
    priority: number; notes_to_crew: string | null;
  };
  // Jobs created via browser client may not have org_id populated; fall back to session org.
  const effectiveOrgId: string | null = j.org_id ?? sessionOrgId;

  // Try to resolve the schedule from the crm_schedules table using the stored name.
  // This avoids fragile regex parsing of user-defined schedule names.
  // Note: RLS scopes to the authenticated user's org; we don't filter by org_id here
  // because crm_jobs.org_id may be null for jobs created via the browser client.
  let rules: OccurrenceRule[] = [];
  let monthlyDates: Date[] = [];
  let seasonFilter: { start: string; end: string } | null = null;
  if (j.schedule) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: scheduleRow } = await (supabase as any)
      .from("crm_schedules")
      .select("frequency, day_of_week, season_start, season_end, week_of_month")
      .eq("name", j.schedule)
      .is("deleted_at", null)
      .maybeSingle();

    if (scheduleRow) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sr = scheduleRow as any;
      const dayIndex = DAY_INDEX[(sr.day_of_week as string).toLowerCase()];
      if (dayIndex !== undefined) {
        const freq = (sr.frequency as string).toLowerCase();
        if (freq === "weekly") {
          rules = [{ frequency: "weekly", dayIndex }];
        } else if (freq === "bi_weekly" || freq === "biweekly") {
          rules = [{ frequency: "biweekly", dayIndex, biweeklyParity: "even" }];
        } else if (freq === "every_3_weeks") {
          rules = [{ frequency: "biweekly", dayIndex, biweeklyParity: "even" }];
        } else if (freq === "monthly") {
          monthlyDates = monthlyOccurrencesInRange(dayIndex, sr.week_of_month ?? "first", windowStart, effectiveEnd);
        }
        // every_4_weeks: fall through to name-based parsing below
      }

      // Narrow the generation window to the schedule's season (MM-DD format).
      // Season applies per-calendar-year — e.g. "05-01" to "11-01" means only
      // generate visits that fall within that month/day range each year.
      const seasonStart: string | null = sr.season_start ?? null;
      const seasonEnd: string | null   = sr.season_end ?? null;
      if (seasonStart && seasonEnd) {
        seasonFilter = { start: seasonStart, end: seasonEnd };
      }
    }
  }

  // Fall back to name-based parsing if schedule record not found
  if (rules.length === 0 && monthlyDates.length === 0) {
    rules = parseSchedule(j.schedule, j.schedule_days ?? []);
  }
  const toInsert: object[] = [];
  const allOccurrences = [...rules.flatMap((rule) => occurrencesInRange(rule, windowStart, effectiveEnd)), ...monthlyDates];

  for (const d of allOccurrences) {
    const dateStr = toISODate(d);
    if (existingSet.has(dateStr)) continue;

    // Apply season window: only generate visits whose MM-DD falls within the season.
    if (seasonFilter) {
      const mmdd = dateStr.slice(5); // "MM-DD"
      const inSeason = seasonFilter.start <= seasonFilter.end
        ? mmdd >= seasonFilter.start && mmdd <= seasonFilter.end
        : mmdd >= seasonFilter.start || mmdd <= seasonFilter.end; // wraps year boundary
      if (!inSeason) continue;
    }

    toInsert.push({
      job_id: jobId, client_id: j.client_id,
      crew_id: j.crew_id ?? null, scheduled_date: dateStr,
      priority: j.priority ?? 1, notes_to_crew: j.notes_to_crew ?? null,
    });
    existingSet.add(dateStr);
  }

  if (toInsert.length === 0) {
    return NextResponse.json({ generated: 0, message: "All visits already exist in window." });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertErr } = // eslint-disable-next-line @typescript-eslint/no-explicit-any
await (supabase as any).from("crm_job_visits").insert(toInsert as any);
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  return NextResponse.json({ generated: toInsert.length, window: { from: fromStr, to: toStr } });
}
