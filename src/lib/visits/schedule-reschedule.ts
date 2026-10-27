import {
  GENERATOR_JOB_COLUMNS,
  NON_GENERATING_JOB_STATUSES,
  generateVisitsForJobs,
  selectAllRows,
  type GeneratorJob,
} from "@/lib/visits/generate";
import {
  SCHEDULE_CHANGE_PRUNE_STATUSES,
  findUntouchedFutureVisits,
  pruneVisits,
} from "@/lib/visits/prune";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/**
 * After a schedule's day / frequency / excluded dates change in Settings, the
 * visits already generated from the OLD rules are stale. This re-runs the same
 * per-job reschedule the Job Detail edit does (prune untouched future visits,
 * regenerate on the saved schedule) for every live recurring job on the
 * schedule — via the existing prune + generator, so it stays idempotent.
 *
 * "Untouched" is stricter than a hold/cancel prune: status 'scheduled', never
 * clocked in, not invoiced, on/after the org's today, and NOT moved by hand
 * (scheduled_date still equals the occurrence_date the generator stamped).
 * In-progress, completed, dispatched and hand-moved visits stay exactly where
 * they are. A multi-crew stop is all-or-nothing (see prune.ts).
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
  args: { orgId: string; scheduleId: string; today: string; apply: boolean }
): Promise<ScheduleRescheduleResult> {
  const out: ScheduleRescheduleResult = { jobs: 0, count: 0, generated: 0, errors: [] };

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

  const scope = { fromDate: args.today, statuses: SCHEDULE_CHANGE_PRUNE_STATUSES, skipMoved: true };
  for (const job of jobs) {
    try {
      const ids = await findUntouchedFutureVisits(supabase, job.id, scope);
      if (args.apply && ids.length > 0) out.count += await pruneVisits(supabase, ids, scope.statuses);
      else out.count += ids.length;
    } catch (e) {
      out.errors.push(e instanceof Error ? e.message : "Failed to check existing visits");
    }
  }

  if (args.apply && jobs.length > 0) {
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
