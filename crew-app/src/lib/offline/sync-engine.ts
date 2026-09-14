import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { File } from 'expo-file-system';

import { ApiError, clockInVisit, clockOutVisit, requestMaterials, uploadVisitPhoto } from '@/lib/api';
import { supabase } from '@/lib/supabase';

import {
  listPendingQueueItems,
  removeQueueItem,
  setQueueItemStatus,
} from './db';
import {
  MAX_SYNC_ATTEMPTS,
  type AddPhotoPayload,
  type ClockInPayload,
  type ClockOutPayload,
  type QueueItem,
  type RequestMaterialsPayload,
} from './types';

// Drains the local offline queue against the real API. Triggered by (a)
// connectivity regained, (b) the app coming to the foreground, and (c) a
// 30s fallback interval — see startSyncEngine(). Screens never call the
// api.ts functions directly for queued actions; they enqueue via
// src/lib/offline/queue-context.tsx and this file does the actual syncing,
// so an action written to the queue is guaranteed to eventually be
// attempted even if the screen that created it has since unmounted.

type Listener = () => void;
const listeners = new Set<Listener>();

/** Subscribe to "the queue changed" (item added/status changed/removed). Returns an unsubscribe fn. */
export function subscribeQueueChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners(): void {
  for (const l of listeners) l();
}

/** Thrown internally to abort the rest of a drain pass when we hit what looks like a plain
 *  connectivity failure — no point burning through every other queued item's retry budget
 *  when the device has no signal at all; the next trigger (interval/foreground/reconnect)
 *  will pick up where this left off. */
class ConnectivityStop extends Error {}

let isDraining = false;

async function processItem(item: QueueItem): Promise<void> {
  await setQueueItemStatus(item.id, 'syncing');
  notifyListeners();

  try {
    switch (item.type) {
      case 'clock_in': {
        const payload = item.payload as ClockInPayload;
        await clockInVisit(item.visitId, payload.localTime, item.id);
        break;
      }
      case 'clock_out': {
        const payload = item.payload as ClockOutPayload;
        await clockOutVisit(item.visitId, payload.localTime, item.id, payload.notes);
        break;
      }
      case 'add_photo': {
        const payload = item.payload as AddPhotoPayload;
        await uploadVisitPhoto(
          item.visitId,
          payload.localUri,
          payload.mimeType,
          payload.fileName,
          item.id,
          payload.caption
        );
        // Only delete the local temp copy after a confirmed successful upload.
        try {
          new File(payload.localUri).delete();
        } catch {
          // Already gone or inaccessible — not fatal, the DB row is removed below regardless.
        }
        break;
      }
      case 'request_materials': {
        const payload = item.payload as RequestMaterialsPayload;
        await requestMaterials(item.visitId, payload.productItemId, payload.quantity, item.id, payload.note);
        break;
      }
    }
    await removeQueueItem(item.id);
    notifyListeners();
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      // The server rejected this as a conflict (already clocked in/out from elsewhere) —
      // surface it plainly rather than retrying forever or discarding silently.
      await setQueueItemStatus(item.id, 'failed', {
        attempts: item.attempts + 1,
        lastError: "This didn't sync — a supervisor may have already updated this visit.",
      });
      notifyListeners();
      return;
    }

    if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
      // Non-retryable client error (bad request, visit not found, etc.) — retrying the
      // same payload won't change the outcome.
      await setQueueItemStatus(item.id, 'failed', {
        attempts: item.attempts + 1,
        lastError: err.message,
      });
      notifyListeners();
      return;
    }

    // Either a 5xx from the server or the fetch/upload itself threw (no ApiError at all,
    // e.g. "Network request failed") — treat as transient and retry with a cap.
    const attempts = item.attempts + 1;
    const message = err instanceof Error ? err.message : String(err);
    if (attempts >= MAX_SYNC_ATTEMPTS) {
      await setQueueItemStatus(item.id, 'failed', {
        attempts,
        lastError: `Still failing after ${attempts} attempts: ${message}`,
      });
    } else {
      await setQueueItemStatus(item.id, 'pending', { attempts, lastError: message });
    }
    notifyListeners();

    if (!(err instanceof ApiError)) {
      // Looks like a connectivity failure rather than a server response — stop this pass.
      throw new ConnectivityStop(message);
    }
  }
}

/** Drains the pending queue, oldest first. Safe to call redundantly — re-entrant calls no-op. */
export async function drainQueue(): Promise<void> {
  if (isDraining) return;
  isDraining = true;
  try {
    // Scoped to whoever's actually signed in right now — on a shared device,
    // a previous crew member's still-pending items (enqueued before a
    // sign-out/sign-in handoff mid-shift) must never drain under the next
    // person's session; they stay pending until that first crew member
    // signs back in on this device. See enqueueAction()'s userId param.
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;

    const items = await listPendingQueueItems(userId);
    for (const item of items) {
      try {
        await processItem(item);
      } catch (err) {
        if (err instanceof ConnectivityStop) break;
        // Unexpected error outside the try/catch in processItem (shouldn't normally happen,
        // since processItem catches everything) — log and keep draining the rest.
        console.error('[offline sync] unexpected error processing queue item', item.id, err);
      }
    }
  } finally {
    isDraining = false;
  }
}

let started = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;
let netInfoUnsub: (() => void) | null = null;

/** Wires up all three sync triggers. Idempotent — safe to call multiple times (e.g. StrictMode). */
export function startSyncEngine(): void {
  if (started) return;
  started = true;

  netInfoUnsub = NetInfo.addEventListener((state) => {
    if (state.isConnected) void drainQueue();
  });

  const onAppStateChange = (next: AppStateStatus) => {
    if (next === 'active') void drainQueue();
  };
  appStateSub = AppState.addEventListener('change', onAppStateChange);

  intervalHandle = setInterval(() => void drainQueue(), 30_000);

  // Attempt once immediately in case there's already a pending queue from a previous session.
  void drainQueue();
}

export function stopSyncEngine(): void {
  if (!started) return;
  started = false;
  netInfoUnsub?.();
  netInfoUnsub = null;
  appStateSub?.remove();
  appStateSub = null;
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}
