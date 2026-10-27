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

export interface JobVisitRemoval {
  ids: string[];
  /** prune = soft-delete + release the occurrence (generated visits); cancel = mark 'cancelled' and keep the row. */
  mode: "prune" | "cancel";
}

/**
 * The untouched visits that cancelling a job (or putting a recurring one on
 * hold) removes — see the header. Generated (recurring / package) visits from
 * today on are pruned; hand-placed ones of any date are marked cancelled.
 * Shared with the client cancel / delete flow (client-visits.ts) so a
 * cancelled client's visits follow exactly the same rule as a cancelled job's.
 */
export async function findJobVisitsToRemove(
  supabase: AnyClient,
  args: { jobId: string; jobType: string | null; today: string }
): Promise<JobVisitRemoval> {
  const generated = !!args.jobType && GENERATED_VISIT_JOB_TYPES.includes(args.jobType);
  if (generated) {
    const ids = await findUntouchedFutureVisits(supabase, args.jobId, { fromDate: args.today, statuses: PAUSE_PRUNE_STATUSES });
    return { ids, mode: "prune" };
  }
  const ids = await findUntouchedFutureVisits(supabase, args.jobId, { fromDate: null, statuses: PAUSE_PRUNE_STATUSES });
  return { ids, mode: "cancel" };
}

/** Applies a JobVisitRemoval (re-checking each row is still untouched); returns how many rows changed. */
export async function removeJobVisits(supabase: AnyClient, target: JobVisitRemoval): Promise<number> {
  if (target.ids.length === 0) return 0;
  if (target.mode === "prune") return pruneVisits(supabase, target.ids, PAUSE_PRUNE_STATUSES);
  let changed = 0;
  const now = new Date().toISOString();
  for (let i = 0; i < target.ids.length; i += 100) {
    const { data, error } = await supabase
      .from("crm_job_visits")
      .update({ status: "cancelled", updated_at: now })
      .in("id", target.ids.slice(i, i + 100))
      .is("deleted_at", null)
      .is("clocked_in_at", null)
      .in("status", PAUSE_PRUNE_STATUSES)
      .select("id");
    if (error) throw error;
    changed += (data ?? []).length;
  }
  return changed;
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

  if ((generated && PAUSED_STATUSES.includes(newStatus)) || (!generated && newStatus === "cancelled")) {
    const target = await findJobVisitsToRemove(supabase, { jobId, jobType, today });
    if (target.mode === "prune") out.pruned = await removeJobVisits(supabase, target);
    else out.cancelled = await removeJobVisits(supabase, target);
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
