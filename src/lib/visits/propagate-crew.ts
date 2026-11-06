// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/**
 * Makes a job's crew change reach its upcoming visits. The ONE rule set for
 * POST /api/crm/jobs/[jobId]/propagate-crew (the app) and PATCH /api/v1/jobs/[id]
 * (public API).
 *
 * Only visits that follow the job's crew are touched: ones with no crew of
 * their own or still on the job's PREVIOUS crew. A visit someone moved to a
 * different crew on the board keeps it. Never ones pinned to "no crew"
 * (crew_unassigned), never members of a multi-crew stop (their crews are set
 * per visit), never a stop that is mid-clock, completed, cancelled or skipped.
 * `fromDate` is the org's today ("YYYY-MM-DD").
 *
 * `previousCrewId` is the job's crew BEFORE the change (null = it had none).
 * Leaving it undefined skips the follow-the-job filter — only for an old
 * client that doesn't send it.
 *
 * The caller must already have proven the job (and crew) belong to the org.
 */
export async function propagateCrewToVisits(
  supabase: AnyClient,
  args: { jobId: string; crewId: string | null; fromDate: string; previousCrewId?: string | null }
): Promise<{ updated: number; error: string | null }> {
  let q = supabase
    .from("crm_job_visits")
    .update({ crew_id: args.crewId }, { count: "exact" })
    .eq("job_id", args.jobId);
  if (args.previousCrewId !== undefined) {
    q = args.previousCrewId
      ? q.or(`crew_id.is.null,crew_id.eq.${args.previousCrewId}`)
      : q.is("crew_id", null);
  }
  const { error, count } = await q
    .eq("crew_unassigned", false)
    .is("crew_group_id", null)
    .neq("status", "in_progress")
    .is("clocked_in_at", null)
    .neq("status", "completed")
    .neq("status", "cancelled")
    .neq("status", "skipped")
    .gte("scheduled_date", args.fromDate)
    .is("deleted_at", null);
  return { updated: count ?? 0, error: error ? (error as { message: string }).message : null };
}
