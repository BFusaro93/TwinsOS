/**
 * Removing a job's not-yet-worked future visits when the job itself changes —
 * schedule edit, shortened end date, hold, cancel. Works with any Supabase
 * client (browser hook or route handler) since every write is RLS-scoped.
 *
 * "Untouched" = live, in one of the given statuses, never clocked in, and
 * not on any invoice line. Anything a crew started or the office billed is
 * left exactly where it is.
 *
 * Pruned rows are soft-deleted AND have occurrence_date cleared: this is the
 * system retracting its own generated occurrences, not a user deleting one,
 * so the generator is free to produce them again (after a resume, or on the
 * new schedule). See src/lib/visits/generate.ts.
 */

import { selectAllRows } from "@/lib/visits/generate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/** Schedule edits only replace visits nobody has touched at all. */
export const SCHEDULE_CHANGE_PRUNE_STATUSES = ["scheduled"];
/** Hold / cancel also pull visits already dispatched but not started. */
export const PAUSE_PRUNE_STATUSES = ["scheduled", "dispatched"];

export interface FindUntouchedOptions {
  /** Inclusive lower bound on scheduled_date — the org's today. null = no
   *  lower bound (cancelling a one-time job cancels overdue visits too). */
  fromDate: string | null;
  /** Only visits strictly after this date (shortened recurrence_end). */
  afterDate?: string | null;
  statuses: string[];
}

export async function findUntouchedFutureVisits(
  supabase: AnyClient,
  jobId: string,
  opts: FindUntouchedOptions
): Promise<string[]> {
  // Paginated: PostgREST truncates at 1000 rows, and a year of weekly
  // multi-service visits can exceed that.
  const { rows, error } = await selectAllRows<{ id: string }>(() => {
    let q = supabase
      .from("crm_job_visits")
      .select("id")
      .eq("job_id", jobId)
      .is("deleted_at", null)
      .is("clocked_in_at", null)
      .in("status", opts.statuses);
    if (opts.fromDate) q = q.gte("scheduled_date", opts.fromDate);
    if (opts.afterDate) q = q.gt("scheduled_date", opts.afterDate);
    return q;
  });
  if (error) throw new Error(error);
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return ids;

  const invoiced = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { rows: lines, error: lineErr } = await selectAllRows<{ visit_id: string | null }>(() => supabase
      .from("crm_invoice_line_items")
      .select("visit_id")
      .in("visit_id", ids.slice(i, i + 100)));
    if (lineErr) throw new Error(lineErr);
    for (const l of lines) if (l.visit_id) invoiced.add(l.visit_id);
  }
  return ids.filter((id) => !invoiced.has(id));
}

/** Soft-deletes the given visits (re-checking they're still untouched) and
 *  returns how many were actually removed. */
export async function pruneVisits(supabase: AnyClient, ids: string[], statuses: string[]): Promise<number> {
  let removed = 0;
  const now = new Date().toISOString();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from("crm_job_visits")
      .update({ deleted_at: now, occurrence_date: null, updated_at: now })
      .in("id", ids.slice(i, i + 100))
      .is("deleted_at", null)
      .is("clocked_in_at", null)
      .in("status", statuses)
      .select("id");
    if (error) throw error;
    removed += (data ?? []).length;
  }
  return removed;
}

/** find + prune in one call. */
export async function pruneUntouchedFutureVisits(
  supabase: AnyClient,
  jobId: string,
  opts: FindUntouchedOptions
): Promise<number> {
  const ids = await findUntouchedFutureVisits(supabase, jobId, opts);
  if (ids.length === 0) return 0;
  return pruneVisits(supabase, ids, opts.statuses);
}
