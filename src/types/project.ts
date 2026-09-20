import { BaseRecord } from "./common";

export type ProjectStatus =
  | "sold"
  | "scheduled"
  | "in_progress"
  | "complete"
  | "on_hold"
  | "canceled";

export interface Project extends BaseRecord {
  name: string;
  customerName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  status: ProjectStatus;
  startDate: string;
  endDate: string | null;
  totalCost: number; // cents, derived
  /** Revised contract: originalContractPrice + every approved change order. Derived — don't write it. */
  contractPrice: number; // cents — what the customer is paying
  /** The contract before any change orders. This is the editable figure. */
  originalContractPrice: number; // cents
  estimatedCostCents: number; // cents — EAC, re-forecastable over the job's life (WIP report input)
  laborHours: number | null;
  budgetHours: number | null;
  laborRateCents: number | null;
  burdenedRateCents: number | null;
  notes: string | null;
  isArchived: boolean;
  // CRM linkage
  clientId: string | null;
  progressPct: number;
  // joined
  clientName?: string;
}

export type SubcontractCostType = "materials" | "labor" | "subcontractor" | "other";

export interface ProjectSubcontractCost extends BaseRecord {
  projectId: string;
  vendorId: string | null;
  vendorName: string;
  description: string;
  costType: SubcontractCostType;
  amount: number; // cents
  costDate: string | null;
  notes: string | null;
}

// ── change orders ─────────────────────────────────────────────────────────────

export type ChangeOrderStatus = "draft" | "pending_approval" | "approved" | "rejected";

/**
 * The statuses a plain UPDATE may set. Crossing the 'approved' boundary moves
 * the contract price and has to reshape the billing schedule with it, so it
 * belongs to approve_change_order / reverse_change_order — a BEFORE trigger on
 * project_change_orders refuses it from anywhere else. Excluding it here means
 * the mistake doesn't compile rather than failing at the database.
 */
export type ChangeOrderEditableStatus = Exclude<ChangeOrderStatus, "approved">;

/** How an approved change order lands on the project's billing schedule. */
export type ChangeOrderTreatment =
  /** Spread pro-rata across the milestones not yet invoiced. */
  | "distribute"
  /** Bill the change order on its own milestone, any time. */
  | "own_milestone"
  /** Tack it onto the last milestone still pending. */
  | "final_milestone"
  /** Leave the schedule alone and bill it manually. */
  | "none";

export interface ProjectChangeOrder extends BaseRecord {
  projectId: string;
  coNumber: number;
  title: string;
  description: string;
  /** Signed — a deductive change order (scope removed) is negative. */
  amountCents: number;
  /** What the added scope costs; moves the project's EAC on approval. */
  costImpactCents: number;
  status: ChangeOrderStatus;
  billingTreatment: ChangeOrderTreatment;
  requestedDate: string;
  approvedAt: string | null;
  approvedBy: string | null;
  /** The client's authorisation — their PO number, email, signature ref. */
  clientReference: string | null;
}
