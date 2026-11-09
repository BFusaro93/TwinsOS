"use client";

import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { realtimeTopic } from "@/lib/supabase/realtime-topic";

// ── Mutation guard ────────────────────────────────────────────────────────────
// Mutations that write to DB trigger Realtime events mid-flight, which start
// refetches that can return stale data and overwrite optimistic cache patches.
// Acquire the guard in onMutate, release in onSettled. While active, Realtime
// invalidations are suppressed — the mutation's own onSettled handles refresh.
let _guardCount = 0;
/** Max one refetch per table per tab per this many ms; see useTableRealtime. */
const REFETCH_THROTTLE_MS = 2000;
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

    // Leading + trailing throttle. Every change to a published table used to refetch the WHOLE
    // list (up to 1,000 rows, select *) for every tab that has it open, so a burst of changes (a
    // bulk import, PM generation, a busy dispatch day) became a refetch storm: in the 2026-11-08
    // sweep, 180 open tabs and 5 changes/s cut normal request throughput by ~60%, and 813 list
    // refetches in 20s dropped to 136 with a 3s throttle (throughput loss ~60% -> ~22%). The first
    // change still refetches immediately; changes inside the window collapse into one trailing
    // refetch, so lists stay at most REFETCH_THROTTLE_MS behind and never miss the final state.
    let lastFired = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      lastFired = Date.now();
      // Skip invalidation while mutations are in progress — the mutation's
      // own onSettled will refresh data after the DB write has committed.
      if (_guardCount > 0) return;
      queryClient.invalidateQueries({ queryKey });
    };

    const channel = supabase
      .channel(realtimeTopic(`realtime:${table}`))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          const wait = lastFired + REFETCH_THROTTLE_MS - Date.now();
          if (wait <= 0) {
            fire();
          } else if (!timer) {
            timer = setTimeout(() => {
              timer = null;
              fire();
            }, wait);
          }
        }
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // queryKey is intentionally excluded from the dep array.
    // The array reference changes on every render but the logical key is stable.
    // Adding it would cause infinite re-subscription loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, queryClient]);
}
