import { NON_GENERATING_JOB_STATUSES } from "@/lib/visits/generate";
import {
  PAUSE_PRUNE_STATUSES,
  findUntouchedFutureVisits,
  pruneVisits,
} from "@/lib/visits/prune";

/**
 * What a job status change does to the job's visits. The single rule set for
 * useUpdateJobStatus (status buttons) and JobDetail's edit form.
 *
 *   * recurring / package — their visits are GENERATED. Hold or cancel prunes
 *     the untouched future ones (released occurrences, see prune.ts); resuming
 *     (hold/cancelled → an active status) regenerates them over the full
 *     horizon via /api/crm/jobs/generate-visits, the same call the Generate
 *     Visits button makes. The per-job route regenerates every dated package
 *     step (no cron window), so pruned package steps come back too.
 *   * one_time / project / snow / waiting_list — their visits were placed by
 *     hand (or by job creation) and nothing would recreate them, so they are
 *     never deleted. Hold leaves them untouched. Cancel marks the untouched
 *     ones (scheduled/dispatched, never clocked in, not invoiced — any date,
 *     overdue included) status 'cancelled'; they stay on the record and can
 *     be re-opened individually. Un-cancelling the job does NOT flip them
 *     back automatically — a visit cancelled on its own can't be told apart.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export const GENERATED_VISIT_JOB_TYPES = ["recurring", "package"];

const PAUSED_STATUSES = ["hold", "cancelled"];

export interface JobStatusVisitEffect {
  pruned: number;
  cancelled: number;
  /** True when the caller should regenerate the season (see resumeJobVisits). */
  regenerate: boolean;
}

export async function applyJobStatusToVisits(
  supabase: AnyClient,
  args: {
    jobId: string;
    jobType: string | null;
    previousStatus: string | null;
    newStatus: string;
    /** Org-calendar today, "YYYY-MM-DD". */
    today: string;
  }
): Promise<JobStatusVisitEffect> {
  const { jobId, jobType, previousStatus, newStatus, today } = args;
  const out: JobStatusVisitEffect = { pruned: 0, cancelled: 0, regenerate: false };
  if (previousStatus === newStatus) return out;
  const generated = !!jobType && GENERATED_VISIT_JOB_TYPES.includes(jobType);

  if (generated && PAUSED_STATUSES.includes(newStatus)) {
    const ids = await findUntouchedFutureVisits(supabase, jobId, { fromDate: today, statuses: PAUSE_PRUNE_STATUSES });
    if (ids.length > 0) out.pruned = await pruneVisits(supabase, ids, PAUSE_PRUNE_STATUSES);
    return out;
  }

  if (!generated && newStatus === "cancelled") {
    const ids = await findUntouchedFutureVisits(supabase, jobId, { fromDate: null, statuses: PAUSE_PRUNE_STATUSES });
    const now = new Date().toISOString();
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await supabase
        .from("crm_job_visits")
        .update({ status: "cancelled", updated_at: now })
        .in("id", ids.slice(i, i + 100))
        .is("deleted_at", null)
        .is("clocked_in_at", null)
        .in("status", PAUSE_PRUNE_STATUSES)
        .select("id");
      if (error) throw error;
      out.cancelled += (data ?? []).length;
    }
    return out;
  }

  if (
    generated &&
    previousStatus != null &&
    PAUSED_STATUSES.includes(previousStatus) &&
    !NON_GENERATING_JOB_STATUSES.includes(newStatus)
  ) {
    out.regenerate = true;
  }
  return out;
}

/** Browser-only: regenerates a resumed recurring/package job's visits over the
 *  same full horizon as the Generate Visits button. Returns how many were
 *  created. */
export async function resumeJobVisits(jobId: string): Promise<number> {
  const res = await fetch("/api/crm/jobs/generate-visits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, lookaheadDays: 365 }),
  });
  const body = (await res.json().catch(() => ({}))) as { generated?: number; error?: string };
  if (!res.ok) throw new Error(body.error ?? "Failed to regenerate visits");
  return body.generated ?? 0;
}
