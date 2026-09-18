import * as SQLite from 'expo-sqlite';

import type { QueueActionType, QueueItem, QueuePayload, QueueStatus } from './types';

// Durable local queue: a single SQLite table. This is the source of truth for
// "did this action reach the server yet" — never in-memory state, so a
// killed/crashed app picks back up exactly where it left off on next launch.
const DB_NAME = 'crew-offline.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS queue_items (
          id TEXT PRIMARY KEY NOT NULL,
          type TEXT NOT NULL,
          visit_id TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL,
          status TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT
        );
      `);
      // Added after this table's first release — this queue previously had
      // no notion of whose session enqueued an item, so on a shared device a
      // sign-out/sign-in handoff mid-shift could drain crew member A's
      // still-pending clock-in/photos under crew member B's session. Guarded
      // (not baked into the CREATE TABLE above) so an existing on-device
      // install with rows already in this table doesn't fail to open.
      const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(queue_items)`);
      if (!columns.some((c) => c.name === 'user_id')) {
        // Existing rows (from before this column existed) get '' — they're
        // orphaned either way since we can't recover whose session created
        // them; the sync engine treats '' as "not this session's" and just
        // leaves them pending rather than guessing.
        await db.execAsync(`ALTER TABLE queue_items ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`);
      }
      return db;
    });
  }
  return dbPromise;
}

/** Call once at app startup so the first queue read/write isn't slowed by table creation. */
export async function initOfflineDb(): Promise<void> {
  await getDb();
}

interface QueueRow {
  id: string;
  type: QueueActionType;
  visit_id: string;
  user_id: string;
  payload: string;
  created_at: string;
  status: QueueStatus;
  attempts: number;
  last_error: string | null;
}

function rowToItem(row: QueueRow): QueueItem {
  return {
    id: row.id,
    type: row.type,
    visitId: row.visit_id,
    userId: row.user_id,
    payload: JSON.parse(row.payload) as QueuePayload,
    createdAt: row.created_at,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
  };
}

export async function enqueueAction(item: {
  id: string;
  type: QueueActionType;
  visitId: string;
  userId: string;
  payload: QueuePayload;
}): Promise<QueueItem> {
  const db = await getDb();
  const createdAt = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO queue_items (id, type, visit_id, user_id, payload, created_at, status, attempts, last_error)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, NULL)`,
    [item.id, item.type, item.visitId, item.userId, JSON.stringify(item.payload), createdAt]
  );
  return {
    id: item.id,
    type: item.type,
    visitId: item.visitId,
    userId: item.userId,
    payload: item.payload,
    createdAt,
    status: 'pending',
    attempts: 0,
    lastError: null,
  };
}

/**
 * All queue items for the given user, oldest first — used to hydrate UI
 * state (queue + optimistic overlay). Scoped to userId so a leftover item
 * from a previous crew member's session on this shared device never
 * displays to (or drains under) whoever's signed in now.
 */
export async function listAllQueueItems(userId: string): Promise<QueueItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<QueueRow>(
    `SELECT * FROM queue_items WHERE user_id = ? ORDER BY created_at ASC`,
    [userId]
  );
  return rows.map(rowToItem);
}

/** This user's pending items only, oldest first — what the sync engine drains. */
export async function listPendingQueueItems(userId: string): Promise<QueueItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<QueueRow>(
    `SELECT * FROM queue_items WHERE status = 'pending' AND user_id = ? ORDER BY created_at ASC`,
    [userId]
  );
  return rows.map(rowToItem);
}

export async function setQueueItemStatus(
  id: string,
  status: QueueStatus,
  fields?: { attempts?: number; lastError?: string | null }
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE queue_items SET status = ?, attempts = COALESCE(?, attempts), last_error = ? WHERE id = ?`,
    [status, fields?.attempts ?? null, fields?.lastError ?? null, id]
  );
}

export async function removeQueueItem(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM queue_items WHERE id = ?`, [id]);
}

/**
 * Puts orphaned 'syncing' rows back to 'pending'. A queue item is flipped to
 * 'syncing' before its request goes out, so an app killed (or crashed, or
 * OOM'd by iOS) mid-request leaves the row stuck there forever: the drain
 * only ever selects 'pending', and the UI renders Retry/Discard only for
 * 'failed' — so the card sat on "Sending…" with its controls locked and the
 * sync chip never cleared.
 *
 * `excludeIds` are the items genuinely in flight in this process right now
 * (see the sync engine's in-flight set), so calling this while a drain is
 * running can't double-send one. `attempts` is left alone: being killed
 * isn't a failed attempt, and burning the retry budget on it would give up
 * on a perfectly good action.
 */
export async function resetOrphanedSyncingItems(userId: string, excludeIds: string[]): Promise<number> {
  const db = await getDb();
  const placeholders = excludeIds.map(() => '?').join(', ');
  const result = await db.runAsync(
    `UPDATE queue_items SET status = 'pending' WHERE status = 'syncing' AND user_id = ?` +
      (excludeIds.length > 0 ? ` AND id NOT IN (${placeholders})` : ''),
    [userId, ...excludeIds]
  );
  return result.changes;
}

/** Resets a failed item back to pending with a clean attempt count — the user's "Retry" affordance. */
export async function retryQueueItem(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE queue_items SET status = 'pending', attempts = 0, last_error = NULL WHERE id = ?`,
    [id]
  );
}

/** Discards a failed item permanently — used when the user acknowledges a conflict and moves on. */
export async function discardQueueItem(id: string): Promise<void> {
  await removeQueueItem(id);
}
