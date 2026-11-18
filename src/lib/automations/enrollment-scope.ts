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
  "visit_coming_up",
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

/**
 * Start triggers that are about ONE other record (owner decision: once per record, not
 * once per client). The run stores crm_sequence_enrollments.record_type + record_key and is
 * deduped on (sequence, record_type, record_key) — a second contract, form response, damage
 * case or card starts its own run while a run for the first is still going.
 *  - form_submitted                       → the form response
 *  - contract_created / contract_signed   → the contract
 *  - contract_about_to_expire             → the contract TERM (`<contract id>:<end date>`):
 *                                            a renewed term with a new end date is a new record
 *  - damage_case_created                  → the damage case
 *  - credit_card_about_to_expire          → the card (`<payment method id>:<exp yyyy-mm>`)
 */
export const RECORD_SCOPED_TRIGGERS: ReadonlyMap<TriggerType, string> = new Map<TriggerType, string>([
  ["form_submitted", "form_response"],
  ["contract_created", "contract"],
  ["contract_signed", "contract"],
  ["contract_about_to_expire", "contract_term"],
  ["damage_case_created", "damage_case"],
  ["credit_card_about_to_expire", "card"],
]);

/** The record type a record-scoped trigger's run is keyed on, or null for other triggers. */
export function recordScopeType(t: string | null | undefined): string | null {
  return (t && RECORD_SCOPED_TRIGGERS.get(t as TriggerType)) || null;
}
