export interface BaseRecord {
  id: string;
  orgId: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  deletedAt: string | null;
}

export type Role = "admin" | "manager" | "technician" | "purchaser" | "viewer" | "requestor" | "crew";

export interface OrgUser {
  id: string;
  orgId: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  status: "active" | "invited" | "inactive";
  createdAt: string;
  /** Photo Documentation module access flag (auto-granted to admin). */
  photoModuleAccess: boolean;
}

export type ApprovalStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "ordered"
  | "closed";
