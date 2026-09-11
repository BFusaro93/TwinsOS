"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

/**
 * Remembered stop order, keyed by (crew, weekday, job) — see
 * 20260910120000_crm_crew_route_order.sql. Lets next Monday's board come up in
 * the sequence this Monday was routed in, instead of an unordered crew
 * grouping that has to be re-dragged every week.
 */

/** `${crewId}:${jobId}` → position within that crew's route for that weekday. */
export type RouteOrderMap = Map<string, number>;

export function routeOrderKey(crewId: string, jobId: string): string {
  return `${crewId}:${jobId}`;
}

/**
 * Weekdays (0=Sun … 6=Sat) covered by an inclusive date range. The board can
 * show a multi-day span, so we fetch every weekday it touches — and once the
 * range is a week or longer that is simply all seven.
 *
 * Dates are parsed as local midnight rather than via `new Date(iso)`, which
 * would read a bare `YYYY-MM-DD` as UTC and shift the weekday backwards for
 * anyone behind UTC — exactly the class of bug commit e08936c3 cleaned up.
 */
export function weekdaysInRange(fromDate: string, toDate?: string): number[] {
  const parse = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
  };
  const start = parse(fromDate);
  const end = toDate ? parse(toDate) : start;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const days = new Set<number>();
  const cursor = new Date(start);
  // Bail out at 7 — any longer range covers every weekday anyway.
  while (cursor <= end && days.size < 7) {
    days.add(cursor.getDay());
    cursor.setDate(cursor.getDate() + 1);
  }
  return [...days];
}

export function useCrewRouteOrder(fromDate: string, toDate?: string) {
  const days = weekdaysInRange(fromDate, toDate);

  return useQuery({
    queryKey: ["crew-route-order", days.slice().sort().join(",")],
    enabled: days.length > 0,
    queryFn: async (): Promise<RouteOrderMap> => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_crew_route_order")
        .select("crew_id, job_id, position")
        .in("day_of_week", days);
      if (error) throw error;

      const map: RouteOrderMap = new Map();
      for (const row of (data ?? []) as { crew_id: string; job_id: string; position: number }[]) {
        map.set(routeOrderKey(row.crew_id, row.job_id), row.position);
      }
      return map;
    },
  });
}

/**
 * Saves the day's order. One RPC rather than the previous N parallel per-visit
 * UPDATEs — those could half apply and leave a scrambled sequence with no sign
 * anything had failed, and they had no way to keep the remembered order in
 * step with the per-day priorities.
 */
export function useSaveRouteOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (visitIds: string[]) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("crm_save_route_order", {
        p_visit_ids: visitIds,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
      qc.invalidateQueries({ queryKey: ["crew-route-order"] });
    },
  });
}
