import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

const LS_KEY = "notif_read_ids";
const LS_PRUNE_KEY = "notif_pruned_at";

/** Read the cached set from localStorage (fast, avoids flicker on initial render). */
function readLocalCache(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = localStorage.getItem(LS_KEY);
    return stored ? new Set<string>(JSON.parse(stored) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function writeLocalCache(ids: Set<string>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify([...ids]));
  } catch {
    // storage quota exceeded — non-fatal
  }
}

/**
 * Cross-device notification read state.
 *
 * Strategy:
 * - On mount, prime the state from localStorage immediately (no flicker).
 * - Then fetch the user's rows from `notification_reads` in Supabase and merge
 *   them in — DB wins so reads from other devices appear.
 * - All new marks go to both localStorage (immediate UI) and Supabase (sync).
 */
export function useNotificationReads(activeNotifIds: string[]) {
  const [readIds, setReadIdsState] = useState<Set<string>>(readLocalCache);
  const [dbLoaded, setDbLoaded] = useState(false);
  // Cache the authenticated user ID so we can include it in upserts (required by generated types)
  const userIdRef = useRef<string | null>(null);

  // On mount: get user ID, fetch DB rows, and merge into local state
  useEffect(() => {
    let cancelled = false;
    async function fetchFromDb() {
      const supabase = createClient();

      // Fetch user ID and notification reads in parallel
      const [{ data: { user } }, { data: reads }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("notification_reads").select("notif_id"),
      ]);

      if (cancelled) return;

      if (user) {
        userIdRef.current = user.id;
      }

      if (reads && reads.length > 0) {
        setReadIdsState((prev) => {
          const merged = new Set([...prev, ...reads.map((r) => r.notif_id)]);
          writeLocalCache(merged);
          return merged;
        });
      }

      setDbLoaded(true);
    }
    fetchFromDb();
    return () => { cancelled = true; };
  }, []);

  // Prune stale IDs monthly to keep localStorage + DB clean.
  // IMPORTANT: wait for both dbLoaded AND activeNotifIds to be populated.
  // If we prune while activeNotifIds is still [] (data queries still loading),
  // we'd wipe every read ID from localStorage and Supabase — causing all
  // notifications to appear unread on every new session.
  useEffect(() => {
    if (!dbLoaded) return;
    if (activeNotifIds.length === 0) return; // notification data still loading — skip

    const lastPruned = localStorage.getItem(LS_PRUNE_KEY);
    const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    if (lastPruned && Number(lastPruned) >= monthAgo) return;

    const activeSet = new Set(activeNotifIds);

    // Prune local state to only active IDs
    setReadIdsState((prev) => {
      const pruned = new Set([...prev].filter((id) => activeSet.has(id)));
      writeLocalCache(pruned);
      return pruned;
    });

    // Prune DB rows whose notification IDs are no longer active
    const supabase = createClient();
    supabase
      .from("notification_reads")
      .delete()
      .not("notif_id", "in", `(${activeNotifIds.map((id) => `"${id}"`).join(",")})`)
      .then(() => {});

    localStorage.setItem(LS_PRUNE_KEY, String(Date.now()));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbLoaded, activeNotifIds.length]); // re-evaluate when data finishes loading

  /** Mark a single notification as read. */
  const markRead = useCallback((notifId: string) => {
    setReadIdsState((prev) => {
      if (prev.has(notifId)) return prev;
      const next = new Set([...prev, notifId]);
      writeLocalCache(next);

      const userId = userIdRef.current;
      if (userId) {
        const supabase = createClient();
        supabase
          .from("notification_reads")
          .upsert({ user_id: userId, notif_id: notifId }, { onConflict: "user_id,notif_id" })
          .then(() => {});
      }

      return next;
    });
  }, []);

  /** Mark all provided IDs as read. */
  const markAllRead = useCallback((notifIds: string[]) => {
    if (notifIds.length === 0) return;
    setReadIdsState((prev) => {
      const next = new Set([...prev, ...notifIds]);
      writeLocalCache(next);

      const userId = userIdRef.current;
      if (userId) {
        const supabase = createClient();
        supabase
          .from("notification_reads")
          .upsert(
            notifIds.map((id) => ({ user_id: userId, notif_id: id })),
            { onConflict: "user_id,notif_id" }
          )
          .then(() => {});
      }

      return next;
    });
  }, []);

  return { readIds, markRead, markAllRead };
}
