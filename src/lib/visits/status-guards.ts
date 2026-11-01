/**
 * Shared rules for changing a visit's status, used by every writer (visit API
 * routes, bulk update, and the browser-side hooks the dispatch board, visit
 * sheet and snow board call directly) so they can't disagree.
 */
export type VisitClockRow = {
  status: string;
  clocked_in_at: string | null;
  clocked_out_at: string | null;
};

const ACTIVE_STATUSES = new Set(["scheduled", "dispatched", "in_progress"]);

/** Statuses that put a visit back in front of the crew. */
export const REOPEN_STATUSES = ["scheduled", "dispatched", "in_progress"];

/**
 * The crew is working this visit right now: clocked in, not out, and nobody
 * has skipped / cancelled / completed it around them. A visit the crew
 * skipped after Start Job keeps its clock-in stamp but is not in progress —
 * the office must be able to move or reopen it.
 */
export function isVisitInProgress(v: VisitClockRow | null | undefined): boolean {
  return !!v && !!v.clocked_in_at && !v.clocked_out_at && ACTIVE_STATUSES.has(v.status);
}

/**
 * Reopening a finished visit must clear its clock stamps, or the crew app sees
 * it as already worked (clock-in and clock-out become no-ops) and it can never
 * be done again. True for completed visits, and for skipped / cancelled ones
 * that were started before the outcome was set.
 */
export function reopenClearsClockStamps(prev: VisitClockRow | null | undefined, nextStatus: string | null | undefined): boolean {
  if (!prev || !nextStatus || !REOPEN_STATUSES.includes(nextStatus) || prev.status === nextStatus) return false;
  if (prev.status === "completed") return true;
  return (prev.status === "skipped" || prev.status === "cancelled") && !!prev.clocked_in_at;
}

export const CLEARED_CLOCK_STAMPS = {
  clocked_in_at: null,
  clocked_out_at: null,
  completed_at: null,
  paused_at: null,
} as const;

/** Status changes that strand open punches when the crew is mid-stop. */
export const GUARDED_STATUS_CHANGES = ["cancelled", "skipped", "scheduled", "dispatched"];

export const VISIT_IN_PROGRESS_STATUS_MESSAGE =
  "This visit is in progress (the crew has clocked in), so its status can't be changed. Have the crew clock out first.";
export const VISIT_IN_PROGRESS_MOVE_MESSAGE =
  "This visit is in progress (the crew has clocked in), so it can't be moved to another day. Have the crew clock out first.";
export const VISIT_IN_PROGRESS_CREW_MESSAGE =
  "This visit is in progress (the crew has clocked in), so its crew can't be changed. Have the crew clock out first.";
export const VISIT_IN_PROGRESS_DELETE_MESSAGE =
  "This visit is in progress (the crew has clocked in), so it can't be deleted. Have the crew clock out first.";
