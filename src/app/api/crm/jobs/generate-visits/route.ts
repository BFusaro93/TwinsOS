import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const LOOKAHEAD_DAYS = 14;
/** Hard cap on visits inserted per call — a weekly job through year end is
 *  ~52, so this only trips on a mis-configured schedule/end date. */
const MAX_VISITS_PER_RUN = 60;

const DAY_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
// Every date this route builds (today.setHours(0,0,0,0), `new Date(str +
// 'T00:00:00')`, `new Date(year, month, d)`) is constructed at LOCAL
// midnight — .toISOString() converts through UTC, which only happens to
// coincide with the local date on a server whose TZ is UTC (true on
// Vercel, not necessarily true for local dev or any other runtime). A
// server west of UTC would format every generated visit one day early.
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isoWeekNumber(d: Date): number {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

interface OccurrenceRule {
  frequency: "weekly" | "biweekly" | "everyNWeeks";
  dayIndex: number;
  biweeklyParity?: "even" | "odd";
  /** For "everyNWeeks" — the cadence in weeks (3, 4, ...). */
  intervalWeeks?: number;
  /** For "everyNWeeks" — a stable reference date the interval counts from
   *  (the job's own recurrence start date), so the cadence doesn't drift
   *  depending on when this route happens to be called. Falls back to the
   *  first candidate date in the generation window if unavailable. */
  anchorDate?: Date | null;
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
  // For "every N weeks", anchor the phase to a stable reference date (the
  // job's own recurrence start) rather than `from` (the generation
  // window's start, which shifts every time this route runs) — otherwise
  // repeated calls would reset the cadence instead of continuing it.
  const anchor = rule.anchorDate ?? new Date(cursor);
  while (anchor.getDay() !== rule.dayIndex) anchor.setDate(anchor.getDate() + 1);

  while (cursor <= to) {
    if (rule.frequency === "weekly") {
      dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 7);
    } else if (rule.frequency === "everyNWeeks" && rule.intervalWeeks) {
      const diffWeeks = Math.round((cursor.getTime() - anchor.getTime()) / (7 * 86_400_000));
      const matches = ((diffWeeks % rule.intervalWeeks) + rule.intervalWeeks) % rule.intervalWeeks === 0;
      if (matches) dates.push(new Date(cursor));
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
  if ((job as { status?: string }).status === "hold") {
    return NextResponse.json({ generated: 0, message: "Job is on hold." });
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobAny = job as any;

  // Generate through the job's own end date when it has one (the dialog's
  // optional "End date" → crm_jobs.recurrence_end; MAX_VISITS_PER_RUN still
  // caps a runaway window). Otherwise only through the end of the current
  // calendar year — visits are regenerated each year so customers who don't
  // renew are never pre-scheduled. recurrence_end is a date-only column, so
  // parse at LOCAL midnight (see toISODate); `new Date("YYYY-MM-DD")` is UTC
  // and would drop the final day's visit west of UTC.
  const yearEnd = new Date(today.getFullYear(), 11, 31);
  const recurrenceEnd: Date | null = jobAny.recurrence_end
    ? new Date((jobAny.recurrence_end as string) + 'T00:00:00')
    : null;
  const windowEnd = recurrenceEnd ?? yearEnd;

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
        men_count: Math.max(1, Number(jobAny.man_count ?? 1) || 1),
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

  // For recurring jobs: start generating from the job's "start recurring" date
  // (NewJobDialog stores it as recurrence_start / start_date_window, the
  // estimate-convert flow as scheduled_date) if it's in the future; otherwise today.
  const recurringStart: string | null =
    jobAny.scheduled_date ?? jobAny.recurrence_start ?? jobAny.start_date_window ?? null;
  const jobStartDate = recurringStart
    ? new Date(recurringStart + 'T00:00:00')
    : today;
  const windowStart = jobStartDate > today ? jobStartDate : today;

  const fromStr = toISODate(windowStart);
  const toStr   = toISODate(windowEnd);

  const effectiveEnd = windowEnd;
  if (effectiveEnd < windowStart) {
    return NextResponse.json({ generated: 0, message: "Job's end date has passed — nothing to generate." });
  }
  const menCount: number = Math.max(1, Number(jobAny.man_count ?? 1) || 1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from("crm_job_visits")
    .select("scheduled_date, job_service_id, clocked_in_at")
    .eq("job_id", jobId)
    .gte("scheduled_date", fromStr)
    .lte("scheduled_date", toStr)
    .is("deleted_at", null);

  // Per-(date, service) dedupe so a multi-service job can generate one visit
  // per service per date without re-running this endless times. A date with
  // an existing UNLINKED visit (a legacy combined visit, or one manually
  // added via the crew-facing "Add Visit" dialog without picking a service)
  // is skipped entirely rather than layering per-service visits on top of
  // it — and a date already clocked in is left alone so a mid-day
  // regeneration can't insert a new row into a stop that's already running.
  const existingDateServiceKeys = new Set<string>();
  const datesWithUnlinkedVisit = new Set<string>();
  const datesAlreadyStarted = new Set<string>();
  for (const row of (existing ?? []) as { scheduled_date: string; job_service_id: string | null; clocked_in_at: string | null }[]) {
    if (row.clocked_in_at) datesAlreadyStarted.add(row.scheduled_date);
    if (row.job_service_id) existingDateServiceKeys.add(`${row.scheduled_date}|${row.job_service_id}`);
    else datesWithUnlinkedVisit.add(row.scheduled_date);
  }

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
          // Was mapped to a 14-day (biweekly) cadence instead of 21 days —
          // "every 3 weeks" was silently firing every 2 weeks.
          rules = [{ frequency: "everyNWeeks", dayIndex, intervalWeeks: 3, anchorDate: jobStartDate }];
        } else if (freq === "every_4_weeks") {
          // Previously fell through to name-based parsing, which has no
          // pattern for this name and produced zero rules (silently 0
          // visits generated) — a real, selectable schedule option.
          rules = [{ frequency: "everyNWeeks", dayIndex, intervalWeeks: 4, anchorDate: jobStartDate }];
        } else if (freq === "monthly") {
          monthlyDates = monthlyOccurrencesInRange(dayIndex, sr.week_of_month ?? "first", windowStart, effectiveEnd);
        }
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

  // Recurring visits otherwise never link to a service at all (unlike
  // package visits, which always do) — but when a date is unambiguous
  // (zero or one active service), link it the same way, so per-visit
  // budget/actual reporting doesn't depend on whether a visit came from
  // this auto-generator or the manual "Add Visit" dialog (which lets you
  // pick a service). A job with 2+ services generates one visit PER
  // SERVICE per date instead of one combined visit — mirroring the package
  // branch above and the per-service split useCreateClientJob already does
  // for a job's very first day — so per-service reports stay accurate for
  // the common case of a crew doing multiple services in one stop.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recurringServices } = await (supabase as any)
    .from("crm_job_services")
    .select("id, sort_order, included, start_recurring")
    .eq("job_id", jobId)
    .order("sort_order");
  const activeServices = ((recurringServices ?? []) as { id: string; included: boolean | null; start_recurring: string | null }[])
    .filter((s) => s.included !== false);

  const toInsert: object[] = [];
  const allOccurrences = [...rules.flatMap((rule) => occurrencesInRange(rule, windowStart, effectiveEnd)), ...monthlyDates];

  for (const d of allOccurrences) {
    const dateStr = toISODate(d);
    if (datesWithUnlinkedVisit.has(dateStr) || datesAlreadyStarted.has(dateStr)) continue;

    // Apply season window: only generate visits whose MM-DD falls within the season.
    if (seasonFilter) {
      const mmdd = dateStr.slice(5); // "MM-DD"
      const inSeason = seasonFilter.start <= seasonFilter.end
        ? mmdd >= seasonFilter.start && mmdd <= seasonFilter.end
        : mmdd >= seasonFilter.start || mmdd <= seasonFilter.end; // wraps year boundary
      if (!inSeason) continue;
    }

    if (activeServices.length === 0) {
      toInsert.push({
        job_id: jobId, client_id: j.client_id,
        crew_id: j.crew_id ?? null, scheduled_date: dateStr,
        job_service_id: null, men_count: menCount,
        priority: j.priority ?? 1, notes_to_crew: j.notes_to_crew ?? null,
      });
      continue;
    }

    for (const svc of activeServices) {
      if (svc.start_recurring && dateStr < svc.start_recurring) continue;
      const key = `${dateStr}|${svc.id}`;
      if (existingDateServiceKeys.has(key)) continue;
      toInsert.push({
        job_id: jobId, client_id: j.client_id,
        crew_id: j.crew_id ?? null, scheduled_date: dateStr,
        job_service_id: svc.id, men_count: menCount,
        priority: j.priority ?? 1, notes_to_crew: j.notes_to_crew ?? null,
      });
      existingDateServiceKeys.add(key);
    }
    if (toInsert.length >= MAX_VISITS_PER_RUN) break;
  }

  if (toInsert.length === 0) {
    return NextResponse.json({ generated: 0, message: "All visits already exist in window." });
  }
  if (toInsert.length > MAX_VISITS_PER_RUN) toInsert.length = MAX_VISITS_PER_RUN;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertErr } = // eslint-disable-next-line @typescript-eslint/no-explicit-any
await (supabase as any).from("crm_job_visits").insert(toInsert as any);
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  return NextResponse.json({ generated: toInsert.length, window: { from: fromStr, to: toStr } });
}
