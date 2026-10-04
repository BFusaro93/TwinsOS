import { BaseRecord } from "./common";

export type InjuryCaseStatus = "open" | "in_progress" | "resolved" | "closed";
export type InjurySeverity = "first_aid" | "medical_treatment" | "lost_time";

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
  resolutionNotes: string | null;
}
