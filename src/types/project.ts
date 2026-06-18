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
  contractPrice: number; // cents — what the customer is paying
  laborHours: number | null;
  budgetHours: number | null;
  notes: string | null;
  isArchived: boolean;
  // CRM linkage
  clientId: string | null;
  progressPct: number;
  // joined
  clientName?: string;
}

export type SubcontractCostType = "materials" | "labor" | "other";

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
