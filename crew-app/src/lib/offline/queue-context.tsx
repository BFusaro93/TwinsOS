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
import { drainQueue, startSyncEngine, subscribeQueueChanges } from './sync-engine';
import type { QueueItem } from './types';

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
  enqueueClockIn: (visitId: string, localTime: string) => Promise<void>;
  enqueueClockOut: (visitId: string, localTime: string, notes?: string) => Promise<void>;
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
  }, [refresh]);

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
      enqueueAddPhoto,
      enqueueRequestMaterials,
      retry,
      discard,
      syncNow,
    };
  }, [
    items,
    isReady,
    enqueueClockIn,
    enqueueClockOut,
    enqueueAddPhoto,
    enqueueRequestMaterials,
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
