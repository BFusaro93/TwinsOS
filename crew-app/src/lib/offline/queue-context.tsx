import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { randomUUID } from 'expo-crypto';

import { useAuth } from '@/lib/auth-context';
import {
  discardQueueItem,
  enqueueAction,
  initOfflineDb,
  listAllQueueItems,
  retryQueueItem,
} from './db';
import { drainQueue, recoverOrphanedQueueItems, startSyncEngine, subscribeQueueChanges } from './sync-engine';
import { DRIVE_QUEUE_VISIT_ID, type QueueItem } from './types';

interface OfflineQueueContextValue {
  /** True once the SQLite table has been created and the initial queue read has completed. */
  isReady: boolean;
  /** All queue items, oldest first. */
  items: QueueItem[];
  /** Items for a specific visit, oldest first — what a visit screen renders. */
  itemsForVisit: (visitId: string) => QueueItem[];
  /** True while any item is actively being sent. */
  isSyncing: boolean;
  /** Count of items not yet confirmed by the server (pending + syncing). */
  pendingCount: number;
  /** Items the sync engine gave up on (conflict, or exhausted retries) — need user attention. */
  failedItems: QueueItem[];
  /** `visitId` here is the stop's anchor visit id (see CrewStop.anchorVisitId) — clock actions target the whole stop, not one underlying crm_job_visits row. */
  enqueueClockIn: (visitId: string, localTime: string) => Promise<void>;
  enqueueClockOut: (visitId: string, localTime: string, notes?: string) => Promise<void>;
  enqueuePause: (anchorVisitId: string) => Promise<void>;
  enqueueResume: (anchorVisitId: string) => Promise<void>;
  /** Day-level — not tied to any one stop. See DRIVE_QUEUE_VISIT_ID. */
  enqueueStartDrive: () => Promise<void>;
  enqueueEndDrive: () => Promise<void>;
  enqueueAddPhoto: (
    visitId: string,
    localUri: string,
    mimeType: string,
    fileName: string,
    caption?: string
  ) => Promise<void>;
  enqueueRequestMaterials: (
    visitId: string,
    productItemId: string,
    productItemName: string,
    quantity: number,
    note?: string
  ) => Promise<void>;
  /**
   * `visitId` here is the stop's anchor visit id, same as clock actions — see
   * the route's job-id lookup. `usedQty` alone stays billable (`used`);
   * `noInvoice: true` is the deliberate don't-bill case.
   */
  enqueueRecordMaterialUsage: (
    visitId: string,
    jobProductId: string,
    productName: string,
    usage: { usedQty: number; noInvoice?: boolean } | { notUsed: true }
  ) => Promise<void>;
  /** `visitId` here is the stop's anchor visit id, same as clock actions — gates Clock In, matching the web stop page. */
  enqueueAcknowledgeNotes: (anchorVisitId: string) => Promise<void>;
  /** `visitId` here is the stop's anchor visit id, same as clock actions. */
  enqueueAddNote: (anchorVisitId: string, note: string) => Promise<void>;
  /** `visitId` here is the individual service visit id, NOT the stop's anchor — each service in a stop can be skipped independently, matching the web stop page. */
  enqueueSkipVisit: (visitId: string, reason: string, serviceName: string) => Promise<void>;
  /** Resets a failed item back to pending so the sync engine attempts it again. */
  retry: (id: string) => Promise<void>;
  /** Permanently discards a failed item (e.g. after the crew member acknowledges a conflict). */
  discard: (id: string) => Promise<void>;
  /** Forces an immediate sync attempt (e.g. pull-to-refresh). */
  syncNow: () => Promise<void>;
}

const OfflineQueueContext = createContext<OfflineQueueContextValue | undefined>(undefined);

/**
 * Wraps the app, owns the SQLite-backed offline queue, and starts the sync
 * engine once. Mount this above the (app) group in the root layout so it's
 * alive for the whole authenticated session — see src/app/_layout.tsx.
 */
export function OfflineQueueProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [isReady, setIsReady] = useState(false);
  const [items, setItems] = useState<QueueItem[]>([]);

  // Scoped to the signed-in user — see db.ts/sync-engine.ts for why: a
  // previous crew member's queue items on this shared device must never
  // show up (or drain) under the next person's session.
  const refresh = useCallback(async () => {
    if (!userId) {
      setItems([]);
      return;
    }
    const all = await listAllQueueItems(userId);
    setItems(all);
  }, [userId]);

  useEffect(() => {
    let isMounted = true;
    void (async () => {
      await initOfflineDb();
      // Before the first read/drain: an app killed mid-request left its queue
      // item stranded in 'syncing', which nothing ever reset — the card stayed
      // on "Sending…" with no Retry or Discard and the sync chip never
      // cleared. Safe to run alongside a live drain; it skips anything
      // actually in flight.
      if (userId) await recoverOrphanedQueueItems(userId);
      await refresh();
      if (!isMounted) return;
      setIsReady(true);
      startSyncEngine();
    })();

    const unsubscribe = subscribeQueueChanges(() => {
      void refresh();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [refresh, userId]);

  const enqueueClockIn = useCallback(
    async (visitId: string, localTime: string) => {
      if (!userId) throw new Error('Not signed in');
      await enqueueAction({
        id: randomUUID(),
        type: 'clock_in',
        visitId,
        userId,
        payload: { localTime },
      });
      await refresh();
      void drainQueue();
    },
    [refresh, userId]
  );

  const enqueueClockOut = useCallback(
    async (visitId: string, localTime: string, notes?: string) => {
      if (!userId) throw new Error('Not signed in');
      await enqueueAction({
        id: randomUUID(),
        type: 'clock_out',
        visitId,
        userId,
        payload: { localTime, notes },
      });
      await refresh();
      void drainQueue();
    },
    [refresh, userId]
  );

  const enqueuePause = useCallback(
    async (anchorVisitId: string) => {
      if (!userId) throw new Error('Not signed in');
      await enqueueAction({
        id: randomUUID(),
        type: 'pause',
        visitId: anchorVisitId,
        userId,
        payload: {},
      });
      await refresh();
      void drainQueue();
    },
    [refresh, userId]
  );

  const enqueueResume = useCallback(
    async (anchorVisitId: string) => {
      if (!userId) throw new Error('Not signed in');
      await enqueueAction({
        id: randomUUID(),
        type: 'resume',
        visitId: anchorVisitId,
        userId,
        payload: {},
      });
      await refresh();
      void drainQueue();
    },
    [refresh, userId]
  );

  const enqueueStartDrive = useCallback(
    async () => {
      if (!userId) throw new Error('Not signed in');
      await enqueueAction({
        id: randomUUID(),
        type: 'drive_start',
        visitId: DRIVE_QUEUE_VISIT_ID,
        userId,
        payload: {},
      });
      await refresh();
      void drainQueue();
    },
    [refresh, userId]
  );

  const enqueueEndDrive = useCallback(
    async () => {
      if (!userId) throw new Error('Not signed in');
      await enqueueAction({
        id: randomUUID(),
        type: 'drive_end',
        visitId: DRIVE_QUEUE_VISIT_ID,
        userId,
        payload: {},
      });
      await refresh();
      void drainQueue();
    },
    [refresh, userId]
  );

  const enqueueAddPhoto = useCallback(
    async (visitId: string, localUri: string, mimeType: string, fileName: string, caption?: string) => {
      if (!userId) throw new Error('Not signed in');
      await enqueueAction({
        id: randomUUID(),
        type: 'add_photo',
        visitId,
        userId,
        payload: { localUri, mimeType, fileName, caption },
      });
      await refresh();
      void drainQueue();
    },
    [refresh, userId]
  );

  const enqueueRequestMaterials = useCallback(
    async (visitId: string, productItemId: string, productItemName: string, quantity: number, note?: string) => {
      if (!userId) throw new Error('Not signed in');
      await enqueueAction({
        id: randomUUID(),
        type: 'request_materials',
        visitId,
        userId,
        payload: { productItemId, productItemName, quantity, note },
      });
      await refresh();
      void drainQueue();
    },
    [refresh, userId]
  );

  const enqueueRecordMaterialUsage = useCallback(
    async (
      visitId: string,
      jobProductId: string,
      productName: string,
      usage: { usedQty: number; noInvoice?: boolean } | { notUsed: true }
    ) => {
      if (!userId) throw new Error('Not signed in');
      await enqueueAction({
        id: randomUUID(),
        type: 'record_material_usage',
        visitId,
        userId,
        payload: {
          jobProductId,
          productName,
          ...('notUsed' in usage
            ? { notUsed: usage.notUsed }
            : { usedQty: usage.usedQty, noInvoice: usage.noInvoice }),
        },
      });
      await refresh();
      void drainQueue();
    },
    [refresh, userId]
  );

  const enqueueAcknowledgeNotes = useCallback(
    async (anchorVisitId: string) => {
      if (!userId) throw new Error('Not signed in');
      await enqueueAction({
        id: randomUUID(),
        type: 'acknowledge_notes',
        visitId: anchorVisitId,
        userId,
        payload: {},
      });
      await refresh();
      void drainQueue();
    },
    [refresh, userId]
  );

  const enqueueAddNote = useCallback(
    async (anchorVisitId: string, note: string) => {
      if (!userId) throw new Error('Not signed in');
      await enqueueAction({
        id: randomUUID(),
        type: 'add_note',
        visitId: anchorVisitId,
        userId,
        payload: { note },
      });
      await refresh();
      void drainQueue();
    },
    [refresh, userId]
  );

  const enqueueSkipVisit = useCallback(
    async (visitId: string, reason: string, serviceName: string) => {
      if (!userId) throw new Error('Not signed in');
      await enqueueAction({
        id: randomUUID(),
        type: 'skip_service',
        visitId,
        userId,
        payload: { reason, serviceName },
      });
      await refresh();
      void drainQueue();
    },
    [refresh, userId]
  );

  const retry = useCallback(
    async (id: string) => {
      await retryQueueItem(id);
      await refresh();
      void drainQueue();
    },
    [refresh]
  );

  const discard = useCallback(
    async (id: string) => {
      await discardQueueItem(id);
      await refresh();
    },
    [refresh]
  );

  const syncNow = useCallback(() => drainQueue(), []);

  const value = useMemo<OfflineQueueContextValue>(() => {
    const pendingCount = items.filter((i) => i.status === 'pending' || i.status === 'syncing').length;
    const isSyncing = items.some((i) => i.status === 'syncing');
    const failedItems = items.filter((i) => i.status === 'failed');
    return {
      isReady,
      items,
      itemsForVisit: (visitId: string) => items.filter((i) => i.visitId === visitId),
      isSyncing,
      pendingCount,
      failedItems,
      enqueueClockIn,
      enqueueClockOut,
      enqueuePause,
      enqueueResume,
      enqueueStartDrive,
      enqueueEndDrive,
      enqueueAddPhoto,
      enqueueRequestMaterials,
      enqueueRecordMaterialUsage,
      enqueueAcknowledgeNotes,
      enqueueAddNote,
      enqueueSkipVisit,
      retry,
      discard,
      syncNow,
    };
  }, [
    items,
    isReady,
    enqueueClockIn,
    enqueueClockOut,
    enqueuePause,
    enqueueResume,
    enqueueStartDrive,
    enqueueEndDrive,
    enqueueAddPhoto,
    enqueueRequestMaterials,
    enqueueRecordMaterialUsage,
    enqueueAcknowledgeNotes,
    enqueueAddNote,
    enqueueSkipVisit,
    retry,
    discard,
    syncNow,
  ]);

  return <OfflineQueueContext.Provider value={value}>{children}</OfflineQueueContext.Provider>;
}

export function useOfflineQueue(): OfflineQueueContextValue {
  const context = useContext(OfflineQueueContext);
  if (context === undefined) {
    throw new Error('useOfflineQueue must be used within an OfflineQueueProvider');
  }
  return context;
}
