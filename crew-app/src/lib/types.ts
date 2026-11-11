// Mirrors the shape returned by GET /api/crm/crew/visits and the visit rows
// returned by the clock-in/clock-out routes
// (src/app/api/crm/crew/visits/route.ts, .../[visitId]/clock-in|out/route.ts).
// Kept intentionally small/flat for Phase 2 — only what the schedule list and
// clock in/out screen need.

export type VisitStatus =
  | 'scheduled'
  | 'dispatched'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'skipped';

export interface VisitAddress {
  line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export interface CrewVisit {
  id: string;
  jobId: string;
  clientId: string;
  jobServiceId: string | null;
  crewId: string | null;
  scheduledDate: string;
  startTime: string | null;
  endTime: string | null;
  status: VisitStatus;
  subStatus: string | null;
  priority: number;
  notesToCrew: string | null;
  notesToClient: string | null;
  completionNotes: string | null;
  jobComments: unknown[];
  menCount: number;
  actualHours: number | null;
  clockedInAt: string | null;
  clockedOutAt: string | null;
  acknowledgedNotesAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  clientName: string | null;
  clientPhone: string | null;
  address: VisitAddress;
  jobType: string | null;
  budgetedHours: number | null;
}

// Mirrors one row of GET /api/crm/crew/visits' `stops` array — the
// crew-tablet grouping of "everything at one client/address today" into a
// single card with one clock-in/out, computed server-side by the SAME
// groupVisitsIntoStops() the web crew page uses
// (src/lib/utils/visit-stops.ts, via src/app/api/crm/crew/visits/route.ts).
// This is what home.tsx and visit/[id].tsx render — CrewVisit above is kept
// only because `visits` is still returned alongside `stops` for anything
// that hasn't moved over.
export interface CrewStopVisit {
  id: string;
  jobServiceId: string | null;
  serviceName: string | null;
  /** Wall-clock hours budgeted for this visit (server-computed by visitBudgetHours()). */
  budgetedHours: number | null;
  teamSize: number | null;
  status: VisitStatus;
  startTime: string | null;
  endTime: string | null;
  actualHours: number | null;
  completionNotes: string | null;
  acknowledgedNotesAt: string | null;
  skipReason: string | null;
  jobComments: unknown[];
}

export interface CrewStop {
  /** Stable grouping key (client/day/crew/address) — use as the list key, not anchorVisitId (see below). */
  key: string;
  /** The visit whose id is the target for clock-in/out/pause/resume and photos/materials — same visit the web stop page anchors on. */
  anchorVisitId: string;
  clientName: string | null;
  clientPhone: string | null;
  /** Pre-joined "line1, city" — already a display string server-side, unlike CrewVisit.address. */
  address: string | null;
  propertyId: string | null;
  derivedStatus: VisitStatus;
  clockedInAt: string | null;
  clockedOutAt: string | null;
  /** Set while the stop is on a break — see crm_job_visits.paused_at. */
  pausedAt: string | null;
  breakMinutes: number;
  /** Names of the OTHER crews working this same stop today (multi-crew stops). */
  partnerCrews?: string[];
  notesToCrew: string | null;
  /**
   * When the office last edited those notes. An acknowledgment older than
   * this no longer counts — see isNotesAcknowledgmentCurrent() on the web
   * side, which the clock-in route enforces server-side.
   */
  notesToCrewUpdatedAt: string | null;
  scheduledDate: string;
  visits: CrewStopVisit[];
}

// Mirrors one row of crm_crew_drive_segments as returned by the `drive` field
// of GET /api/crm/crew/visits — day-level, not tied to any one visit/stop.
export interface DriveSegment {
  id: string;
  startedAt: string;
  endedAt: string | null;
  minutes: number | null;
}

export interface CrewDriveInfo {
  openSegment: DriveSegment | null;
  totalMinutes: number;
}

export interface CrewVisitsResponse {
  /** The day answered for — the org's today when no date was asked for. */
  date: string;
  /** The org's IANA timezone (absent from older servers). */
  timeZone?: string;
  crewId: string | null;
  crewName: string | null;
  visits: CrewVisit[];
  stops: CrewStop[];
  drive: CrewDriveInfo;
  /** Org-wide required Before / After photos; absent from older servers. */
  photoRules?: { requireBefore: boolean; requireAfter: boolean };
}

// Mirrors GET /api/crm/crew/visits/:id/photos — a confirmed (already-uploaded)
// photo row from crm_visit_photos, plus a time-limited signed URL for display.
// Kept snake_case-ish on the raw fields since the route doesn't camelCase
// this response (see src/app/api/crm/crew/visits/[visitId]/photos/route.ts).
export interface VisitPhoto {
  id: string;
  visit_id: string;
  storage_path: string;
  caption: string | null;
  created_at: string;
  signedUrl: string | null;
}

// Mirrors GET /api/crm/crew/products — a product_items row filtered to
// categories a field crew may request (stocked_material/project_material,
// never maintenance_part). Used by the "Request Materials" picker.
export interface PickerProduct {
  id: string;
  name: string;
  partNumber: string;
  // No unit cost — the route never returns prices to a crew device.
  category: 'stocked_material' | 'project_material';
}

// Mirrors GET /api/crm/crew/visits/:id/chemicals — read-only chemical mix
// info (see src/app/api/crm/crew/visits/[visitId]/chemicals/route.ts).
// solutionAmount/solutionUnitName are only populated when the office has
// auto-calc on and the rate's units were convertible; null means "ask the
// office for the mix ratio" rather than a wrong guess.
export interface VisitChemicalApplication {
  id: string;
  visitId: string;
  productName: string | null;
  used: boolean;
  chemicalAmount: number | null;
  /** Null when the office planned it with no unit (no rate on file): the crew picks one.
   *  Optional so an older server that doesn't send it reads as "has a unit". */
  unitOfMeasureId?: string | null;
  unitName: string | null;
  solutionAmount: number | null;
  solutionUnitName: string | null;
  applicationRateLabel: string | null;
  /** Preloaded from the service at the planned amount; an estimate until the crew confirms. */
  preloaded: boolean;
  /** When the crew confirmed what was actually used (null = still an estimate). */
  confirmedAt: string | null;
  productId: string | null;
  /** From the product, so the crew can read the label without leaving the stop. */
  epaNumber: string | null;
  reEntryInterval: string | null;
  labelInstructions: string | null;
  restricted: boolean;
  /** How it is being applied; the crew can change these when confirming. */
  applicationMethodId: string | null;
  targetIds: string[];
  areasTreatedIds: string[];
}

/** One row of POST /api/crm/crew/chemicals/confirm; a key left out = unchanged. */
export interface ChemicalConfirmItem {
  id: string;
  used: boolean;
  chemicalAmount?: number;
  /** Required when the planned row has no unit. */
  unitOfMeasureId?: string;
  applicationMethodId?: string | null;
  targetIds?: string[];
  areasTreatedIds?: string[];
}

/** Optional weather / pH recorded on every chemical confirmed in the same request. */
export interface ChemicalConditionsInput {
  temperature?: number;
  windSpeed?: number;
  windDirection?: string;
  phLevel?: number;
}

/** A National Weather Service reading near the stop; GET /api/crm/crew/chemicals/conditions. */
export interface ConditionsReading {
  temperatureF: number | null;
  windMph: number | null;
  windDirection: string | null;
  description: string | null;
  observedAt: string;
  source: 'observation' | 'forecast';
}

/** GET /api/crm/crew/chemicals/catalog?visitId=… — what the crew needs to add a chemical. */
export interface ChemicalCatalog {
  products: { id: string; name: string; defaultUnitId: string | null }[];
  units: { id: string; name: string }[];
  methods: { id: string; name: string }[];
  targets: { id: string; name: string }[];
  areasTreated: { id: string; name: string }[];
  conditionsDisplay: 'weather' | 'ph' | 'both' | 'neither';
}

// GET /api/crm/crew/chemicals/confirm — whether the confirm-chemicals gate
// applies to this stop (org mode + visits an admin waived).
export interface ChemicalConfirmationStatus {
  mode: 'crew_required' | 'office_later';
  waivedVisitIds: string[];
}

// GET /api/crm/crew/upsell-services — services the office opened up for crews
// to suggest from the field. An empty list hides "Suggest work".
export interface UpsellService {
  id: string;
  name: string;
  upsellPitch: string | null;
}

// GET/POST /api/crm/crew/day — the crew's paid day (shop to shop) + roster.
export interface CrewDayMember {
  id: string;
  name: string;
  role: string | null;
  absent: boolean;
  startedAt: string | null;
  endedAt: string | null;
}

export interface CrewDay {
  workDate: string;
  available: { id: string; name: string; role: string | null }[];
  members: CrewDayMember[];
}

export type CrewDayAction = 'start_day' | 'end_day' | 'member_in' | 'member_out' | 'add_member';

// Mirrors GET/POST .../job-products[/:id/use-materials] — materials office
// staff already planned/called for on this job (crm_job_products), distinct
// from VisitRequisition below (an ad-hoc new request for something NOT
// already planned). plannedQty is the original called-for amount; qty is
// the current value, which becomes "quantity actually used" once status
// leaves 'pending' (see supabase/migrations/
// 20260918050000_crm_job_products_planned_qty.sql).
// 'used' = used, inventory decremented, STILL TO BE INVOICED — what the
// crew's "Mark Used" button records, and what JobDetail.tsx sweeps into the
// job's invoice. 'used_no_invoice' is the deliberate don't-bill variant
// behind the secondary "Used — don't bill" action.
export type JobProductStatus = 'pending' | 'invoiced' | 'used' | 'used_no_invoice' | 'not_used';

export interface JobProductMaterial {
  id: string;
  productName: string;
  plannedQty: number;
  qty: number;
  status: JobProductStatus;
}

export type RequisitionStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'ordered' | 'closed';

// Mirrors shapeCrewRequisition() (the crew requisitions route), as
// returned by GET/POST /api/crm/crew/visits/:id/requisitions — the "My
// Requests" status list on the visit screen.
export interface VisitRequisition {
  id: string;
  requisitionNumber: string;
  title: string;
  status: RequisitionStatus;
  requestedByName: string;
  // No totals/vendor — the crew route returns status-tracking fields only.
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GET /api/crm/crew/reference — the company's labels, Safety Data Sheets, SOPs and training. */
export interface ReferenceDocument {
  id: string;
  category: 'sds' | 'label' | 'sop' | 'training' | 'equipment' | 'other';
  title: string;
  description: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  revisionDate: string | null;
  productIds: string[];
}
