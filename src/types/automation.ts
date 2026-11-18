import type { POStatus } from "@/types/purchase-order";
import type { WorkOrderPriority } from "@/types/cmms";

// ─── Triggers ─────────────────────────────────────────────────────────────────

export type TriggerType =
  | "meter_threshold"
  | "part_low_stock"
  | "pm_due"
  | "wo_overdue"
  | "request_submitted"
  | "wo_status_change"
  | "po_status_change"
  | "vehicle_fault_code";

export interface MeterThresholdTrigger {
  type: "meter_threshold";
  meterId: string;       // references Meter.id
  meterLabel: string;    // "{meter.name} — {meter.assetName}" for display
  operator: ">=" | "<=" | "<";  // "<" = level meter "drops below"
  value: number;
  interval?: number | null;  // auto-advance amount after WO completion
}
export interface PartLowStockTrigger {
  type: "part_low_stock";
  partName: string;         // "any" = any part
}
export interface PMDueTrigger {
  type: "pm_due";
  daysAhead: number;
}
export interface WOOverdueTrigger {
  type: "wo_overdue";
  daysOverdue: number;
}
export interface RequestSubmittedTrigger {
  type: "request_submitted";
}
export interface WOStatusChangeTrigger {
  type: "wo_status_change";
  toStatus: "open" | "in_progress" | "on_hold" | "done";
}
export interface POStatusChangeTrigger {
  type: "po_status_change";
  /** A real purchase_orders.status value. Rules saved before 2027-01 may hold the old
   *  requisition-style names (pending_approval / closed / draft) — see LEGACY_PO_TRIGGER_STATUS. */
  toStatus: POStatus;
}

export interface VehicleFaultCodeTrigger {
  type: "vehicle_fault_code";
  /** Only fire when the check-engine light is on for the new code. */
  onlyCheckEngineLight: boolean;
}

export type AutomationTrigger =
  | MeterThresholdTrigger
  | PartLowStockTrigger
  | PMDueTrigger
  | WOOverdueTrigger
  | RequestSubmittedTrigger
  | WOStatusChangeTrigger
  | POStatusChangeTrigger
  | VehicleFaultCodeTrigger;

// ─── Actions ─────────────────────────────────────────────────────────────────

/** Same values as work_orders / maintenance_requests priority (CHECK constraint). */
export type AutomationPriority = WorkOrderPriority;

export type ActionType =
  | "create_work_order"
  | "create_wo_request"
  | "create_requisition"
  | "send_notification"
  | "send_email";

/** Creates a Work Order directly (status: open, bypasses approval flow). */
export interface CreateWorkOrderAction {
  type: "create_work_order";
  title: string;
  priority: AutomationPriority;
  /** crm_employees.id of the assignee (same FK as work_orders.assigned_to_id); "" = unassigned. */
  assignedToId: string;
  /** Display name snapshot of the assignee, for the rule summary. */
  assignedToName: string;
}

/** Creates a Maintenance Request that goes through the approval workflow. */
export interface CreateWORequestAction {
  type: "create_wo_request";
  title: string;
  priority: AutomationPriority;
  /** crm_employees.id; carried onto the request and then its converted work order. "" = unassigned. */
  assignedToId: string;
  assignedToName: string;
}
export interface CreateRequisitionAction {
  type: "create_requisition";
  notes: string;
}
export interface SendNotificationAction {
  type: "send_notification";
  recipientRole: "admin" | "manager" | "technician" | "purchaser" | "all";
  message: string;
}
export interface SendEmailAction {
  type: "send_email";
  /** A single email address. */
  recipient: string;
  /** Optional body text; the automation's name is always appended. */
  message: string;
}

export type AutomationAction =
  | CreateWorkOrderAction
  | CreateWORequestAction
  | CreateRequisitionAction
  | SendNotificationAction
  | SendEmailAction;

// ─── Rule ────────────────────────────────────────────────────────────────────

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  isEnabled: boolean;  // alias for enabled — kept for backwards compat
  trigger: AutomationTrigger;
  action: AutomationAction;
  lastFiredAt: string | null;
  lastFiredValue: number | null;
  pendingReset: boolean;
}

// ─── Legacy value normalisation ──────────────────────────────────────────────
// Shared by the rule mapper (dialog/list) and the server executor, so a rule
// saved with an old value behaves and displays the same everywhere. Migration
// 20270109001000 rewrites stored rows too; these keep any straggler working.

const PO_STATUSES: readonly POStatus[] = [
  "requested", "pending", "approved", "ordered", "canceled", "completed", "rejected", "partially_fulfilled",
];

/** Old PO trigger values (requisition-style names the PO table never uses) → the real PO status. */
export const LEGACY_PO_TRIGGER_STATUS: Readonly<Record<string, POStatus>> = {
  pending_approval: "pending",
  closed: "completed",
};

/**
 * A saved po_status_change to_status as a real PO status, or null when it can never
 * match ("draft" — POs have no draft status — or anything unknown).
 */
export function normalizePOTriggerStatus(value: unknown): POStatus | null {
  if (typeof value !== "string") return null;
  if ((PO_STATUSES as readonly string[]).includes(value)) return value as POStatus;
  return LEGACY_PO_TRIGGER_STATUS[value] ?? null;
}

const PRIORITIES: readonly AutomationPriority[] = ["low", "medium", "high", "critical"];

/** A saved action priority as a value work_orders / maintenance_requests accept ("urgent" → "critical"), or null. */
export function normalizeAutomationPriority(value: unknown): AutomationPriority | null {
  if (value === "urgent") return "critical";
  return typeof value === "string" && (PRIORITIES as readonly string[]).includes(value)
    ? (value as AutomationPriority)
    : null;
}
