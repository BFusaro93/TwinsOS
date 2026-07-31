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
  notesToCrew: string | null;
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
  if (visits.every((v) => TERMINAL_STATUSES.includes(v.status))) {
    // All terminal — prefer "completed" unless every one was cancelled/skipped.
    return visits.some((v) => v.status === "completed") ? "completed" : visits[0].status;
  }
  if (visits.some((v) => v.status === "in_progress" || (v.clockedInAt && !v.clockedOutAt))) {
    return "in_progress";
  }
  const nonTerminal = visits.filter((v) => !TERMINAL_STATUSES.includes(v.status));
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
      clockedInAt: stopVisits.find((v) => v.clockedInAt)?.clockedInAt ?? null,
      clockedOutAt: stopVisits.every((v) => v.clockedOutAt) ? (anchor.clockedOutAt ?? null) : null,
      notesToCrew: [...new Set(stopVisits.map((v) => v.notesToCrew || v.job?.notesToCrew).filter(Boolean))].join("\n") || null,
    };
  });
}
