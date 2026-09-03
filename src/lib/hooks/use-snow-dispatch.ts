"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapJob, mapVisit } from "./use-crm-jobs";
import type { CRMJob, CRMJobVisit, StormEvent, StormEventStatus, SnowRoute, SnowRouteStop } from "@/types/crm-jobs";

// ── mappers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStormEvent(row: any): StormEvent {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    eventDate: row.event_date,
    dispatchStatus: row.dispatch_status,
    forecastDepthInches: row.forecast_depth_inches != null ? Number(row.forecast_depth_inches) : null,
    temperature: row.temperature != null ? Number(row.temperature) : null,
    notes: row.notes ?? null,
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSnowRoute(row: any): SnowRoute {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    defaultCrewId: row.default_crew_id ?? null,
    defaultCrewName: row.crm_crews?.name ?? null,
    isActive: row.is_active ?? true,
    stopCount: Array.isArray(row.crm_snow_route_stops) ? (row.crm_snow_route_stops[0]?.count ?? 0) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSnowRouteStop(row: any): SnowRouteStop {
  return {
    id: row.id,
    orgId: row.org_id,
    routeId: row.route_id,
    jobId: row.job_id,
    sortOrder: row.sort_order ?? 0,
    clientName: row.crm_jobs?.clients?.display_name ?? null,
    serviceAddress: row.crm_jobs?.service_address ?? null,
    createdAt: row.created_at,
  };
}

// ── snow jobs (standing on-demand snow jobs per client) ─────────────────────

export function useSnowJobs() {
  return useQuery({
    queryKey: ["crm-jobs", "snow"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_jobs")
        .select(`
          *,
          clients(display_name, primary_phone, priority, billing_address, billing_city, billing_state, billing_zip),
          crm_crews(name),
          crm_job_services(*)
        `)
        .eq("job_type", "snow")
        .is("deleted_at", null)
        // Exclude terminal statuses — a cancelled or on-hold snow job
        // shouldn't keep showing up as a candidate for "Add Jobs to
        // Dispatch" / Master Routes. Same convention as the activeOnly
        // filter in useCRMJobs (use-crm-jobs.ts).
        .neq("status", "cancelled")
        .neq("status", "hold")
        .order("priority", { ascending: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data.map((row: any) => ({
        ...mapJob({
          ...row,
          service_address: row.service_address ?? row.clients?.billing_address ?? null,
          service_city:    row.service_city    ?? row.clients?.billing_city    ?? null,
          service_state:   row.service_state   ?? row.clients?.billing_state   ?? null,
          service_zip:     row.service_zip     ?? row.clients?.billing_zip     ?? null,
        }),
        clientPriority: row.clients?.priority ?? null,
      }))) as CRMJob[];
    },
  });
}

// ── storm events ──────────────────────────────────────────────────────────────

export function useStormEvents() {
  return useQuery({
    queryKey: ["storm-events"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_storm_events")
        .select("*")
        .is("deleted_at", null)
        .order("event_date", { ascending: false });
      if (error) throw error;
      return (data.map(mapStormEvent)) as StormEvent[];
    },
  });
}

export function useCreateStormEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      name: string;
      eventDate: string;
      forecastDepthInches?: number | null;
      temperature?: number | null;
      notes?: string | null;
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_storm_events")
        .insert({
          name: values.name,
          event_date: values.eventDate,
          forecast_depth_inches: values.forecastDepthInches ?? null,
          temperature: values.temperature ?? null,
          notes: values.notes ?? null,
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return mapStormEvent(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["storm-events"] }),
  });
}

export function useUpdateStormEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<{
        name: string;
        dispatch_status: StormEventStatus;
        forecast_depth_inches: number | null;
        temperature: number | null;
        notes: string | null;
        is_active: boolean;
      }>;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("crm_storm_events").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["storm-events"] }),
  });
}

// ── snow routes (Master Routes) ──────────────────────────────────────────────

export function useSnowRoutes() {
  return useQuery({
    queryKey: ["snow-routes"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_snow_routes")
        .select("*, crm_crews(name), crm_snow_route_stops(count)")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data.map(mapSnowRoute)) as SnowRoute[];
    },
  });
}

export function useCreateSnowRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { name: string; defaultCrewId?: string | null }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_snow_routes")
        .insert({ name: values.name, default_crew_id: values.defaultCrewId ?? null })
        .select()
        .single();
      if (error) throw error;
      return mapSnowRoute(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["snow-routes"] }),
  });
}

export function useUpdateSnowRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<{ name: string; default_crew_id: string | null; is_active: boolean }>;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("crm_snow_routes").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["snow-routes"] }),
  });
}

export function useDeleteSnowRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_snow_routes")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["snow-routes"] }),
  });
}

// ── snow route stops ──────────────────────────────────────────────────────────

export function useSnowRouteStops(routeId: string) {
  return useQuery({
    queryKey: ["snow-route-stops", routeId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_snow_route_stops")
        .select("*, crm_jobs!inner(service_address, clients(display_name))")
        .eq("route_id", routeId)
        .is("crm_jobs.deleted_at", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data.map(mapSnowRouteStop)) as SnowRouteStop[];
    },
    enabled: !!routeId,
  });
}

export function useAddRouteStop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ routeId, jobId }: { routeId: string; jobId: string }) => {
      const supabase = createClient();
      // Atomic RPC: locks the route (advisory lock) and computes
      // MAX(sort_order)+1 server-side, so two concurrent "Add Stop" calls
      // for the same route can never race on sort_order (see
      // 20260902161000_snow_route_stop_unique_and_atomic_rpcs.sql). It also
      // relies on the crm_snow_route_stops_job_unique index to reject a job
      // already assigned to any route (including this one).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("add_snow_route_stop", {
        p_route_id: routeId,
        p_job_id: jobId,
      });
      if (error) {
        if (error.code === "23505") {
          // Cheap best-effort lookup of which route already has this job,
          // so the toast can be specific instead of just "already assigned".
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: existing } = await (supabase as any)
            .from("crm_snow_route_stops")
            .select("crm_snow_routes(name)")
            .eq("job_id", jobId)
            .limit(1)
            .maybeSingle();
          const routeName = existing?.crm_snow_routes?.name as string | undefined;
          throw new Error(
            routeName
              ? `This job is already on route "${routeName}".`
              : "This job is already assigned to another route."
          );
        }
        throw error;
      }
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["snow-route-stops", vars.routeId] });
      qc.invalidateQueries({ queryKey: ["snow-routes"] });
    },
  });
}

export function useReorderRouteStops() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ routeId, orderedStopIds }: { routeId: string; orderedStopIds: string[] }) => {
      const supabase = createClient();
      // Single atomic RPC (one UPDATE statement) instead of N independent
      // Promise.all updates, so a reorder can't be observed or persisted
      // half-applied (see
      // 20260902161000_snow_route_stop_unique_and_atomic_rpcs.sql).
      const stops = orderedStopIds.map((id, i) => ({ id, sort_order: i }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("reorder_snow_route_stops", {
        p_route_id: routeId,
        p_stops: stops,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["snow-route-stops", vars.routeId] }),
  });
}

export function useRemoveRouteStop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; routeId: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("crm_snow_route_stops").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["snow-route-stops", vars.routeId] });
      qc.invalidateQueries({ queryKey: ["snow-routes"] });
    },
  });
}

// ── visits scoped to a storm event ───────────────────────────────────────────

export function useStormEventVisits(stormEventId: string) {
  return useQuery({
    queryKey: ["crm-job-visits", "storm-event", stormEventId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_job_visits")
        .select(`
          *,
          clients(display_name, primary_phone, priority, billing_address, billing_city, billing_state, billing_zip),
          crm_crews(name),
          crm_jobs(*, crm_crews(name), crm_job_services(*))
        `)
        .eq("storm_event_id", stormEventId)
        .is("deleted_at", null)
        .order("order_num", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data.map(mapVisit)) as CRMJobVisit[];
    },
    enabled: !!stormEventId,
  });
}

export function useAddJobsToStormEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      stormEventId,
      date,
      jobs,
    }: {
      stormEventId: string;
      date: string;
      jobs: { jobId: string; clientId: string; crewId?: string | null }[];
    }) => {
      const supabase = createClient();

      // Exclude jobs already on this storm event — re-opening "Add Jobs to
      // Dispatch" after a forecast revision and resubmitting an overlapping
      // selection must not create a second visit for the same job on the
      // same storm (double dispatch/double billing). The DB also enforces
      // this via a unique index as the authoritative guard.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (supabase as any)
        .from("crm_job_visits")
        .select("job_id")
        .eq("storm_event_id", stormEventId)
        .is("deleted_at", null)
        .in("job_id", jobs.map((j) => j.jobId));
      const alreadyAdded = new Set((existing ?? []).map((r: { job_id: string }) => r.job_id));
      const newJobs = jobs.filter((j) => !alreadyAdded.has(j.jobId));

      const rows = newJobs.map((j, i) => ({
        job_id: j.jobId,
        client_id: j.clientId,
        scheduled_date: date,
        crew_id: j.crewId ?? null,
        storm_event_id: stormEventId,
        order_num: i,
        status: "scheduled",
      }));
      if (rows.length === 0) return 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("crm_job_visits").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["crm-job-visits", "storm-event", vars.stormEventId] }),
  });
}
