import type { ConditionField, TriggerType } from "@/types/crm-automations";

/**
 * Which record a condition reads besides the client. Only the estimate_*,
 * invoice_* and ticket_* triggers enroll with an estimate/invoice/ticket
 * attached (see fireSimpleTrigger callers), so a condition on one of those
 * records can only ever be true for a sequence started by such a trigger.
 *
 * Deliberately dependency-free (no UI imports) so the server-side evaluator and
 * the builder UI can share it.
 */
export type ConditionRecordKind = "estimate" | "invoice" | "ticket";

const ESTIMATE_FIELDS: ReadonlySet<ConditionField> = new Set<ConditionField>([
  "estimate_has_product", "estimate_has_service", "estimate_sales_rep", "estimate_stage", "estimate_status", "estimate_total",
]);
const INVOICE_FIELDS: ReadonlySet<ConditionField> = new Set<ConditionField>([
  "invoice_has_product", "invoice_has_service", "invoice_past_due_days", "invoice_was_paid_days",
]);
const TICKET_FIELDS: ReadonlySet<ConditionField> = new Set<ConditionField>(["ticket_category", "ticket_past_due_days"]);

/** The record a condition field needs, or null if it only needs the client. */
export function conditionRecordKind(field: ConditionField): ConditionRecordKind | null {
  if (ESTIMATE_FIELDS.has(field)) return "estimate";
  if (INVOICE_FIELDS.has(field)) return "invoice";
  if (TICKET_FIELDS.has(field)) return "ticket";
  return null;
}

/** The record kind a trigger type enrolls with, or null if it is client-only. */
export function triggerRecordKind(triggerType: TriggerType): ConditionRecordKind | null {
  if (triggerType.startsWith("estimate_")) return "estimate";
  if (triggerType.startsWith("invoice_")) return "invoice";
  if (triggerType.startsWith("ticket_")) return "ticket";
  return null;
}

/**
 * The record kinds available to conditions for a set of triggers. With no
 * trigger configured yet there is nothing to judge against, so everything is
 * offered (null = no restriction).
 */
export function availableRecordKinds(triggerTypes: TriggerType[]): ReadonlySet<ConditionRecordKind> | null {
  if (triggerTypes.length === 0) return null;
  const kinds = new Set<ConditionRecordKind>();
  for (const t of triggerTypes) {
    const k = triggerRecordKind(t);
    if (k) kinds.add(k);
  }
  return kinds;
}
