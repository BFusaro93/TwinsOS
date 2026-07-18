import type { Role } from "./common";

export type ApprovalEntityType = "requisition" | "purchase_order" | "crm_estimate";

/**
 * For requisition/purchase_order steps this is a generic `Role` (admin/manager/purchaser).
 * For crm_estimate steps this is a `crm_roles.id` instead — CRM approval is gated by
 * CRM-specific roles (Operations Manager, Sales, etc.), not the CMMS Role enum.
 */
export type ApprovalRequiredRole = Role | string;

export interface ApprovalFlowStep {
  id: string;
  order: number;
  requiredRole: ApprovalRequiredRole;
  label: string;
  /** Amount in cents above which this step is required. 0 = always required. */
  thresholdCents: number;
  /**
   * If set, only this specific user receives the approval request for this step.
   * If null, ALL users with `requiredRole` receive a request — any one of them
   * can approve (first to decide wins; the others are auto-superseded).
   */
  assignedUserId: string | null;
}

export interface ApprovalFlow {
  id: string;
  orgId: string;
  name: string;
  entityType: ApprovalEntityType;
  steps: ApprovalFlowStep[];
  createdAt: string;
  updatedAt: string;
}

export type ApprovalRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "skipped"
  | "superseded";

export interface ApprovalRequest {
  id: string;
  orgId: string;
  entityType: ApprovalEntityType;
  entityId: string;
  flowStepId: string;
  order: number;
  approverId: string;
  approverName: string;
  approverRole: ApprovalRequiredRole;
  status: ApprovalRequestStatus;
  decidedAt: string | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}
