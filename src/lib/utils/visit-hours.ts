// Shared "actual hours" fallback used anywhere a visit's real time-on-site
// needs to be shown or totaled. An explicit actualHours override (dispatcher-
// entered) always wins; then real clock-in/out punches from the crew tablet;
// then the dispatcher's scheduled Start/End time as an estimate. Each result
// is multiplied by crew size. Mirrors crm_recompute_job_actual_hours() in
// supabase/migrations/20260726000000_crm_jobs_actual_hours_rollup.sql — keep
// both in sync if this fallback logic ever changes.
export interface VisitHoursInput {
  actualHours: number | null;
  clockedInAt: string | null;
  clockedOutAt: string | null;
  startTime: string | null;
  endTime: string | null;
  menCount: number;
}

export function computeActualHours(visit: VisitHoursInput): number | null {
  if (visit.actualHours != null) return visit.actualHours;
  if (visit.clockedInAt && visit.clockedOutAt) {
    const diffHours = (new Date(visit.clockedOutAt).getTime() - new Date(visit.clockedInAt).getTime()) / 3_600_000;
    if (diffHours > 0) return diffHours * (visit.menCount || 1);
  }
  if (!visit.startTime || !visit.endTime) return null;
  const [sh, sm] = visit.startTime.split(":").map(Number);
  const [eh, em] = visit.endTime.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
  const diffHours = (eh * 60 + em - (sh * 60 + sm)) / 60;
  if (diffHours <= 0) return null;
  return diffHours * (visit.menCount || 1);
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
