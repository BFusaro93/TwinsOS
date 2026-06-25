export type JobType = 'recurring' | 'one_time' | 'waiting_list' | 'package' | 'snow' | 'project';
export type JobStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'skipped' | 'hold';
export type ClientJobStatus = 'active' | 'complete' | 'cancelled' | 'on_hold';

export interface CRMService {
  id: string;
  orgId: string;
  name: string;
  code: string | null;
  category: string;
  defaultRateCents: number | null;
  productionRateSqftPerHr: number | null;
  unit: string;
  isActive: boolean;
  // SA-parity fields
  parentServiceId: string | null;
  serviceMode: 'flat_rate' | 'hourly' | 'per_unit';
  defaultBHrs: number;
  defaultBCostCents: number;
  showInSnowDispatch: boolean;
  onlyForEstimates: boolean;
  trackChemicals: boolean;
  invoiceDescription: string | null;
  descriptionOnEstimate: string | null;
  callScriptNotes: string | null;
  taskColor: string;
  targetRateCents: number;
  targetRateWithDriveCents: number;
  rateMatrixField: string | null;
  rateMatrixCalc: string;
  matrixTailEveryQty: number | null;
  matrixTailOverQty: number | null;
  matrixTailRateCents: number | null;
  matrixTailHours: number | null;
  matrixTailCostCents: number | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CRMServiceRateMatrixRow {
  id: string;
  orgId: string;
  serviceId: string;
  fromQty: number;
  toQty: number;
  rateCents: number;
  budgetedHours: number;
  budgetedCostCents: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CRMCrew {
  id: string;
  orgId: string;
  name: string;
  color: string | null;
  isActive: boolean;
  deletedAt: string | null;
  createdAt: string;
}

export interface CRMJobService {
  id: string;
  jobId: string;
  serviceId: string | null;
  serviceName: string;
  qty: number;
  rateCents: number | null;
  startDate: string | null;
  completeByDate: string | null;
  startRecurring: string | null;
  assignedTo: string | null;
  budgetedHours: number;
  teamSize: number;
  daysCount: number;
  timeStart: string | null;
  timeEnd: string | null;
  included: boolean;
  sortOrder: number;
}

export interface CRMJob {
  id: string;
  orgId: string;
  clientId: string;
  propertyId: string | null;
  jobType: JobType;
  status: JobStatus;
  subStatus: string | null;
  scheduledDate: string | null;
  startTime: string | null;
  endTime: string | null;
  waitingListStart: string | null;
  waitingListEnd: string | null;
  recurrenceRule: string | null;
  recurrenceStart: string | null;
  recurrenceEnd: string | null;
  packageId: string | null;
  packageStep: number | null;
  packageTotalSteps: number | null;
  crewId: string | null;
  manCount: number;
  rateCents: number | null;
  budgetedHours: number | null;
  actualHours: number | null;
  serviceAddress: string | null;
  serviceCity: string | null;
  serviceState: string | null;
  serviceZip: string | null;
  mapCode: string | null;
  lastServiceDate: string | null;
  notesToCrew: string | null;
  completionNotes: string | null;
  invoiceDescription: string | null;
  projectId: string | null;
  priority: number;
  contractId: string | null;
  schedule: string | null;
  scheduleDays: string[];
  packageName: string | null;
  packageRenewal: string | null;
  packageDiscount: string | null;
  conflictDays: string[];
  inchTrigger: number | null;
  invoiceType: string | null;
  salesRep: string | null;
  source: string | null;
  paymentType: string | null;
  poNumber: string | null;
  dateSold: string | null;
  whenToInvoice: string | null;
  invoiceSeparately: boolean;
  callAhead: boolean;
  arrivalWindowHours: number | null;
  startDateWindow: string | null;
  endDateWindow: string | null;
  createWorkOrder: boolean;
  isComplete: boolean;
  serviceTotalCents: number;
  productTotalCents: number;
  taxCents: number;
  totalCents: number;
  notes: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  clientName?: string;
  clientPhone?: string;
  crewName?: string;
  services?: CRMJobService[];
}

export interface NewJobFormValues {
  clientId: string;
  propertyId: string;
  jobType: JobType;
  scheduledDate: string;
  startTime: string;
  crewId: string;
  manCount: number;
  rateCents: number;
  serviceAddress: string;
  serviceCity: string;
  serviceZip: string;
  notes: string;
  services: { serviceName: string; qty: number; rateCents: number }[];
}

export interface NewClientJobFormValues {
  clientId: string;
  jobType: JobType;
  contractId: string | null;
  schedule: string | null;
  scheduleDays: string[];
  packageName: string | null;
  packageRenewal: string | null;
  packageDiscount: string | null;
  conflictDays: string[];
  inchTrigger: number | null;
  invoiceType: string | null;
  salesRep: string | null;
  source: string | null;
  paymentType: string | null;
  poNumber: string | null;
  dateSold: string | null;
  whenToInvoice: string | null;
  invoiceSeparately: boolean;
  callAhead: boolean;
  arrivalWindowHours: number | null;
  scheduledDate: string | null;
  waitingListStart: string | null;
  waitingListEnd: string | null;
  startDateWindow: string | null;
  endDateWindow: string | null;
  createWorkOrder: boolean;
  isComplete: boolean;
  notes: string | null;
  notesToCrew: string | null;
  services: NewClientJobServiceValues[];
}

export type VisitStatus = 'scheduled' | 'dispatched' | 'in_progress' | 'completed' | 'cancelled' | 'skipped'

export interface JobComment {
  id: string
  authorName: string
  authorId: string
  text: string
  createdAt: string
}

export interface CRMJobVisit {
  id: string
  orgId: string
  jobId: string
  clientId: string
  clientName?: string | null
  clientPhone?: string | null
  crewId: string | null
  crewName?: string | null
  scheduledDate: string
  startTime: string | null
  endTime: string | null
  status: VisitStatus
  subStatus: string | null
  orderNum: number | null
  completionNotes: string | null
  actualHours: number | null
  budgetedHours: number | null
  completedAt: string | null
  priority: number
  notesToCrew: string | null
  notesToClient: string | null
  invoiceDescription: string | null
  menCount: number
  qty: number | null
  rateCents: number | null
  jobComments: JobComment[]
  assignedEmployeeId: string | null
  dispatchedAt: string | null
  clockedInAt: string | null
  clockedOutAt: string | null
  acknowledgedNotesAt: string | null
  skipReason: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  job?: CRMJob
  photos?: VisitPhoto[]
}

export interface VisitPhoto {
  id: string
  visitId: string
  jobId: string
  storagePath: string
  caption: string | null
  uploadedBy: string | null
  createdAt: string
}

export interface CrewMemberTime {
  id: string
  visitId: string
  crewMemberId: string
  memberName?: string | null
  memberRole?: string | null
  clockedInAt: string | null
  clockedOutAt: string | null
  breakMinutes: number
  lunchMinutes: number
}

export interface CRMSchedule {
  id: string;
  orgId: string;
  name: string;
  frequency: 'weekly' | 'bi_weekly' | 'every_3_weeks' | 'every_4_weeks' | 'monthly';
  dayOfWeek: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  weekPattern: 'even' | 'odd' | 'any' | null;
  anchorDate: string | null;
  seasonStart: string | null; // 'MM-DD', e.g. '04-01'
  seasonEnd: string | null;   // 'MM-DD', e.g. '11-30'
  isActive: boolean;
}

export interface NewClientJobServiceValues {
  serviceName: string;
  startDate: string | null;
  completeByDate: string | null;
  startRecurring: string | null;
  assignedTo: string | null;
  qty: number;
  rateCents: number;
  budgetedHours: number;
  teamSize: number;
  daysCount: number;
  timeStart: string | null;
  timeEnd: string | null;
  included: boolean;
  sortOrder: number;
}
