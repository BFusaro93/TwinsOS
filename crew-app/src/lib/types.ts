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

export interface CrewVisitsResponse {
  date: string;
  crewId: string | null;
  crewName: string | null;
  visits: CrewVisit[];
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
