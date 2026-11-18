import type { TriggerType } from "@/types/crm-automations";

/**
 * Start triggers that are about a visit. A run they start is scoped to the
 * client's SERVICE DAY (crm_sequence_enrollments.visit_date = the visit's
 * scheduled_date): once per client per day, so a stop's sibling visits (one per
 * service, one per crew) share one run while a visit on another day starts a new
 * one. Only the same day firing again is subject to Allow Re-Entry. visit_id keeps
 * the day's first visit for the snow merge tags.
 */
export const VISIT_SCOPED_TRIGGERS: ReadonlySet<TriggerType> = new Set<TriggerType>([
  "visit_completed",
  "service_visit_completed",
  "visit_dispatched",
  "visit_skipped",
  "visit_cancelled",
  "visit_date_changed",
  "visit_moved_to_waiting_list",
]);

/** Start triggers that are about ONE job: a run is scoped to that job (crm_sequence_enrollments.job_id). */
export const JOB_SCOPED_TRIGGERS: ReadonlySet<TriggerType> = new Set<TriggerType>([
  "job_created",
  "job_cancelled",
  "package_created",
  "package_renewed",
]);

export function isVisitScopedTrigger(t: string | null | undefined): boolean {
  return !!t && VISIT_SCOPED_TRIGGERS.has(t as TriggerType);
}

export function isJobScopedTrigger(t: string | null | undefined): boolean {
  return !!t && JOB_SCOPED_TRIGGERS.has(t as TriggerType);
}
