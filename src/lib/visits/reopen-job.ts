// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/** Visit statuses the visit-update routes accept (mirrors crm_job_visits_status_check). */
export const VISIT_STATUS_VALUES = [
  "scheduled",
  "dispatched",
  "in_progress",
  "completed",
  "cancelled",
  "skipped",
] as const;

const OPEN_VISIT_STATUSES = new Set(["scheduled", "dispatched", "in_progress"]);

/**
 * When a completed visit is moved back to an open status, a one_time /
 * waiting_list parent job that was closed by that visit's completion
 * (complete-visit-side-effects sets status 'completed' + is_complete) must be
 * reopened too — otherwise the visit is back on the board while its job still
 * reads Completed and drops out of open-job views. Recurring/package/snow/
 * project jobs never auto-close on a visit, so they're left alone. Mirrors the
 * close in complete-visit-side-effects (status 'scheduled', is_complete false,
 * as when a job is created). Best-effort and non-throwing.
 */
export async function reopenOneTimeJobsForVisits(
  supabase: AnyClient,
  visits: { id: string; job_id: string; status: string }[],
  newStatus: string | undefined
): Promise<void> {
  if (!newStatus || !OPEN_VISIT_STATUSES.has(newStatus)) return;
  const jobIds = [...new Set(visits.filter((v) => v.status === "completed").map((v) => v.job_id))];
  if (jobIds.length === 0) return;
  try {
    await supabase
      .from("crm_jobs")
      .update({ status: "scheduled", is_complete: false })
      .in("id", jobIds)
      .in("job_type", ["one_time", "waiting_list"])
      .eq("status", "completed");
  } catch {
    // Non-fatal — the visit move itself already succeeded.
  }
}
