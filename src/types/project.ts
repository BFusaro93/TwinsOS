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
  status: ProjectStatus;
  startDate: string;
  endDate: string | null;
  totalCost: number; // cents, derived
  notes: string | null;
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
