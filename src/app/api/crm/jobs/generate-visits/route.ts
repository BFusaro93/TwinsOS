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
  const weeklyMatch = lower.match(/^weekly\s*-\s*(\w+)$/);
  if (weeklyMatch) {
    const dayIndex = DAY_INDEX[weeklyMatch[1]];
    if (dayIndex !== undefined) return [{ frequency: "weekly", dayIndex }];
  }
  const biMatch = lower.match(/^bi-?weekly\s*-\s*(\w+)\s*-\s*(even|odd)\s+weeks?$/);
  if (biMatch) {
    const dayIndex = DAY_INDEX[biMatch[1]];
    const parity = biMatch[2] as "even" | "odd";
    if (dayIndex !== undefined) return [{ frequency: "biweekly", dayIndex, biweeklyParity: parity }];
  }
  const biGeneric = lower.match(/^bi-?weekly\s*-\s*(\w+)$/);
  if (biGeneric) {
    const dayIndex = DAY_INDEX[biGeneric[1]];
    if (dayIndex !== undefined) return [{ frequency: "biweekly", dayIndex, biweeklyParity: "even" }];
  }
  return [];
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

  const body = await request.json() as { jobId: string; lookaheadDays?: number };
  const { jobId, lookaheadDays = LOOKAHEAD_DAYS } = body;
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: job, error: jobErr } = // eslint-disable-next-line @typescript-eslint/no-explicit-any
await (supabase as any).from("crm_jobs").select("*" as any).eq("id", jobId).single();
  if (jobErr || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const windowEnd = addDays(today, lookaheadDays);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobAny = job as any;

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
    org_id: string; client_id: string; crew_id: string | null;
    schedule: string | null; schedule_days: string[];
    priority: number; notes_to_crew: string | null;
  };

  // Try to resolve the schedule from the crm_schedules table using the stored name.
  // This avoids fragile regex parsing of user-defined schedule names.
  let rules: OccurrenceRule[] = [];
  if (j.schedule) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: scheduleRow } = await (supabase as any)
      .from("crm_schedules")
      .select("frequency, day_of_week")
      .eq("org_id", j.org_id)
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
          // Approximate as biweekly — 3-week cadence not natively supported yet
          rules = [{ frequency: "biweekly", dayIndex, biweeklyParity: "even" }];
        }
        // every_4_weeks / monthly: fall through to name-based parsing below
      }
    }
  }

  // Fall back to name-based parsing if schedule record not found
  if (rules.length === 0) {
    rules = parseSchedule(j.schedule, j.schedule_days ?? []);
  }
  const toInsert: object[] = [];

  for (const rule of rules) {
    for (const d of occurrencesInRange(rule, windowStart, effectiveEnd)) {
      const dateStr = toISODate(d);
      if (!existingSet.has(dateStr)) {
        toInsert.push({
          org_id: j.org_id, job_id: jobId, client_id: j.client_id,
          crew_id: j.crew_id ?? null, scheduled_date: dateStr,
          priority: j.priority ?? 1, notes_to_crew: j.notes_to_crew ?? null,
          budgeted_hours: (jobAny.budgeted_hours ?? null),
          rate_cents: (jobAny.rate_cents ?? null),
        });
        existingSet.add(dateStr);
      }
    }
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
