"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MapPin, Plus, Route as RouteIcon, Sparkles, Trash2, Layers } from "lucide-react";
import {
  useSnowRoutes,
  useCreateSnowRoute,
  useUpdateSnowRoute,
  useDeleteSnowRoute,
  useSnowRouteStops,
  useRemoveRouteStop,
  useSnowJobs,
} from "@/lib/hooks/use-snow-dispatch";
import {
  useRouteAssignments,
  useAddRouteStops,
  useReorderRouteStopsOptimistic,
  useOptimizeRouteJobs,
} from "@/lib/hooks/use-master-route-builder";
import { useCRMCrews } from "@/lib/hooks/use-crm-jobs";
import { useOrgSettings } from "@/lib/hooks/use-org-settings";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { moveToPosition, jobServiceNames } from "@/lib/snow-route-search";
import { useConfirm } from "@/components/shared/useConfirm";
import { RouteJobSearch } from "@/components/crm/snow/RouteJobSearch";
import { RouteStopRow, PriorityBadge } from "@/components/crm/snow/RouteStopRow";
import { DispatchMap, type DispatchMapStop } from "@/components/crm/dispatch/DispatchMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CRMJob } from "@/types/crm-jobs";

const NEW_JOB_CAP = 50;

/**
 * The Master Route builder: create / rename / activate routes, find jobs for a
 * route (service, zip, proximity, not-on-a-route), order the stops (drag, type
 * a position, Group Stops / Optimize Route) and flag snow jobs added since the
 * route was built. One editor, shown on the Snow Dispatch board and in
 * Settings → Services → Snow Routes.
 */
export function MasterRouteBuilder() {
  const { can } = usePermissions();
  const canManage = can("snow_dispatch_manage");
  const { data: routes = [] } = useSnowRoutes();
  const { data: crews = [] } = useCRMCrews();
  const { data: jobs = [] } = useSnowJobs();
  const { data: assignments = new Map() } = useRouteAssignments();
  const { data: orgSettings } = useOrgSettings();
  const createRoute = useCreateSnowRoute();
  const updateRoute = useUpdateSnowRoute();
  const deleteRoute = useDeleteSnowRoute();
  const [confirm, confirmDialog] = useConfirm();

  const [routeId, setRouteId] = useState("");
  const [newName, setNewName] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [mapOpen, setMapOpen] = useState(false);

  // Keep a valid selection as routes load / get deleted.
  useEffect(() => {
    if (routes.length === 0) { if (routeId) setRouteId(""); return; }
    if (!routes.some((r) => r.id === routeId)) setRouteId(routes[0].id);
  }, [routes, routeId]);

  const route = routes.find((r) => r.id === routeId) ?? null;
  useEffect(() => setNameDraft(route?.name ?? ""), [route?.id, route?.name]);

  const { data: stops = [] } = useSnowRouteStops(routeId);
  const addStops = useAddRouteStops();
  const removeStop = useRemoveRouteStop();
  const reorder = useReorderRouteStopsOptimistic();
  const optimize = useOptimizeRouteJobs();

  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  // Snow jobs on no route at all — added to the system since routes were built.
  const newJobs = useMemo(
    () =>
      jobs
        .filter((j) => !assignments.has(j.id))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [jobs, assignments]
  );
  const [pickedNew, setPickedNew] = useState<Set<string>>(new Set());
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      const r = await createRoute.mutateAsync({ name });
      setNewName("");
      setRouteId(r.id);
    } catch {
      toast.error("Failed to add route");
    }
  }

  function commitName() {
    const name = nameDraft.trim();
    if (!route || !name || name === route.name) { setNameDraft(route?.name ?? ""); return; }
    updateRoute.mutate({ id: route.id, patch: { name } }, { onError: () => toast.error("Failed to rename route") });
  }

  async function addJobs(jobIds: string[]) {
    if (!route || jobIds.length === 0) return;
    try {
      const { added, failed } = await addStops.mutateAsync({ routeId: route.id, jobIds });
      if (added > 0) toast.success(`Added ${added} stop${added === 1 ? "" : "s"} to ${route.name}.`);
      if (failed.length > 0) toast.error(`${failed.length} couldn't be added — they may already be on another route.`);
    } catch {
      toast.error("Failed to add stops");
    }
  }

  function saveOrder(orderedStopIds: string[]) {
    if (!route) return;
    reorder.mutate({ routeId: route.id, orderedStopIds }, { onError: () => toast.error("Failed to save the order") });
  }

  function onMove(index: number, direction: -1 | 1) {
    saveOrder(moveToPosition(stops, index, index + 1 + direction).map((s) => s.id));
  }

  async function runOptimize(startAt: "shop" | "first") {
    if (!route) return;
    try {
      const res = await optimize.mutateAsync({ jobIds: stops.map((s) => s.jobId), crewId: route.defaultCrewId, startAt });
      const byJob = new Map(stops.map((s) => [s.jobId, s.id]));
      const ordered = res.orderedJobIds.map((id) => byJob.get(id)).filter((id): id is string => !!id);
      saveOrder(ordered);
      toast.success(
        `Route ordered — about ${res.totalDriveMinutes} min of driving${res.anchoredToShop ? ", starting from the shop" : startAt === "first" ? ", starting from the first stop" : ""}.`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to optimize route");
    }
  }

  const stopLine = (job: CRMJob | undefined, fallback?: string | null) =>
    [job?.serviceAddress ?? fallback, job?.serviceCity, job?.serviceZip].filter(Boolean).join(", ");

  const mapStops: DispatchMapStop[] = stops.map((s, i) => {
    const j = jobById.get(s.jobId);
    return {
      visitId: s.id,
      jobId: s.jobId,
      order: i + 1,
      clientName: s.clientName ?? "—",
      address: stopLine(j, s.serviceAddress),
      crewKey: "route",
      crewLabel: route?.name ?? "",
      statusLabel: "",
      lat: j?.lat ?? null,
      lng: j?.lng ?? null,
    };
  });

  const newSinceBuilt = (j: CRMJob) => !!route && j.createdAt > route.createdAt;

  return (
    <div className="space-y-4">
      {confirmDialog}

      {/* Route picker + create */}
      <div className="flex flex-wrap items-center gap-2">
        <RouteIcon className="h-4 w-4 text-slate-400 dark:text-neutral-500" />
        <Select value={routeId} onValueChange={setRouteId}>
          <SelectTrigger className="h-9 w-64 max-w-full text-sm"><SelectValue placeholder={routes.length ? "Pick a route" : "No routes yet"} /></SelectTrigger>
          <SelectContent>
            {routes.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name} · {r.stopCount ?? 0} stop{r.stopCount === 1 ? "" : "s"}{r.isActive ? "" : " · inactive"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canManage && (
          <>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
              placeholder="New route, e.g. Snow Plow Team 1"
              className="h-9 w-56 max-w-full text-sm"
            />
            <Button size="sm" className="h-9" onClick={handleCreate} disabled={!newName.trim() || createRoute.isPending}>
              <Plus className="mr-1 h-3.5 w-3.5" />Add Route
            </Button>
          </>
        )}
      </div>

      {!route ? (
        <p className="py-3 text-sm text-slate-400 dark:text-neutral-500">No Master Routes yet. Add one above.</p>
      ) : (
        <>
          {/* Route settings */}
          <div className="flex flex-wrap items-center gap-3 rounded border p-2">
            <Input
              value={nameDraft}
              disabled={!canManage}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              aria-label="Route name"
              className="h-8 w-56 max-w-full text-sm"
            />
            <Select
              value={route.defaultCrewId ?? "none"}
              disabled={!canManage}
              onValueChange={(v) => updateRoute.mutate({ id: route.id, patch: { default_crew_id: v === "none" ? null : v } })}
            >
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Default crew" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No default crew</SelectItem>
                {crews.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-neutral-400">
              <Switch
                checked={route.isActive}
                disabled={!canManage}
                onCheckedChange={(checked) => updateRoute.mutate({ id: route.id, patch: { is_active: checked } })}
              />
              Active
            </label>
            {canManage && (
              <button
                className="ml-auto text-slate-300 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400"
                aria-label={`Delete route ${route.name}`}
                title="Delete route"
                onClick={async () => {
                  const ok = await confirm({
                    title: `Delete route "${route.name}"?`,
                    description: "Its saved stop order is removed. Snow jobs on this route are not deleted.",
                    confirmLabel: "Delete",
                    destructive: true,
                  });
                  if (ok) deleteRoute.mutate(route.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* New jobs (on no route) */}
          {canManage && newJobs.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-medium text-slate-700 dark:text-neutral-200">
                  {newJobs.length} snow job{newJobs.length === 1 ? " isn't" : "s aren't"} on any route
                </span>
                <span className="text-xs text-slate-500 dark:text-neutral-400">Added since the routes were built. Slot them in, then Group Stops or Optimize.</span>
                <Button
                  size="sm"
                  className="ml-auto h-8 text-xs"
                  disabled={pickedNew.size === 0 || addStops.isPending}
                  onClick={() => { void addJobs([...pickedNew]); setPickedNew(new Set()); }}
                >
                  Add {pickedNew.size > 0 ? `${pickedNew.size} ` : ""}to {route.name}
                </Button>
              </div>
              <div className="max-h-44 divide-y overflow-y-auto border-t border-amber-200 dark:border-amber-900">
                {newJobs.slice(0, NEW_JOB_CAP).map((j) => (
                  <label key={j.id} className="flex items-start gap-2 px-3 py-1.5 text-sm">
                    <Checkbox
                      className="mt-0.5"
                      checked={pickedNew.has(j.id)}
                      onCheckedChange={() => setPickedNew((p) => { const n = new Set(p); if (n.has(j.id)) n.delete(j.id); else n.add(j.id); return n; })}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-slate-700 dark:text-neutral-300">{j.clientName ?? "—"}</span>
                        <PriorityBadge priority={j.clientPriority} />
                        {newSinceBuilt(j) && <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">NEW</span>}
                      </div>
                      <p className="truncate text-xs text-slate-500 dark:text-neutral-400">{stopLine(j) || "No address"} · {jobServiceNames(j).join(", ") || "—"}</p>
                    </div>
                  </label>
                ))}
                {newJobs.length > NEW_JOB_CAP && (
                  <p className="px-3 py-1.5 text-xs text-slate-500 dark:text-neutral-400">Showing the newest {NEW_JOB_CAP}. Use Find jobs below for the rest.</p>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Stops on the route */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-semibold text-slate-700 dark:text-neutral-200">
                  Stops on {route.name} <span className="font-normal text-slate-400 dark:text-neutral-500">({stops.length})</span>
                </h4>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {canManage && (
                    <>
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={stops.length < 2 || optimize.isPending} onClick={() => void runOptimize("shop")} title="Order all stops by driving time, starting from the crew's shop (or the company address)">
                        <Layers className="h-3.5 w-3.5" />Group Stops
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={stops.length < 2 || optimize.isPending} onClick={() => void runOptimize("first")} title="Keep stop 1 and route every other stop onward from it">
                        <RouteIcon className="h-3.5 w-3.5" />{optimize.isPending ? "Optimizing…" : "Optimize Route"}
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setMapOpen((o) => !o)}>
                    <MapPin className="h-3.5 w-3.5" />{mapOpen ? "Hide map" : "Map"}
                  </Button>
                </div>
              </div>
              <div className="max-h-96 divide-y overflow-y-auto rounded border">
                {stops.length === 0 && <p className="p-3 text-sm text-slate-400 dark:text-neutral-500">No stops yet. Find jobs and add them.</p>}
                {stops.map((s, i) => {
                  const j = jobById.get(s.jobId);
                  return (
                    <RouteStopRow
                      key={s.id}
                      index={i}
                      total={stops.length}
                      clientName={s.clientName ?? "—"}
                      address={stopLine(j, s.serviceAddress)}
                      service={j ? jobServiceNames(j).join(", ") : ""}
                      priority={j?.clientPriority}
                      canManage={canManage}
                      busy={reorder.isPending}
                      dragOver={dragOver === i && dragFrom !== null && dragFrom !== i}
                      onMove={(d) => onMove(i, d)}
                      onSetPosition={(p) => saveOrder(moveToPosition(stops, i, p).map((x) => x.id))}
                      onRemove={() => removeStop.mutate({ id: s.id, routeId: route.id })}
                      onDragStart={() => setDragFrom(i)}
                      onDragOver={() => setDragOver(i)}
                      onDrop={() => {
                        if (dragFrom !== null && dragFrom !== i) saveOrder(moveToPosition(stops, dragFrom, i + 1).map((x) => x.id));
                        setDragFrom(null);
                        setDragOver(null);
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Find jobs */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-neutral-200">Find jobs for this route</h4>
              <RouteJobSearch
                jobs={jobs}
                assignments={assignments}
                routeStops={stops.map((s) => ({ jobId: s.jobId, label: s.clientName ?? "—" }))}
                apiKey={orgSettings?.googleMapsApiKey ?? ""}
                canManage={canManage}
                adding={addStops.isPending}
                onAdd={(ids) => void addJobs(ids)}
              />
            </div>
          </div>

          {mapOpen && (
            <div className="h-80 overflow-hidden rounded border">
              {orgSettings?.googleMapsApiKey ? (
                <DispatchMap stops={mapStops} apiKey={orgSettings.googleMapsApiKey} />
              ) : (
                <p className="p-3 text-sm text-slate-500 dark:text-neutral-400">Add a Google Maps API key in Settings → Integrations to see the route map.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
