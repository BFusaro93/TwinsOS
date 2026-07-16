export interface CRMPackage {
  id: string;
  orgId: string;
  name: string;
  code: string | null;
  description: string | null;
  /** Client-facing wording shown when this package appears on an estimate. */
  descriptionOnEstimate: string | null;
  monthlyAmountCents: number;
  seasonMonths: number;
  visitsPerSeason: number;
  isActive: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // joined
  services?: CRMPackageService[];
}

export interface CRMPackageService {
  id: string;
  orgId: string;
  packageId: string;
  serviceId: string | null;
  serviceName: string;
  visitsIncluded: number;
  sortOrder: number;
  createdAt: string;
  /** Display label distinct from the service, e.g. "Visit 1" */
  name: string | null;
  /** Window this visit should be scheduled within */
  startDate: string | null;
  endDate: string | null;
  /** Minimum days that must elapse before/between this visit and adjacent ones */
  minDays: number | null;
  defaultBHrs: number | null;
  defaultRateCents: number | null;
}
