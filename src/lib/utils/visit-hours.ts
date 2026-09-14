// Shared "actual hours" fallback used anywhere a visit's real time-on-site
// needs to be shown or totaled. An explicit actualHours override (dispatcher-
// entered) always wins; then real clock-in/out punches from the crew tablet;
// then the dispatcher's scheduled Start/End time as an estimate. Recorded
// break time is netted off the derived tiers, and each result is multiplied by
// crew size. Mirrors crm_recompute_job_actual_hours() and the `calc` lateral
// in rpt_job_visits — keep all three in sync if this logic ever changes.
export interface VisitHoursInput {
  actualHours: number | null;
  clockedInAt: string | null;
  clockedOutAt: string | null;
  startTime: string | null;
  endTime: string | null;
  menCount: number;
  /**
   * Paid-break/lunch minutes recorded by the crew's Pause button
   * (crm_job_visits.break_minutes, migration 20260906200000). Absent on
   * callers that predate the pause feature, which is why it's optional —
   * treated as 0.
   */
  breakMinutes?: number | null;
}

export function computeActualHours(visit: VisitHoursInput): number | null {
  // An explicit override is already net of break and already man-multiplied
  // (allocateStopHours writes it from a duration the clock-out route computed
  // after subtracting the break) — never adjust it again here.
  if (visit.actualHours != null) return visit.actualHours;

  const breakHours = Math.max(0, visit.breakMinutes ?? 0) / 60;

  if (visit.clockedInAt && visit.clockedOutAt) {
    const elapsed = (new Date(visit.clockedOutAt).getTime() - new Date(visit.clockedInAt).getTime()) / 3_600_000;
    // Gate on the RAW elapsed time so the fall-through to scheduled times
    // still only happens for missing/backwards punches — a break that swallows
    // the whole shift means zero worked hours, not "fall back to the plan".
    if (elapsed > 0) return Math.max(0, elapsed - breakHours) * (visit.menCount || 1);
  }
  if (!visit.startTime || !visit.endTime) return null;
  const [sh, sm] = visit.startTime.split(":").map(Number);
  const [eh, em] = visit.endTime.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
  // Snow/storm visits routinely cross midnight (e.g. 23:00 -> 01:00) — an
  // end time strictly before the start time means it's the next day, not a
  // negative-duration shift. An end EQUAL to start is still treated as
  // no duration (likely unset fields), not a full 24 hours.
  let diffMinutes = eh * 60 + em - (sh * 60 + sm);
  if (diffMinutes < 0) diffMinutes += 24 * 60;
  if (diffMinutes <= 0) return null;
  const diffHours = diffMinutes / 60;
  return Math.max(0, diffHours - breakHours) * (visit.menCount || 1);
}

export interface VisitBudgetedHoursInput {
  budgetedHours: number | null;
  jobServiceId: string | null;
  job?: { budgetedHours: number | null; services?: { id: string; budgetedHours: number; teamSize: number }[] };
}

/**
 * Budgeted hours for one visit — an explicit per-visit override always wins;
 * otherwise the visit's own linked service (budgeted_hours × team_size, same
 * units as everything else here — s.budgeted_hours alone is per-person, see
 * allocateStopHours below); otherwise the job-level rollup total, which is
 * only meaningful as a last resort for a visit with no service link (e.g. a
 * single-service job whose visit was never linked). Skipping straight from
 * the visit to the job total — the bug this replaced — collapses every
 * visit of a multi-service job to the SAME job-wide number instead of each
 * one's own service hours.
 */
export function computeBudgetedHours(visit: VisitBudgetedHoursInput): number | null {
  if (visit.budgetedHours != null) return visit.budgetedHours;
  const linked = visit.jobServiceId ? visit.job?.services?.find((s) => s.id === visit.jobServiceId) : null;
  if (linked) return linked.budgetedHours * (linked.teamSize || 1);
  return visit.job?.budgetedHours ?? null;
}

export interface AllocateStopHoursVisit {
  id: string;
  jobServiceId: string | null;
  // Loosely typed (not the full CRMJobService) so server routes working with
  // raw DB rows can reuse this without constructing a full client-side type.
  job?: { services?: { id: string; budgetedHours: number; teamSize: number }[] };
}

/**
 * Splits one measured stop duration across the stop's visits, weighted by
 * each visit's own linked service's budgeted_hours × team_size — falling
 * back to an even split if none of them have a budget set. The result is
 * written as each visit's explicit actual_hours override, so it MUST already
 * be men-multiplied: computeActualHours() above never re-multiplies an
 * explicit override, only the derived clock/start-end tiers. Getting this
 * backwards double- or under-counts every downstream job/report rollup.
 * Rounds to 2 decimals and assigns any rounding remainder to the
 * largest-weight visit so the per-visit sum always equals totalStopHours
 * exactly (the job-level rollup trigger sums these — drift would otherwise
 * surface as a job-level discrepancy).
 */
export function allocateStopHours({
  durationHours,
  menCount,
  visits,
}: {
  durationHours: number;
  menCount: number;
  visits: AllocateStopHoursVisit[];
}): Map<string, number> | null {
  if (durationHours <= 0 || visits.length === 0) return null;

  const totalStopHours = durationHours * (menCount || 1);

  const weights = visits.map((v) => {
    const services = v.job?.services ?? [];
    const linked = v.jobServiceId ? services.find((s) => s.id === v.jobServiceId) : services[0];
    return linked ? linked.budgetedHours * linked.teamSize : 0;
  });
  const sumWeights = weights.reduce((s, w) => s + w, 0);
  const effectiveWeights = sumWeights > 0 ? weights : visits.map(() => 1);
  const effectiveSum = effectiveWeights.reduce((s, w) => s + w, 0);

  const rounded = effectiveWeights.map((w) => Math.round(((totalStopHours * w) / effectiveSum) * 100) / 100);
  const roundedSum = Math.round(rounded.reduce((s, n) => s + n, 0) * 100) / 100;
  const diff = Math.round((totalStopHours - roundedSum) * 100) / 100;
  if (diff !== 0) {
    const maxIdx = effectiveWeights.indexOf(Math.max(...effectiveWeights));
    rounded[maxIdx] = Math.round((rounded[maxIdx] + diff) * 100) / 100;
  }

  const result = new Map<string, number>();
  visits.forEach((v, i) => result.set(v.id, rounded[i]));
  return result;
}
