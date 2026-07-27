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
