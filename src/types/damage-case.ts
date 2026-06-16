import { BaseRecord } from "./common";

export type DamageCaseType = "damage" | "warranty";
export type DamageCaseStatus = "open" | "in_progress" | "resolved" | "closed";

export interface DamageCase extends BaseRecord {
  caseNumber: string;
  caseType: DamageCaseType;
  status: DamageCaseStatus;
  customerName: string;
  propertyAddress: string | null;
  dateOfIncident: string;
  description: string;
  resolutionNotes: string | null;
  totalCost: number; // cents, derived from expenses
  linkedPoId: string | null;
}

export interface DamageCaseExpense extends BaseRecord {
  damageCaseId: string;
  expenseDate: string;
  vendorId: string | null;
  vendorName: string | null;
  description: string;
  amount: number; // cents
  purchaseOrderId: string | null;
}
