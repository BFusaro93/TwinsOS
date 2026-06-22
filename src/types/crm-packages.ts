export interface CRMPackage {
  id: string;
  orgId: string;
  name: string;
  code: string | null;
  description: string | null;
  monthlyAmountCents: number;
  seasonMonths: number;
  visitsPerSeason: number;
  scheduleFrequency: "weekly" | "biweekly" | "monthly" | "as_needed" | "custom";
  scheduleDays: string[];
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
}
