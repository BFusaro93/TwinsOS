import type { Role } from "./common";

export interface ApprovalFlowStep {
  id: string;
  order: number;
  requiredRole: Role;
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
  entityType: "requisition" | "purchase_order";
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
  entityType: "requisition" | "purchase_order";
  entityId: string;
  flowStepId: string;
  order: number;
  approverId: string;
  approverName: string;
  approverRole: Role;
  status: ApprovalRequestStatus;
  decidedAt: string | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}
