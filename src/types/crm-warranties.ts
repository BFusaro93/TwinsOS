export type WarrantyRecordStatus = "pending" | "active" | "void";

export interface WarrantyType {
  id: string;
  name: string;
  defaultDurationMonths: number;
  defaultCoverage: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface CRMWarranty {
  id: string;
  clientId: string;
  clientName: string | null;
  projectId: string | null;
  projectName: string | null;
  jobId: string | null;
  warrantyTypeId: string | null;
  name: string;
  coverage: string | null;
  durationMonths: number;
  status: WarrantyRecordStatus;
  startDate: string | null;
  endDate: string | null;
  damagesCoveredCents: number | null;
  notes: string | null;
  voidReason: string | null;
  renewedFromId: string | null;
  createdAt: string;
  /** Sum of expenses on linked warranty claims (damage cases), in cents. */
  claimedCents: number;
  claimCount: number;
}
