import { SCHEDULING_KEYS, rejectWithoutSchedulingPermission } from "@/lib/auth/scheduling-permission";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import {
  GENERATOR_JOB_COLUMNS,
  NON_GENERATING_JOB_STATUSES,
  generateVisitsForJobs,
  loadSchedulesByOrg,
  type GeneratorJob,
} from "@/lib/visits/generate";
import {
  SCHEDULE_CHANGE_PRUNE_STATUSES,
  findUntouchedFutureVisits,
  pruneVisits,
  rescheduleKeepDates,
} from "@/lib/visits/prune";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";

/** Default rolling horizon — a year ahead, bounded by the job's own
 *  recurrence_end and its schedule's season window. The daily cron keeps
 *  extending it, so there is no calendar-year cap. */
const DEFAULT_LOOKAHEAD_DAYS = 365;
/** Hard cap on visits inserted per call — only trips on a mis-configured job. */
const MAX_VISITS_PER_RUN = 400;

const Body = z.object({
  jobId: z.string().uuid(),
  lookaheadDays: z.number().int().min(1).max(730).optional(),
  /**
   * generate           — top up missing visits (default)
   * preview_reschedule — how many untouched future visits a schedule edit would remove
   * reschedule         — remove those visits, then regenerate on the job's (saved) schedule
   *
   * Both are a DIFF: an untouched visit on a date the new rules still produce
   * is kept as is; only dates the new rules drop are removed.
   */
  action: z.enum(["generate", "preview_reschedule", "reschedule"]).optional(),
  /** schedule / schedule_days / recurrence_start changed → replace ALL untouched future visits. */
  scheduleChanged: z.boolean().optional(),
  /** preview only: the pending recurrence_end (reschedule reads the saved one). */
  recurrenceEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  /** preview only: the pending schedule name / days / start (undefined = unchanged). */
  schedule: z.string().max(200).nullable().optional(),
  scheduleDays: z.array(z.string().max(20)).max(7).optional(),
  recurrenceStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  /** reschedule only: the job's start date BEFORE this edit. New Job copies the
   *  start onto each service's start_recurring; services still on that old
   *  start follow the job to its new one (otherwise an earlier start date
   *  would generate nothing before the old one). */
  previousStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // A project-type job may also be scheduled with Add/Modify Projects (the key
  // that lets its holder create the job); checked once the job is loaded.
  const canSchedule = await hasAnySettingsPermission(supabase, SCHEDULING_KEYS);
  if (!canSchedule) {
    const denied = await rejectWithoutSchedulingPermission(supabase, ["sched_add_modify_projects"]);
    if (denied) return denied;
  }

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "jobId required" }, { status: 400 });
  const { jobId, lookaheadDays = DEFAULT_LOOKAHEAD_DAYS, action = "generate", scheduleChanged = false } = parsed.data;

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (profile) profile.org_id = (await getEffectiveOrgId(supabase)) ?? profile.org_id;
  const sessionOrgId: string | null = profile?.org_id ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: job, error: jobErr } = await (supabase as any)
    .from("crm_jobs")
    .select(GENERATOR_JOB_COLUMNS)
    .eq("id", jobId)
    .is("deleted_at", null)
    .single();
  if (jobErr || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const j = job as GeneratorJob;
  if (!canSchedule && j.job_type !== "project") {
    return NextResponse.json({ error: "You do not have permission to change the schedule" }, { status: 403 });
  }

  // The job is fetched under the caller's RLS, so the session org is its org.
  const orgId = j.org_id ?? sessionOrgId;
  const today = todayInZone(await getOrgTimeZone(supabase, orgId));

  // ── schedule-change pruning ───────────────────────────────────────────────
  // Untouched = status 'scheduled', never clocked in, not invoiced, on/after
  // the org's today, and not moved by hand (same rule as Settings →
  // Schedules). A schedule change removes the ones whose date the new rules
  // no longer produce (the rest keep their crew, time and notes); a shortened
  // end date only removes the ones past the new end.
  const pruneScope = async (rulesJob: GeneratorJob) => {
    const endDate = rulesJob.recurrence_end;
    if (!scheduleChanged && !endDate) return null;
    const { byOrg, error } = await loadSchedulesByOrg(supabase, orgId ? [orgId] : []);
    if (error) throw new Error(error);
    const keepDates = rescheduleKeepDates(rulesJob, byOrg.get(orgId ?? "") ?? new Map(), today);
    return scheduleChanged
      ? { fromDate: today, statuses: SCHEDULE_CHANGE_PRUNE_STATUSES, skipMoved: true, keepDates }
      : { fromDate: today, afterDate: endDate, statuses: SCHEDULE_CHANGE_PRUNE_STATUSES, skipMoved: true, keepDates };
  };

  if (action === "preview_reschedule") {
    // The edit isn't saved yet: evaluate the PENDING schedule / days / dates.
    const d = parsed.data;
    const pending: GeneratorJob = {
      ...j,
      schedule: d.schedule !== undefined ? d.schedule : j.schedule,
      schedule_days: d.scheduleDays !== undefined ? d.scheduleDays : j.schedule_days,
      recurrence_start: d.recurrenceStart !== undefined ? d.recurrenceStart : j.recurrence_start,
      recurrence_end: d.recurrenceEnd !== undefined ? d.recurrenceEnd : j.recurrence_end,
    };
    try {
      const scope = await pruneScope(pending);
      const ids = scope ? await findUntouchedFutureVisits(supabase, jobId, scope) : [];
      return NextResponse.json({ removeCount: ids.length });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to check existing visits" }, { status: 500 });
    }
  }

  let removed = 0;
  if (action === "reschedule") {
    try {
      const scope = await pruneScope(j);
      if (scope) {
        const ids = await findUntouchedFutureVisits(supabase, jobId, scope);
        removed = await pruneVisits(supabase, ids, scope.statuses);
      }
      const previousStart = parsed.data.previousStart;
      const newStart = j.recurrence_start ?? j.scheduled_date ?? null;
      if (scheduleChanged && previousStart && previousStart !== newStart) {
        const { error: startErr } = await supabase
          .from("crm_job_services")
          .update({ start_recurring: newStart })
          .eq("job_id", jobId)
          .eq("start_recurring", previousStart);
        if (startErr) throw new Error(startErr.message);
      }
      // A schedule change replaces the visits, so a Settings → Schedules
      // "Keep existing visits" floor no longer applies.
      if (scheduleChanged && j.generate_visits_after) {
        const { error: floorErr } = await supabase.from("crm_jobs").update({ generate_visits_after: null }).eq("id", jobId);
        if (floorErr) throw new Error(floorErr.message);
        j.generate_visits_after = null;
      }
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to remove old visits" }, { status: 500 });
    }
  }

  if (j.status && NON_GENERATING_JOB_STATUSES.includes(j.status)) {
    return NextResponse.json({ generated: 0, removed, message: `Job is ${j.status}.` });
  }

  const result = await generateVisitsForJobs(supabase, [j], {
    horizonDays: lookaheadDays,
    maxVisitsPerJob: MAX_VISITS_PER_RUN,
    fallbackOrgId: sessionOrgId,
    todayFor: async () => today,
  });
  if (result.errors.length > 0 && result.inserted === 0) {
    return NextResponse.json({ error: result.errors[0], removed }, { status: 500 });
  }

  return NextResponse.json({
    generated: result.inserted,
    removed,
    // Zero inserted also happens when nothing COULD be generated (unreadable schedule, start past the
    // horizon, inactive client or contract), so only say "already exist" when upcoming visits do.
    ...(result.inserted === 0 ? { message: await noNewVisitsMessage(supabase, jobId, today) } : {}),
  });
}

async function noNewVisitsMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  jobId: string,
  today: string,
): Promise<string> {
  const { count } = await supabase
    .from("crm_job_visits")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .is("deleted_at", null)
    .gte("scheduled_date", today);
  return (count ?? 0) > 0
    ? "All visits already exist."
    : "No visits could be generated. Check the job's schedule, start date and end date, and that the client and any contract are active.";
}
