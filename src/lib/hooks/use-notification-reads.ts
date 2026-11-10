import { useState, useEffect, useCallback, useRef } from "react";
import { createClient, getAuthUser } from "@/lib/supabase/client";
import { realtimeTopic } from "@/lib/supabase/realtime-topic";

/** Per user: alert ids come from the record (req-approval-<id>), so they're
 *  the same for everyone in the org, and a shared office PC used to hand one
 *  user's "mark all read" to the next person who signed in. */
const LS_KEY_PREFIX = "notif_read_ids";
const LS_PRUNE_KEY = "notif_pruned_at";
/** notification_reads rows loaded per page, and at most in total (newest first). */
const READS_PAGE_SIZE = 1000;
const MAX_DB_READS = 5000;

function lsKey(userId: string): string {
  return `${LS_KEY_PREFIX}:${userId}`;
}

/** Sign-out: drop every user's cached read state (and the old shared key). */
export function clearNotificationReadCache(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key === LS_KEY_PREFIX || key.startsWith(`${LS_KEY_PREFIX}:`))) localStorage.removeItem(key);
    }
    localStorage.removeItem(LS_PRUNE_KEY);
  } catch {
    // storage unavailable — non-fatal
  }
}

/** Read the cached set from localStorage (fast, avoids flicker on initial render). */
function readLocalCache(userId: string): Set<string> {
  if (typeof window === "undefined" || !userId) return new Set();
  try {
    const stored = localStorage.getItem(lsKey(userId));
    return stored ? new Set<string>(JSON.parse(stored) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function writeLocalCache(userId: string, ids: Set<string>) {
  if (!userId) return;
  try {
    localStorage.setItem(lsKey(userId), JSON.stringify([...ids]));
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
export function useNotificationReads(activeNotifIds: string[], cacheUserId: string) {
  const [readIds, setReadIdsState] = useState<Set<string>>(() => readLocalCache(cacheUserId));
  const [dbLoaded, setDbLoaded] = useState(false);
  // Cache the authenticated user ID so we can include it in upserts (required by generated types)
  const userIdRef = useRef<string | null>(null);
  const cacheUserIdRef = useRef(cacheUserId);
  cacheUserIdRef.current = cacheUserId;

  // The signed-in user changed (or loaded after first render): swap to their cache.
  useEffect(() => {
    try {
      localStorage.removeItem(LS_KEY_PREFIX); // pre-per-user shared cache
    } catch {
      // storage unavailable — non-fatal
    }
    setReadIdsState(readLocalCache(cacheUserId));
  }, [cacheUserId]);

  // On mount: get user ID, fetch DB rows, and merge into local state.
  // Also set the prune timestamp if it has never been set — this prevents
  // the prune from running immediately on a new device (e.g. phone) and
  // deleting the DB reads we just fetched before they can be applied.
  useEffect(() => {
    if (!cacheUserId) return;
    let cancelled = false;
    setDbLoaded(false);

    // Prevent first-ever-device prune from running right away
    if (!localStorage.getItem(LS_PRUNE_KEY)) {
      localStorage.setItem(LS_PRUNE_KEY, String(Date.now()));
    }

    const supabase = createClient();

    async function fetchFromDb() {
      const user = await getAuthUser();
      if (cancelled) return;
      if (!user) {
        setDbLoaded(true);
        return;
      }
      userIdRef.current = user.id;

      // Paged and bounded: a single select stopped silently at PostgREST's
      // 1000-row cap (an arbitrary 1000, so read marks went missing at random
      // once a user passed it). Newest first, up to MAX_DB_READS rows.
      const reads: string[] = [];
      for (let from = 0; from < MAX_DB_READS; from += READS_PAGE_SIZE) {
        const { data, error } = await supabase
          .from("notification_reads")
          .select("notif_id")
          .eq("user_id", user.id)
          .order("read_at", { ascending: false })
          .order("notif_id")
          .range(from, from + READS_PAGE_SIZE - 1);
        if (cancelled) return;
        if (error) break;
        const page = (data ?? []) as { notif_id: string }[];
        reads.push(...page.map((r) => r.notif_id));
        if (page.length < READS_PAGE_SIZE) break;
      }

      if (reads.length > 0) {
        setReadIdsState((prev) => {
          const merged = new Set([...prev, ...reads]);
          writeLocalCache(cacheUserIdRef.current, merged);
          return merged;
        });
      }

      setDbLoaded(true);
    }
    fetchFromDb();

    // Realtime: pick up reads made on other devices immediately
    const channel = supabase
      .channel(realtimeTopic("notification_reads_sync"))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notification_reads" },
        (payload) => {
          const notifId = (payload.new as { notif_id: string }).notif_id;
          setReadIdsState((prev) => {
            if (prev.has(notifId)) return prev;
            const next = new Set([...prev, notifId]);
            writeLocalCache(cacheUserIdRef.current, next);
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [cacheUserId]);

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
      writeLocalCache(cacheUserIdRef.current, pruned);
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
      writeLocalCache(cacheUserIdRef.current, next);

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
      writeLocalCache(cacheUserIdRef.current, next);

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
