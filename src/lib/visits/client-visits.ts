import { selectAllRows } from "@/lib/visits/generate";
import { findJobVisitsToRemove, removeJobVisits } from "@/lib/visits/job-status-visits";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/**
 * "Cancel their N upcoming visits?" — what happens to a client's visits when
 * the client is cancelled or deleted and the office answers Yes.
 *
 * Per job of the client, the SAME rule a cancelled job follows
 * (findJobVisitsToRemove / removeJobVisits in job-status-visits.ts):
 *   * recurring / package — untouched visits from the org's today on are
 *     pruned (soft-deleted, occurrence released). Generation itself stops
 *     while the client is cancelled; reactivating the client lets the daily
 *     generator resume them.
 *   * one_time / project / snow / waiting_list — untouched visits of any date
 *     are marked 'cancelled' and stay on the record. Reactivating the client
 *     does NOT bring them back.
 * "Untouched" = scheduled/dispatched, never clocked in, not invoiced.
 * Completed and in-progress visits are left alone; a multi-crew stop is
 * removed all-or-nothing (see prune.ts).
 *
 * Runs on whatever client it is given — the route passes the caller's RLS
 * client after proving the clients belong to their org.
 */

export interface ClientVisitsResult {
  /** Visits that would be (preview) / were (apply) cancelled or pruned. */
  count: number;
  jobs: number;
}

export async function cancelClientVisits(
  supabase: AnyClient,
  args: { clientIds: string[]; today: string; apply: boolean }
): Promise<ClientVisitsResult> {
  const out: ClientVisitsResult = { count: 0, jobs: 0 };
  for (let i = 0; i < args.clientIds.length; i += 100) {
    const { rows: jobs, error } = await selectAllRows<{ id: string; job_type: string | null }>(() =>
      supabase
        .from("crm_jobs")
        .select("id, job_type")
        .in("client_id", args.clientIds.slice(i, i + 100))
        .is("deleted_at", null)
    );
    if (error) throw new Error(error);
    for (const job of jobs) {
      const target = await findJobVisitsToRemove(supabase, { jobId: job.id, jobType: job.job_type, today: args.today });
      if (target.ids.length === 0) continue;
      out.jobs++;
      out.count += args.apply ? await removeJobVisits(supabase, target) : target.ids.length;
    }
  }
  return out;
}
