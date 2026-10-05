import { BaseRecord } from "./common";

export type InjuryCaseStatus = "open" | "in_progress" | "resolved" | "closed";
export type InjurySeverity = "first_aid" | "medical_treatment" | "lost_time";
export type InjuryClaimRoute = "workers_comp" | "self_pay";
export type InjuryExpenseType = "medical" | "lost_wages" | "other";

export interface InjuryCase extends BaseRecord {
  caseNumber: string;
  status: InjuryCaseStatus;
  severity: InjurySeverity;
  employeeName: string;
  dateOfIncident: string;
  location: string | null;
  injuryType: string | null;
  bodyPart: string | null;
  description: string;
  treatment: string | null;
  daysAway: number;
  recordable: boolean;
  /** How the cost is handled: through workers' comp, or paid by the company. */
  claimRoute: InjuryClaimRoute | null;
  resolutionNotes: string | null;
  totalCost: number; // cents, derived from expenses
}

export interface InjuryCaseExpense extends BaseRecord {
  injuryCaseId: string;
  expenseDate: string;
  expenseType: InjuryExpenseType;
  vendorId: string | null;
  vendorName: string | null;
  description: string;
  amount: number; // cents
}
