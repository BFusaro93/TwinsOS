import { BaseRecord } from "./common";

export type InjuryCaseStatus = "open" | "in_progress" | "resolved" | "closed";
export type InjurySeverity = "first_aid" | "medical_treatment" | "lost_time" | "fatality";
export type InjuryIncidentType = "injury" | "illness" | "near_miss";
export type InjuryClaimRoute = "workers_comp" | "self_pay";
export type InjuryExpenseType = "medical" | "lost_wages" | "other";

export interface InjuryCase extends BaseRecord {
  caseNumber: string;
  status: InjuryCaseStatus;
  incidentType: InjuryIncidentType;
  /** Null for near misses — nobody was hurt. */
  severity: InjurySeverity | null;
  employeeName: string;
  dateOfIncident: string;
  timeOfIncident: string | null; // HH:MM
  jobTitle: string | null;
  supervisorName: string | null;
  toldSupervisor: boolean | null;
  witnesses: string | null;
  activity: string | null;
  location: string | null;
  injuryType: string | null;
  bodyPart: string | null;
  description: string;
  treatment: string | null;
  preventionSuggestion: string | null;
  sawDoctor: boolean | null;
  doctorName: string | null;
  doctorPhone: string | null;
  doctorVisitDate: string | null;
  previouslyInjured: boolean | null;
  ppeUsed: string | null;
  equipmentInvolved: string | null;
  cause: string | null;
  correctiveAction: string | null;
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
