"use client";

import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// ── Mutation guard ────────────────────────────────────────────────────────────
// Mutations that write to DB trigger Realtime events mid-flight, which start
// refetches that can return stale data and overwrite optimistic cache patches.
// Acquire the guard in onMutate, release in onSettled. While active, Realtime
// invalidations are suppressed — the mutation's own onSettled handles refresh.
let _guardCount = 0;
export function suppressRealtime() { _guardCount++; }
export function resumeRealtime() { _guardCount--; }

/**
 * Subscribes to Supabase Realtime postgres_changes for a single table and
 * invalidates the given TanStack Query key on any INSERT / UPDATE / DELETE.
 *
 * Call this hook once per table from a top-level component (e.g. RealtimeSync)
 * rather than inside individual data hooks, to avoid creating duplicate channel
 * subscriptions when the same hook is mounted in multiple components.
 */
export function useTableRealtime(table: string, queryKey: QueryKey) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`realtime:${table}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          // Skip invalidation while mutations are in progress — the mutation's
          // own onSettled will refresh data after the DB write has committed.
          if (_guardCount > 0) return;
          queryClient.invalidateQueries({ queryKey });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // queryKey is intentionally excluded from the dep array.
    // The array reference changes on every render but the logical key is stable.
    // Adding it would cause infinite re-subscription loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, queryClient]);
}
