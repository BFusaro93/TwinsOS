/**
 * Whether a visit has actually happened (or is happening): the crew clocked in,
 * or it is in progress / completed. Chemicals on a visit that hasn't started are
 * only a plan — the crew confirms what was applied — so they must never be
 * recorded as applied, mailed as a Notice of Treatment, or taken out of stock.
 * Mirrors the DB rule in public._chem_visit_started (migration 20261224000100).
 */
export function visitHasStarted(visit: { status?: string | null; clocked_in_at?: string | null } | null | undefined): boolean {
  if (!visit) return false;
  return !!visit.clocked_in_at || visit.status === "in_progress" || visit.status === "completed";
}
