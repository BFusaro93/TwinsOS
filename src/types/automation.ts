// ─── Triggers ─────────────────────────────────────────────────────────────────

export type TriggerType =
  | "meter_threshold"
  | "part_low_stock"
  | "pm_due"
  | "wo_overdue"
  | "request_submitted"
  | "wo_status_change"
  | "po_status_change";

export interface MeterThresholdTrigger {
  type: "meter_threshold";
  meterId: string;       // references Meter.id
  meterLabel: string;    // "{meter.name} — {meter.assetName}" for display
  operator: ">=" | "<=";
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
  toStatus: "draft" | "pending_approval" | "approved" | "rejected" | "ordered" | "closed";
}

export type AutomationTrigger =
  | MeterThresholdTrigger
  | PartLowStockTrigger
  | PMDueTrigger
  | WOOverdueTrigger
  | RequestSubmittedTrigger
  | WOStatusChangeTrigger
  | POStatusChangeTrigger;

// ─── Actions ─────────────────────────────────────────────────────────────────

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
  priority: "low" | "medium" | "high" | "urgent";
  assignedTo: string;
}

/** Creates a Maintenance Request that goes through the approval workflow. */
export interface CreateWORequestAction {
  type: "create_wo_request";
  title: string;
  priority: "low" | "medium" | "high" | "urgent";
  assignedTo: string;
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
  recipient: string;        // email address or name
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
