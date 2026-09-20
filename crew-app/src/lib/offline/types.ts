// Shared types for the offline action queue. See db.ts for the SQLite-backed
// store and sync-engine.ts for the code that drains it.

export type QueueActionType =
  | 'clock_in'
  | 'clock_out'
  | 'pause'
  | 'resume'
  | 'drive_start'
  | 'drive_end'
  | 'add_photo'
  | 'request_materials'
  | 'record_material_usage'
  | 'acknowledge_notes'
  | 'add_note'
  | 'skip_service';

export type QueueStatus = 'pending' | 'syncing' | 'failed';

/**
 * Sentinel `visitId` for the two drive-time actions, which are day-level and
 * not tied to any one visit/stop (see crm_crew_drive_segments). QueueItem's
 * `visitId` field is otherwise always a real anchor visit id, so this is
 * deliberately not a valid uuid — `itemsForVisit()` filters by exact match,
 * so a drive item can never accidentally attach to a real stop's card.
 */
export const DRIVE_QUEUE_VISIT_ID = '__drive__';

export interface ClockInPayload {
  /** HH:mm captured at the moment the crew member tapped "Clock In". */
  localTime: string;
}

export interface ClockOutPayload {
  /** HH:mm captured at the moment the crew member tapped "Clock Out". */
  localTime: string;
  notes?: string;
}

// Pause/resume/drive-start/drive-end carry no data of their own — the
// server derives everything (which visits, elapsed time) from the anchor
// visit id (or, for drive actions, the caller's crew) and the current
// timestamp. Kept as distinct (empty) types rather than aliasing each other
// so QueuePayload's union stays one type per action, matching every other
// action here.
export type PausePayload = Record<string, never>;
export type ResumePayload = Record<string, never>;
export type DriveStartPayload = Record<string, never>;
export type DriveEndPayload = Record<string, never>;

export interface AddPhotoPayload {
  /** file:// URI of the copy this queue item owns in the app's document dir. */
  localUri: string;
  fileName: string;
  mimeType: string;
  caption?: string;
}

export interface RequestMaterialsPayload {
  productItemId: string;
  /** Denormalized for display while this item is still queued/syncing — the sync engine sends only productItemId. */
  productItemName: string;
  quantity: number;
  note?: string;
}

export interface RecordMaterialUsagePayload {
  jobProductId: string;
  /** Denormalized for display while queued/syncing, mirroring RequestMaterialsPayload's productItemName above. */
  productName: string;
  /** Exactly one of these — a plain union of two request shapes, not both fields at once. */
  usedQty?: number;
  /**
   * Only meaningful alongside usedQty. Absent/false records `used`, which
   * stays billable; true records `used_no_invoice` — the deliberate
   * "we used it, don't charge for it" case behind the secondary action.
   */
  noInvoice?: boolean;
  notUsed?: true;
}

/** Same "no data of its own" shape as PausePayload/ResumePayload above — the
 * server derives which visit and when from the anchor visit id + timestamp. */
export type AcknowledgeNotesPayload = Record<string, never>;

export interface AddNotePayload {
  note: string;
}

export interface SkipServicePayload {
  reason: string;
  /** Denormalized for display while queued/syncing, mirroring RequestMaterialsPayload's productItemName above. */
  serviceName: string;
}

export type QueuePayload =
  | ClockInPayload
  | ClockOutPayload
  | PausePayload
  | ResumePayload
  | DriveStartPayload
  | DriveEndPayload
  | AddPhotoPayload
  | RequestMaterialsPayload
  | RecordMaterialUsagePayload
  | AcknowledgeNotesPayload
  | AddNotePayload
  | SkipServicePayload;

/** A single queued offline action, persisted in SQLite (see db.ts). */
export interface QueueItem {
  id: string;
  type: QueueActionType;
  visitId: string;
  /** auth.users id of whoever was signed in when this action was enqueued —
   * see db.ts's schema comment for why this matters on a shared device. */
  userId: string;
  payload: QueuePayload;
  createdAt: string;
  status: QueueStatus;
  attempts: number;
  lastError: string | null;
}

export const MAX_SYNC_ATTEMPTS = 8;
