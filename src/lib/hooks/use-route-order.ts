"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";

/**
 * Remembered stop order, keyed by (crew, weekday, job) — see
 * 20260910120000_crm_crew_route_order.sql. Lets next Monday's board come up in
 * the sequence this Monday was routed in, instead of an unordered crew
 * grouping that has to be re-dragged every week.
 */

/** `${crewId}:${dayOfWeek}:${jobId}` → position within that crew's route for that weekday. */
export type RouteOrderMap = Map<string, number>;

/**
 * The weekday is part of the key: a job served Mon AND Thu has a remembered
 * position for each day, and a crew:job key let whichever row came back last
 * overwrite the other, so one day inherited the other day's sequence.
 */
export function routeOrderKey(crewId: string, dayOfWeek: number, jobId: string): string {
  return `${crewId}:${dayOfWeek}:${jobId}`;
}

/**
 * Weekday (0=Sun … 6=Sat) of a `YYYY-MM-DD` scheduled date — the same value
 * crm_save_route_order stores (`extract(dow from v.scheduled_date)` on the
 * date column, no timezone involved). Parsed as local midnight for the same
 * reason as weekdaysInRange below. Returns null for an unparseable date.
 */
export function weekdayOfDate(iso: string): number | null {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return Number.isNaN(dt.getTime()) ? null : dt.getDay();
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
      type RouteRow = { crew_id: string; day_of_week: number; job_id: string; position: number };
      // PostgREST caps a response at 1000 rows and this table holds one row per
      // (crew, weekday, job), so a busy org exceeds that — page deterministically.
      const PAGE = 1000;
      const rows: RouteRow[] = [];
      for (let offset = 0; ; offset += PAGE) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("crm_crew_route_order")
          .select("crew_id, day_of_week, job_id, position")
          .in("day_of_week", days)
          .order("crew_id")
          .order("day_of_week")
          .order("job_id")
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        const page = (data ?? []) as RouteRow[];
        rows.push(...page);
        if (page.length < PAGE) break;
      }

      const map: RouteOrderMap = new Map();
      for (const row of rows) {
        map.set(routeOrderKey(row.crew_id, row.day_of_week, row.job_id), row.position);
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
