export type EmploymentStatus = 'full_time' | 'part_time' | 'seasonal' | 'contractor' | 'terminated';
export type CompensationType = 'hourly' | 'salary' | 'commission' | '1099';
export type PaymentFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
export type UserType = 'full_user' | 'field' | 'view_only' | 'no_access';

export interface CRMEmployee {
  id: string;
  orgId: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  deletedAt: string | null;

  // Personal Information
  firstName: string;
  middleInitial: string | null;
  lastName: string;
  printOnCheckAs: string | null;
  email: string | null;
  birthDate: string | null;
  resourceCode: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  driverLicense: string | null;
  isCertifiedDriver: boolean;
  licenseExpiration: string | null;
  insuranceEligibility: string | null;
  coveredByInsurance: boolean;
  applicatorLicense: string | null;
  resourceTags: string[];

  // Employment
  dateHired: string | null;
  phone: string | null;
  cellPhone: string | null;
  pager: string | null;
  maritalStatus: string | null;
  spouseName: string | null;
  i9Number: string | null;
  dateReleased: string | null;
  reasonForRelease: string | null;
  citizenship: string | null;
  emergencyPhone: string | null;
  emergencyContact: string | null;
  numDependants: number;
  spousePhone: string | null;
  i9ExpirationDate: string | null;
  rehireDate: string | null;
  employmentStatus: EmploymentStatus;
  managerId: string | null;

  // Payroll / Job Costing
  compensationType: CompensationType | null;
  resourcePin: string | null;
  eligibleOvertime: boolean;
  hourlyRateCents: number;
  overtimeRateCents: number;
  vacationDays: number;
  sickDays: number;
  commissionPct: number;
  paymentFrequency: PaymentFrequency | null;
  lastPayRaiseCents: number;
  lastPayRaiseDate: string | null;

  // User / App Settings
  userType: UserType;
  showInSelection: boolean;
  showInCalendar: boolean;
  fieldTimeClock: boolean;
  officeTimeClock: boolean;
  sendTextAlerts: boolean;
  userRole: string | null;
  routeSheetFormat: string | null;
  mapIconColor: string | null;
  mapCodes: string | null;
  isSalesRep: boolean;
  startingAddress: string | null;
  startingCity: string | null;
  startingState: string | null;
  startingZip: string | null;
  startingLat: number | null;
  startingLng: number | null;

  notes: string | null;
  isActive: boolean;
  userId: string | null; // linked Supabase auth user (optional)
  crmRoleId: string | null;

  // joined
  managerName?: string;
  crewNames?: string[];
}

export interface CRMCrew {
  id: string;
  orgId: string;
  name: string;
  color: string | null;
  code: string | null;
  isActive: boolean;
  foremanId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Team Details
  tags: string[];
  routeSheetFormat: string | null;
  mapIconColor: string | null;
  mapCodes: string | null;
  showInCalendar: boolean;
  startingAddress: string | null;
  startingCity: string | null;
  startingState: string | null;
  startingZip: string | null;
  startingLat: number | null;
  startingLng: number | null;
  /** Shared crew login (profiles.role === 'crew') this team's Crew App visits resolve to. */
  userId: string | null;
  // joined
  foremanName?: string;
  members?: CRMCrewMember[];
}

/** A shared crew login account (profiles.role === 'crew') available to link to a team. */
export interface CRMCrewLogin {
  id: string;
  name: string;
  email: string | null;
}

export interface CRMCrewMember {
  id: string;
  orgId: string;
  crewId: string;
  employeeId: string;
  isForeman: boolean;
  daysOfWeek: number[]; // 0=Sun, 1=Mon … 6=Sat
  laborBurdenCentsPerHour: number;
  createdAt: string;
  // joined
  employeeName?: string;
  resourceCode?: string | null;
}
