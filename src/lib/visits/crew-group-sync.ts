/**
 * Multi-crew stops (visits sharing crew_group_id) are completed per crew, so one crew can
 * finish while a sibling's visit stays scheduled/dispatched. This finds those stops on a
 * set of board visits so the dispatcher can spot and finish them without toggling crew columns.
 */
type SyncVisit = { id: string; status: string; crewGroupId?: string | null };

/** Statuses that need no further action from the crew. */
const SETTLED = new Set(["completed", "cancelled", "skipped"]);

export type OutOfSyncGroup = {
  /** Visit ids in the group that are not yet completed/cancelled/skipped. */
  remainingIds: string[];
};

/** crew_group_id -> group, only for groups with ≥1 completed visit AND ≥1 still-open visit. */
export function findOutOfSyncGroups(visits: SyncVisit[]): Map<string, OutOfSyncGroup> {
  const completed = new Set<string>();
  const remaining = new Map<string, string[]>();
  for (const v of visits) {
    if (!v.crewGroupId) continue;
    if (v.status === "completed") completed.add(v.crewGroupId);
    else if (!SETTLED.has(v.status)) {
      const list = remaining.get(v.crewGroupId) ?? [];
      list.push(v.id);
      remaining.set(v.crewGroupId, list);
    }
  }
  const out = new Map<string, OutOfSyncGroup>();
  for (const [groupId, ids] of remaining) {
    if (completed.has(groupId)) out.set(groupId, { remainingIds: ids });
  }
  return out;
}
