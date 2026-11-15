/**
 * Lowering a recurring service's visit limit (crm_job_services.max_visits).
 *
 * The generator only enforces the limit when it creates NEW visits, so visits already
 * scheduled past a lowered limit stay on the board — and each one bills when it is
 * completed. This finds how far over the new limit the service is, and which of its
 * visits can safely come off: the newest future visits nobody has touched (scheduled,
 * never clocked in, not on an invoice — see findUntouchedFutureVisits). A multi-crew
 * stop counts once and is removed whole.
 */

import { COUNTED_VISIT_STATUSES, selectAllRows } from "@/lib/visits/generate";
import { SCHEDULE_CHANGE_PRUNE_STATUSES, findUntouchedFutureVisits, pruneVisits } from "@/lib/visits/prune";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export interface VisitLimitExcess {
  /** Visits counted against the limit (done or still to do; a multi-crew stop is one). */
  used: number;
  /** How many of those are over the new limit (0 = within it). */
  over: number;
  /** Visit ids that can come off — the newest untouched future stops, up to `over`
   *  stops, each stop's extra-crew visits included. */
  removableIds: string[];
  /** Stops in removableIds (≤ over). */
  removableStops: number;
}

export async function findVisitsOverLimit(
  supabase: AnyClient,
  args: { jobId: string; jobServiceId: string; maxVisits: number; today: string }
): Promise<VisitLimitExcess> {
  // Same count as the generator's budget: this service's visits plus the job's
  // unlinked visits (an unlinked visit bills every service).
  const { rows: counted, error } = await selectAllRows<{ id: string; job_service_id: string | null }>(() => supabase
    .from("crm_job_visits")
    .select("id, job_service_id")
    .eq("job_id", args.jobId)
    .or(`job_service_id.eq.${args.jobServiceId},job_service_id.is.null`)
    .eq("crew_group_secondary", false)
    .is("deleted_at", null)
    .in("status", COUNTED_VISIT_STATUSES));
  if (error) throw new Error(error);
  const used = counted.length;
  const over = Math.max(0, used - args.maxVisits);
  if (over === 0) return { used, over, removableIds: [], removableStops: 0 };

  const eligible = await findUntouchedFutureVisits(supabase, args.jobId, {
    fromDate: args.today,
    statuses: SCHEDULE_CHANGE_PRUNE_STATUSES,
  });
  if (eligible.length === 0) return { used, over, removableIds: [], removableStops: 0 };

  type Row = { id: string; job_service_id: string | null; scheduled_date: string | null; crew_group_id: string | null; crew_group_secondary: boolean | null };
  const details: Row[] = [];
  for (let i = 0; i < eligible.length; i += 100) {
    const { data, error: detErr } = await supabase
      .from("crm_job_visits")
      .select("id, job_service_id, scheduled_date, crew_group_id, crew_group_secondary")
      .in("id", eligible.slice(i, i + 100));
    if (detErr) throw detErr;
    details.push(...((data ?? []) as Row[]));
  }
  // Only this service's own stops — an unlinked visit also carries the job's other services.
  const leads = details
    .filter((r) => r.job_service_id === args.jobServiceId && !r.crew_group_secondary)
    .sort((a, b) => (b.scheduled_date ?? "").localeCompare(a.scheduled_date ?? "") || b.id.localeCompare(a.id))
    .slice(0, over);
  const groups = new Set(leads.map((r) => r.crew_group_id).filter((g): g is string => !!g));
  const removableIds = [
    ...leads.map((r) => r.id),
    ...details.filter((r) => r.crew_group_secondary && r.crew_group_id && groups.has(r.crew_group_id)).map((r) => r.id),
  ];
  return { used, over, removableIds, removableStops: leads.length };
}

/** Soft-deletes the given over-limit visits (re-checked untouched). Returns how many came off. */
export async function removeVisitsOverLimit(supabase: AnyClient, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  return pruneVisits(supabase, ids, SCHEDULE_CHANGE_PRUNE_STATUSES);
}
