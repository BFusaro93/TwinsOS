import { isVisitInProgress } from "@/lib/visits/status-guards";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export const CREW_GROUP_SIBLING_IN_PROGRESS_MESSAGE =
  "Another crew on this multi-crew stop has clocked in, so the stop can't be moved to another day. Have every crew on the stop clock out first.";

/**
 * A multi-crew stop (visits sharing crew_group_id) moves as one: changing one
 * visit's date carries every sibling with it (trg_crm_job_visits_group_follow_date).
 * Moving it while ANY crew on the stop is clocked in would pull that crew's stop
 * off their list mid-stop, so they couldn't clock out. Returns the ids of the
 * given visits whose stop has a sibling in progress (the visit itself excluded —
 * callers already check that one). The database refuses the same move
 * (enforce_crm_job_visit_schedule_write); this answers first with a clear message.
 */
export async function findVisitsWithInProgressGroupSibling(
  supabase: AnySupabase,
  visitIds: string[]
): Promise<Set<string>> {
  const out = new Set<string>();
  if (visitIds.length === 0) return out;
  const groupByVisit = new Map<string, string>();
  for (let i = 0; i < visitIds.length; i += 100) {
    const { data, error } = await supabase
      .from("crm_job_visits")
      .select("id, crew_group_id")
      .in("id", visitIds.slice(i, i + 100))
      .not("crew_group_id", "is", null);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as { id: string; crew_group_id: string }[]) groupByVisit.set(r.id, r.crew_group_id);
  }
  const groupIds = [...new Set(groupByVisit.values())];
  if (groupIds.length === 0) return out;
  const running: { id: string; crew_group_id: string }[] = [];
  for (let i = 0; i < groupIds.length; i += 100) {
    const { data, error } = await supabase
      .from("crm_job_visits")
      .select("id, crew_group_id, status, clocked_in_at, clocked_out_at")
      .in("crew_group_id", groupIds.slice(i, i + 100))
      .is("deleted_at", null)
      .not("clocked_in_at", "is", null)
      .is("clocked_out_at", null);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as { id: string; crew_group_id: string; status: string; clocked_in_at: string | null; clocked_out_at: string | null }[]) {
      if (isVisitInProgress(r)) running.push(r);
    }
  }
  for (const [visitId, groupId] of groupByVisit) {
    if (running.some((r) => r.crew_group_id === groupId && r.id !== visitId)) out.add(visitId);
  }
  return out;
}
