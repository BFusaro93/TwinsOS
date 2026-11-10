import {
  COUNTED_VISIT_STATUSES,
  GENERATOR_JOB_COLUMNS,
  NON_GENERATING_JOB_STATUSES,
  generateVisitsForJobs,
  loadSchedulesByOrg,
  selectAllRows,
  type GeneratorJob,
} from "@/lib/visits/generate";
import {
  SCHEDULE_CHANGE_PRUNE_STATUSES,
  findUntouchedFutureVisits,
  pruneVisits,
  rescheduleKeepDates,
} from "@/lib/visits/prune";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/**
 * After a schedule's day / frequency / excluded dates change in Settings, the
 * visits already generated from the OLD rules are stale. This re-runs the same
 * per-job reschedule the Job Detail edit does for every live recurring job on
 * the schedule — via the existing prune + generator, so it stays idempotent.
 * It is a DIFF: an untouched visit whose date the saved rules still produce is
 * kept as is (crew, time, notes, priority, multi-crew setup); only dates the
 * new rules drop are removed, and the generator fills in the new ones.
 *
 * "Untouched" is stricter than a hold/cancel prune: status 'scheduled', never
 * clocked in, not invoiced, on/after the org's today, and NOT moved by hand
 * (scheduled_date still equals the occurrence_date the generator stamped).
 * In-progress, completed, dispatched and hand-moved visits stay exactly where
 * they are. A multi-crew stop is all-or-nothing (see prune.ts).
 *
 * "Keep existing visits" (keep) removes nothing: each job records the last
 * date it already has a visit on (crm_jobs.generate_visits_after), and the
 * generator only creates visits on the new rules AFTER it — so no week gets a
 * visit on the old day and another on the new one. An apply replaces visits,
 * so it clears that floor first.
 *
 * Every read and write runs on the caller's RLS client. A switched-off
 * schedule is a no-op: the generator creates nothing for it, so pruning would
 * only delete visits.
 */

export interface ScheduleRescheduleResult {
  /** Live recurring jobs on the schedule that were considered. */
  jobs: number;
  /** Upcoming untouched visits that would be (preview) / were removed. */
  count: number;
  generated: number;
  errors: string[];
}

export async function rescheduleVisitsForSchedule(
  supabase: AnyClient,
  args: { orgId: string; scheduleId: string; today: string; apply: boolean; keep?: boolean }
): Promise<ScheduleRescheduleResult> {
  const out: ScheduleRescheduleResult = { jobs: 0, count: 0, generated: 0, errors: [] };
  const apply = args.apply && !args.keep;

  const { data: schedule } = await supabase
    .from("crm_schedules")
    .select("id, name, is_active")
    .eq("id", args.scheduleId)
    .eq("org_id", args.orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!schedule || schedule.is_active === false) return out;

  const { rows: jobs, error } = await selectAllRows<GeneratorJob>(() =>
    supabase
      .from("crm_jobs")
      .select(GENERATOR_JOB_COLUMNS)
      .eq("org_id", args.orgId)
      .eq("schedule", schedule.name)
      .eq("job_type", "recurring")
      .not("status", "in", `(${NON_GENERATING_JOB_STATUSES.map((s) => `"${s}"`).join(",")})`)
      .is("deleted_at", null)
  );
  if (error) {
    out.errors.push(error);
    return out;
  }
  out.jobs = jobs.length;

  if (args.keep) {
    out.count = await holdNewVisitsAfterExisting(supabase, jobs, args.today, out.errors);
    return out;
  }

  // Replacing visits: a previous "Keep existing visits" floor no longer applies.
  if (apply) {
    const floored = jobs.filter((j) => j.generate_visits_after);
    for (let i = 0; i < floored.length; i += 100) {
      const ids = floored.slice(i, i + 100).map((j) => j.id);
      const { error: clearErr } = await supabase.from("crm_jobs").update({ generate_visits_after: null }).in("id", ids);
      if (clearErr) out.errors.push((clearErr as { message: string }).message);
    }
    for (const j of floored) j.generate_visits_after = null;
  }

  const { byOrg, error: schedErr } = await loadSchedulesByOrg(supabase, [args.orgId]);
  if (schedErr) {
    out.errors.push(schedErr);
    return out;
  }
  const schedulesByName = byOrg.get(args.orgId) ?? new Map();

  for (const job of jobs) {
    const scope = {
      fromDate: args.today,
      statuses: SCHEDULE_CHANGE_PRUNE_STATUSES,
      skipMoved: true,
      keepDates: rescheduleKeepDates(job, schedulesByName, args.today),
    };
    try {
      const ids = await findUntouchedFutureVisits(supabase, job.id, scope);
      if (apply && ids.length > 0) out.count += await pruneVisits(supabase, ids, scope.statuses);
      else out.count += ids.length;
    } catch (e) {
      out.errors.push(e instanceof Error ? e.message : "Failed to check existing visits");
    }
  }

  if (apply && jobs.length > 0) {
    const result = await generateVisitsForJobs(supabase, jobs, {
      horizonDays: 365,
      maxVisitsPerJob: 400,
      fallbackOrgId: args.orgId,
      todayFor: async () => args.today,
    });
    out.generated = result.inserted;
    out.errors.push(...result.errors);
  }
  return out;
}

/**
 * "Keep existing visits": for each job, the last date it already has a visit
 * on (scheduled / dispatched / in progress / completed, org-today onward)
 * becomes its generate_visits_after floor, never moving an existing floor
 * earlier. Returns how many jobs got a floor.
 */
async function holdNewVisitsAfterExisting(
  supabase: AnyClient,
  jobs: GeneratorJob[],
  today: string,
  errors: string[]
): Promise<number> {
  const lastByJob = new Map<string, string>();
  for (let i = 0; i < jobs.length; i += 100) {
    const ids = jobs.slice(i, i + 100).map((j) => j.id);
    const { rows, error } = await selectAllRows<{ job_id: string; scheduled_date: string | null }>(() => supabase
      .from("crm_job_visits")
      .select("job_id, scheduled_date")
      .in("job_id", ids)
      .is("deleted_at", null)
      .in("status", COUNTED_VISIT_STATUSES)
      .gte("scheduled_date", today));
    if (error) {
      errors.push(error);
      return 0;
    }
    for (const r of rows) {
      if (!r.scheduled_date) continue;
      const prev = lastByJob.get(r.job_id);
      if (!prev || r.scheduled_date > prev) lastByJob.set(r.job_id, r.scheduled_date);
    }
  }
  let floored = 0;
  for (const job of jobs) {
    const last = lastByJob.get(job.id);
    if (!last || (job.generate_visits_after && job.generate_visits_after >= last)) continue;
    const { error } = await supabase.from("crm_jobs").update({ generate_visits_after: last }).eq("id", job.id);
    if (error) errors.push((error as { message: string }).message);
    else floored++;
  }
  return floored;
}
