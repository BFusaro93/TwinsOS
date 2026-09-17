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
  notesToCrew: string | null;
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
  date: string;
  crewId: string | null;
  crewName: string | null;
  visits: CrewVisit[];
  stops: CrewStop[];
  drive: CrewDriveInfo;
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
  unitCostCents: number;
  category: 'stocked_material' | 'project_material';
}

// Mirrors GET /api/crm/crew/visits/:id/chemicals — read-only chemical mix
// info (see src/app/api/crm/crew/visits/[visitId]/chemicals/route.ts).
// solutionAmount/solutionUnitName are only populated when the office has
// auto-calc on and the rate's units were convertible; null means "ask the
// office for the mix ratio" rather than a wrong guess.
export interface VisitChemicalApplication {
  id: string;
  productName: string | null;
  used: boolean;
  chemicalAmount: number | null;
  unitName: string | null;
  solutionAmount: number | null;
  solutionUnitName: string | null;
  applicationRateLabel: string | null;
}

export type RequisitionStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'ordered' | 'closed';

// Mirrors shapeRequisition() (src/app/api/v1/requisitions/shape.ts), as
// returned by GET/POST /api/crm/crew/visits/:id/requisitions — the "My
// Requests" status list on the visit screen.
export interface VisitRequisition {
  id: string;
  requisitionNumber: string;
  title: string;
  status: RequisitionStatus;
  requestedByName: string;
  grandTotalCents: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
