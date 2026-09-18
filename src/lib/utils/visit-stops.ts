import type { CRMJobVisit, CRMJobService, VisitStatus } from "@/types/crm-jobs";

/**
 * Which service(s) to show for a visit. A visit linked to a specific
 * crm_job_services row (job_service_id set — package visits, or any
 * multi-service job visit created by useCreateClientJob/generate-visits)
 * should only ever show that one service, not every service on the parent
 * job. Falls back to every job service for older/unlinked visits, matching
 * the office-side DispatchBoard.tsx pattern this mirrors.
 */
export function visitServices(
  visit: Pick<CRMJobVisit, "jobServiceId"> & { job?: { services?: CRMJobService[] } }
): CRMJobService[] {
  const services: CRMJobService[] = visit.job?.services ?? [];
  if (visit.jobServiceId) {
    const linked = services.find((s) => s.id === visit.jobServiceId);
    return linked ? [linked] : [];
  }
  return services;
}

export function visitServiceNames(
  visit: Pick<CRMJobVisit, "jobServiceId"> & { job?: { services?: CRMJobService[] } }
): string[] {
  return visitServices(visit).map((s) => s.serviceName);
}

const TERMINAL_STATUSES: VisitStatus[] = ["completed", "cancelled", "skipped"];
// Least-advanced-first, used to pick a representative status for a stop
// that isn't fully done and isn't in progress.
const STATUS_PROGRESS_ORDER: VisitStatus[] = ["scheduled", "dispatched", "in_progress", "completed", "cancelled", "skipped"];

/**
 * A visit nobody can act on any more. Skipped/cancelled rows never get a
 * clocked_out_at — the skip route only writes `status`/`skip_reason` — so
 * every "is this stop finished / still running" test below has to treat a
 * terminal status as satisfying the clock, or one skipped service pins the
 * whole stop open (and, if it was skipped *while clocked in*, pins it at
 * "in progress") for the rest of the season.
 */
function isTerminal(visit: Pick<CRMJobVisit, "status">): boolean {
  return TERMINAL_STATUSES.includes(visit.status);
}

/** Still-running: clocked in, not clocked out, and not skipped/cancelled out from under the clock. */
function isRunning(visit: Pick<CRMJobVisit, "status" | "clockedInAt" | "clockedOutAt">): boolean {
  return !!visit.clockedInAt && !visit.clockedOutAt && !isTerminal(visit);
}

/**
 * A visit carrying `notes_to_crew_updated_at` from both levels. Optional
 * rather than added to CRMJobVisit itself: only the crew surfaces select the
 * column, so requiring it would force every other producer of a CRMJobVisit
 * (dispatch board, reports, API routes) to supply a value they never read.
 */
export interface VisitWithNotesStamp extends Omit<CRMJobVisit, "job"> {
  notesToCrewUpdatedAt?: string | null;
  job?: CRMJobVisit["job"] & { notesToCrewUpdatedAt?: string | null };
}

/**
 * When the office last edited the notes-to-crew this visit shows, taking the
 * later of the visit-level and job-level stamps. Used to stale an
 * acknowledgment the crew gave *before* the notes changed — see the clock-in
 * routes and isNotesAcknowledgmentCurrent().
 */
export function notesToCrewUpdatedAt(visit: VisitWithNotesStamp): string | null {
  return [visit.notesToCrewUpdatedAt, visit.job?.notesToCrewUpdatedAt]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .sort()
    .pop() ?? null;
}

/**
 * True when `acknowledgedAt` still covers `notesUpdatedAt`. A null
 * notes-timestamp means "we don't know when the notes last changed" (an
 * older row written before the column existed) — that must not silently
 * re-arm the gate on every crew every morning, so it falls back to "any
 * acknowledgment counts".
 */
export function isNotesAcknowledgmentCurrent(
  acknowledgedAt: string | null | undefined,
  notesUpdatedAt: string | null | undefined
): boolean {
  if (!acknowledgedAt) return false;
  if (!notesUpdatedAt) return true;
  return new Date(acknowledgedAt).getTime() >= new Date(notesUpdatedAt).getTime();
}

/**
 * A "stop" is everything a crew does at one client/address on one day —
 * possibly spanning multiple crm_job_visits rows (one per service on a
 * multi-service job) and even multiple jobs (a recurring Mowing job plus a
 * one-off Mulch job at the same address). The crew tablet shows one card per
 * stop with a single clock-in/out, even though the dispatch board and every
 * report still operate at the finer per-visit grain.
 */
export interface Stop {
  key: string;
  anchorVisitId: string;
  clientName: string | null;
  clientPhone: string | null;
  address: string;
  propertyId: string | null;
  visits: CRMJobVisit[];
  derivedStatus: VisitStatus;
  clockedInAt: string | null;
  clockedOutAt: string | null;
  /** Set while the stop is on a break — see crm_job_visits.paused_at. */
  pausedAt: string | null;
  notesToCrew: string | null;
  /**
   * Latest `notes_to_crew_updated_at` across the stop's visits (and their
   * jobs). An acknowledgment older than this is stale — the office changed
   * the notes after the crew said they'd read them. Null when nothing in the
   * stop carries the stamp; see isNotesAcknowledgmentCurrent().
   */
  notesToCrewUpdatedAt: string | null;
}

/**
 * Groups by client + day + crew, so two properties for the same client
 * serviced the same day by the same crew don't merge into one stop.
 * Deliberately excludes job_id — a stop is "whatever this crew is doing at
 * this address today," which can span jobs. Ignores start_time for now:
 * auto-generated visits never set it, so including it would be a no-op in
 * the common case and would fragment stops where a dispatcher set a time on
 * only one of several services.
 */
export interface StopKeyInput {
  clientId: string;
  scheduledDate: string;
  crewId: string | null;
  job?: { propertyId?: string | null; serviceAddress?: string | null; serviceCity?: string | null };
}

/** Loosely typed so server routes working with raw (snake_case-mapped) rows can reuse it too, not just full CRMJobVisit objects. */
export function stopKeyForVisit(visit: StopKeyInput): string {
  const address = visit.job?.propertyId
    ?? [visit.job?.serviceAddress, visit.job?.serviceCity].filter(Boolean).join(",").toLowerCase()
    ?? "-";
  return [visit.clientId, visit.scheduledDate, visit.crewId ?? "none", address || "-"].join("|");
}

/**
 * Deterministic so the anchor (whose id becomes the stop's route param and
 * the clock-in/out target) doesn't shuffle between renders or across a
 * server request that re-derives the same stop.
 */
export function pickAnchorVisit(visits: CRMJobVisit[]): CRMJobVisit {
  return [...visits].sort((a, b) => {
    const orderA = a.orderNum ?? Number.POSITIVE_INFINITY;
    const orderB = b.orderNum ?? Number.POSITIVE_INFINITY;
    if (orderA !== orderB) return orderA - orderB;

    const startA = a.startTime ?? "99:99";
    const startB = b.startTime ?? "99:99";
    if (startA !== startB) return startA < startB ? -1 : 1;

    const sortA = visitServices(a)[0]?.sortOrder ?? Number.POSITIVE_INFINITY;
    const sortB = visitServices(b)[0]?.sortOrder ?? Number.POSITIVE_INFINITY;
    if (sortA !== sortB) return sortA - sortB;

    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];
}

function derivedStopStatus(visits: CRMJobVisit[]): VisitStatus {
  if (visits.every(isTerminal)) {
    // All terminal — prefer "completed" unless every one was cancelled/skipped.
    return visits.some((v) => v.status === "completed") ? "completed" : visits[0].status;
  }
  // Only a NON-terminal visit can hold the stop "in progress". A service
  // skipped while the crew was clocked in keeps its clocked_in_at (that's the
  // record of what actually happened) but must not out-vote its siblings —
  // before this check excluded terminal rows, one such skip left the stop
  // reading "in progress" forever, on the crew tablet and the dispatch board.
  if (visits.some((v) => v.status === "in_progress" || isRunning(v))) {
    return "in_progress";
  }
  const nonTerminal = visits.filter((v) => !isTerminal(v));
  return nonTerminal
    .map((v) => v.status)
    .sort((a, b) => STATUS_PROGRESS_ORDER.indexOf(a) - STATUS_PROGRESS_ORDER.indexOf(b))[0]
    ?? visits[0].status;
}

/** Groups visits into stops, preserving the sort order of each stop's first visit. */
export function groupVisitsIntoStops(visits: CRMJobVisit[]): Stop[] {
  const byKey = new Map<string, CRMJobVisit[]>();
  const keyOrder: string[] = [];
  for (const visit of visits) {
    const key = stopKeyForVisit(visit);
    if (!byKey.has(key)) {
      byKey.set(key, []);
      keyOrder.push(key);
    }
    byKey.get(key)!.push(visit);
  }

  return keyOrder.map((key) => {
    const stopVisits = byKey.get(key)!;
    const anchor = pickAnchorVisit(stopVisits);
    const address = [anchor.job?.serviceAddress, anchor.job?.serviceCity].filter(Boolean).join(", ");
    return {
      key,
      anchorVisitId: anchor.id,
      clientName: anchor.clientName ?? null,
      clientPhone: anchor.clientPhone ?? null,
      address,
      propertyId: anchor.job?.propertyId ?? null,
      visits: stopVisits,
      derivedStatus: derivedStopStatus(stopVisits),
      // Prefer a visit that is still running: when a completed sibling shares
      // the stop with a not-yet-started one, taking the completed visit's
      // clock-in (with clockedOutAt null because not every visit is out)
      // made the card read "Not Started" and "Running" at the same time.
      clockedInAt: stopVisits.find(isRunning)?.clockedInAt
        ?? stopVisits.find((v) => v.clockedInAt)?.clockedInAt
        ?? null,
      // A skipped/cancelled sibling is "done with" even though it has no
      // clocked_out_at, so it can't hold the stop open. The stamp itself then
      // comes from whichever visit actually clocked out (the anchor may be
      // the skipped one), latest first.
      clockedOutAt: stopVisits.every((v) => v.clockedOutAt || isTerminal(v))
        ? (anchor.clockedOutAt
          ?? stopVisits.map((v) => v.clockedOutAt).filter(Boolean).sort().pop()
          ?? null)
        : null,
      pausedAt: stopVisits.find((v) => isRunning(v) && v.pausedAt)?.pausedAt ?? null,
      notesToCrew: [...new Set(stopVisits.map((v) => v.notesToCrew || v.job?.notesToCrew).filter(Boolean))].join("\n") || null,
      notesToCrewUpdatedAt: stopVisits
        .map(notesToCrewUpdatedAt)
        .filter((s): s is string => !!s)
        .sort()
        .pop() ?? null,
    };
  });
}
