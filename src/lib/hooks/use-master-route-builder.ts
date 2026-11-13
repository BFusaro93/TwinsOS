"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import type { LatLng } from "@/lib/geo";
import type { SnowRouteStop } from "@/types/crm-jobs";

/** Where a job sits on the Master Routes, whether or not its route is active. */
export interface RouteAssignment {
  routeId: string;
  routeName: string;
}

/**
 * Every job that is a stop on any non-deleted route (active or not). A job is
 * on at most one route (unique index on crm_snow_route_stops.job_id), so this
 * is what "not already on a route" and the "new jobs" list are judged against.
 * useMasterRouteSlots skips inactive routes, which would offer a job that
 * can't actually be added.
 */
export function useRouteAssignments() {
  return useQuery({
    queryKey: ["snow-route-stops", "assignments"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_snow_route_stops")
        .select("job_id, route_id, crm_snow_routes!inner(name, deleted_at)")
        .is("crm_snow_routes.deleted_at", null)
        .range(0, 9999);
      if (error) throw error;
      const map = new Map<string, RouteAssignment>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (data ?? []) as any[]) {
        map.set(r.job_id, { routeId: r.route_id, routeName: r.crm_snow_routes?.name ?? "a route" });
      }
      return map;
    },
  });
}

/** Adds several jobs to a route, one atomic RPC each (keeps sort_order race-free). */
export function useAddRouteStops() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ routeId, jobIds }: { routeId: string; jobIds: string[] }) => {
      const supabase = createClient();
      let added = 0;
      const failed: string[] = [];
      for (const jobId of jobIds) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).rpc("add_snow_route_stop", { p_route_id: routeId, p_job_id: jobId });
        if (error) failed.push(jobId);
        else added++;
      }
      return { added, failed };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["snow-route-stops"] });
      qc.invalidateQueries({ queryKey: ["snow-routes"] });
    },
  });
}

/** Reorder with the new order shown immediately, rolled back if the RPC fails. */
export function useReorderRouteStopsOptimistic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ routeId, orderedStopIds }: { routeId: string; orderedStopIds: string[] }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("reorder_snow_route_stops", {
        p_route_id: routeId,
        p_stops: orderedStopIds.map((id, i) => ({ id, sort_order: i })),
      });
      if (error) throw error;
    },
    onMutate: async ({ routeId, orderedStopIds }) => {
      const key = ["snow-route-stops", routeId];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SnowRouteStop[]>(key);
      if (prev) {
        const byId = new Map(prev.map((s) => [s.id, s]));
        qc.setQueryData<SnowRouteStop[]>(
          key,
          orderedStopIds.map((id, i) => ({ ...(byId.get(id) as SnowRouteStop), sortOrder: i }))
        );
      }
      return { prev, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ["snow-route-stops", vars.routeId] });
      qc.invalidateQueries({ queryKey: ["snow-route-stops", "all"] });
    },
  });
}

export interface RouteOptimizeResult {
  orderedJobIds: string[];
  totalDriveMinutes: number;
  anchoredToShop: boolean;
}

/**
 * Orders a route's jobs with the same optimizer the board's Optimize uses
 * (/api/crm/route-optimize, job mode). "shop" starts from the crew's shop or
 * the company address (Group Stops); "first" keeps stop #1 and routes onward
 * from it (Optimize Route).
 */
export function useOptimizeRouteJobs() {
  return useMutation({
    mutationFn: async (vars: { jobIds: string[]; crewId: string | null; startAt: "shop" | "first" }): Promise<RouteOptimizeResult> => {
      const res = await fetch("/api/crm/route-optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobIds: vars.jobIds,
          crewId: vars.crewId,
          startAt: vars.startAt,
          strategy: "nearest_first",
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        orderedVisitIds?: string[];
        totalDriveMinutes?: number;
        anchoredToShop?: boolean;
      };
      if (!res.ok || !body.orderedVisitIds) throw new Error(body.error ?? "Failed to reach route optimizer");
      return {
        orderedJobIds: body.orderedVisitIds,
        totalDriveMinutes: body.totalDriveMinutes ?? 0,
        anchoredToShop: !!body.anchoredToShop,
      };
    },
  });
}

/** Geocodes a typed address with the browser Maps key (proximity-search centre). */
export async function geocodeAddress(apiKey: string, address: string): Promise<LatLng | null> {
  await loadGoogleMaps(apiKey);
  const geocoder = new google.maps.Geocoder();
  const { results } = await geocoder.geocode({ address });
  const loc = results?.[0]?.geometry?.location;
  return loc ? { lat: loc.lat(), lng: loc.lng() } : null;
}
