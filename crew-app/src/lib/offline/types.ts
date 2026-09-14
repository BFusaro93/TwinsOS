// Shared types for the offline action queue. See db.ts for the SQLite-backed
// store and sync-engine.ts for the code that drains it.

export type QueueActionType = 'clock_in' | 'clock_out' | 'add_photo' | 'request_materials';

export type QueueStatus = 'pending' | 'syncing' | 'failed';

export interface ClockInPayload {
  /** HH:mm captured at the moment the crew member tapped "Clock In". */
  localTime: string;
}

export interface ClockOutPayload {
  /** HH:mm captured at the moment the crew member tapped "Clock Out". */
  localTime: string;
  notes?: string;
}

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

export type QueuePayload = ClockInPayload | ClockOutPayload | AddPhotoPayload | RequestMaterialsPayload;

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
