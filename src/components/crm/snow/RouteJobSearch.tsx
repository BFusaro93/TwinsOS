"use client";

import { useMemo, useState } from "react";
import { Search, Crosshair } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PriorityBadge } from "@/components/crm/snow/RouteStopRow";
import { useJobCoords, type JobCoord } from "@/lib/hooks/use-job-coords";
import { geocodeAddress, type RouteAssignment } from "@/lib/hooks/use-master-route-builder";
import { EMPTY_ROUTE_JOB_FILTERS, filterRouteJobs, jobServiceNames, type RouteJobFilters } from "@/lib/snow-route-search";
import type { LatLng } from "@/lib/geo";
import type { CRMJob } from "@/types/crm-jobs";

const RADII = [1, 2, 5, 10, 25];
const RESULT_CAP = 200;

/** A stop already on the route that can be used as the proximity centre. */
export interface ProximityStop {
  jobId: string;
  label: string;
}

/**
 * "Find jobs for this route": search the snow jobs by service, zip, proximity
 * (radius around an address or one of the route's stops) and "not already on a
 * route", then tick the ones to add.
 */
export function RouteJobSearch({
  jobs,
  assignments,
  routeStops,
  apiKey,
  canManage,
  adding,
  onAdd,
}: {
  jobs: CRMJob[];
  assignments: Map<string, RouteAssignment>;
  routeStops: ProximityStop[];
  apiKey: string;
  canManage: boolean;
  adding: boolean;
  onAdd: (jobIds: string[]) => void;
}) {
  const [filters, setFilters] = useState<RouteJobFilters>(EMPTY_ROUTE_JOB_FILTERS);
  const [centerSource, setCenterSource] = useState<string>("none"); // "none" | "address" | job id
  const [addressText, setAddressText] = useState("");
  const [locating, setLocating] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const serviceOptions = useMemo(
    () => Array.from(new Set(jobs.flatMap(jobServiceNames))).sort((a, b) => a.localeCompare(b)),
    [jobs]
  );
  const routeJobIds = useMemo(() => new Set(assignments.keys()), [assignments]);

  const proximityOn = filters.center != null && filters.radiusMiles != null;
  const known = new Map<string, JobCoord>();
  for (const j of jobs) if (j.lat != null && j.lng != null) known.set(j.id, { lat: j.lat, lng: j.lng });
  // Only locate jobs when a proximity search needs them (geocoding is cached back onto the job).
  const { data: located, isFetching: locatingJobs } = useJobCoords(
    jobs.filter((j) => !filters.notOnRoute || !routeJobIds.has(j.id)).map((j) => j.id),
    known,
    proximityOn
  );
  const coordOf = (j: CRMJob): LatLng | null => known.get(j.id) ?? located?.coords.get(j.id) ?? null;

  const matches = filterRouteJobs(jobs, filters, routeJobIds, coordOf);
  const shown = matches.slice(0, RESULT_CAP);
  // Search-result checkboxes are for jobs that can actually be added.
  const addable = shown.filter((m) => !routeJobIds.has(m.job.id));

  function set<K extends keyof RouteJobFilters>(key: K, value: RouteJobFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  async function applyCenter(source: string, address = addressText) {
    setCenterSource(source);
    if (source === "none") { set("center", null); return; }
    if (source === "address") {
      if (!address.trim()) return;
      setLocating(true);
      try {
        const c = await geocodeAddress(apiKey, address.trim());
        if (!c) toast.error("Couldn't find that address.");
        setFilters((f) => ({ ...f, center: c, radiusMiles: f.radiusMiles ?? 5 }));
      } catch {
        toast.error("Couldn't look up that address. Check the Google Maps key in Settings → Integrations.");
      } finally {
        setLocating(false);
      }
      return;
    }
    const job = jobs.find((j) => j.id === source);
    const c = job ? coordOf(job) : null;
    if (!c) { toast.error("That stop has no map location yet."); return; }
    setFilters((f) => ({ ...f, center: c, radiusMiles: f.radiusMiles ?? 5 }));
  }

  function toggle(id: string) {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  const allAddablePicked = addable.length > 0 && addable.every((m) => picked.has(m.job.id));

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400 dark:text-neutral-500" />
          <Input value={filters.query} onChange={(e) => set("query", e.target.value)} placeholder="Client, address, city…" className="h-9 pl-7 text-sm" />
        </div>
        <Input value={filters.zip} onChange={(e) => set("zip", e.target.value)} placeholder="Zip code(s), e.g. 48104, 481" className="h-9 text-sm" />
        <Select value={filters.service || "any"} onValueChange={(v) => set("service", v === "any" ? "" : v)}>
          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Service" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any service</SelectItem>
            {serviceOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-neutral-300">
          <Checkbox checked={filters.notOnRoute} onCheckedChange={(c) => set("notOnRoute", c === true)} />
          Not already on a route
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded border p-2">
        <Crosshair className="h-3.5 w-3.5 text-slate-400 dark:text-neutral-500" />
        <span className="text-xs text-slate-500 dark:text-neutral-400">Within</span>
        <Select
          value={filters.radiusMiles != null ? String(filters.radiusMiles) : "none"}
          onValueChange={(v) => set("radiusMiles", v === "none" ? null : Number(v))}
        >
          <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Anywhere</SelectItem>
            {RADII.map((r) => <SelectItem key={r} value={String(r)}>{r} mi</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-slate-500 dark:text-neutral-400">of</span>
        <Select value={centerSource} onValueChange={(v) => void applyCenter(v)}>
          <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Pick a centre" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            <SelectItem value="address">An address…</SelectItem>
            {routeStops.map((s) => <SelectItem key={s.jobId} value={s.jobId}>Stop: {s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {centerSource === "address" && (
          <>
            <Input
              value={addressText}
              onChange={(e) => setAddressText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void applyCenter("address"); }}
              placeholder="Street, city"
              className="h-8 min-w-40 flex-1 text-xs"
            />
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={locating || !addressText.trim()} onClick={() => void applyCenter("address")}>
              {locating ? "Locating…" : "Set"}
            </Button>
          </>
        )}
        {proximityOn && locatingJobs && <span className="text-xs text-slate-400 dark:text-neutral-500">Locating jobs…</span>}
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-neutral-400">
        <span>
          {matches.length} job{matches.length === 1 ? "" : "s"} match{matches.length > RESULT_CAP ? ` (showing first ${RESULT_CAP})` : ""}
        </span>
        {canManage && (
          <div className="flex items-center gap-2">
            <button
              className="underline"
              onClick={() => setPicked(allAddablePicked ? new Set() : new Set(addable.map((m) => m.job.id)))}
            >
              {allAddablePicked ? "Clear" : "Select all"}
            </button>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={picked.size === 0 || adding}
              onClick={() => { onAdd([...picked]); setPicked(new Set()); }}
            >
              Add {picked.size > 0 ? `${picked.size} ` : ""}to route
            </Button>
          </div>
        )}
      </div>

      <div className="max-h-72 overflow-y-auto rounded border divide-y">
        {shown.length === 0 && <p className="p-3 text-sm text-slate-400 dark:text-neutral-500">No jobs match these filters.</p>}
        {shown.map(({ job, miles }) => {
          const onRoute = assignments.get(job.id);
          return (
            <label key={job.id} className="flex items-start gap-2 px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-neutral-800/50">
              <Checkbox
                className="mt-0.5"
                disabled={!canManage || !!onRoute}
                checked={picked.has(job.id)}
                onCheckedChange={() => toggle(job.id)}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-slate-700 dark:text-neutral-300">{job.clientName ?? "—"}</span>
                  <PriorityBadge priority={job.clientPriority} />
                  {onRoute && <span className="shrink-0 text-[11px] text-slate-400 dark:text-neutral-500">on {onRoute.routeName}</span>}
                </div>
                <p className="truncate text-xs text-slate-500 dark:text-neutral-400">
                  {[job.serviceAddress, job.serviceCity, job.serviceZip].filter(Boolean).join(", ") || "No address"}
                  {miles != null && ` · ${miles.toFixed(1)} mi`}
                </p>
                <p className="truncate text-xs text-slate-400 dark:text-neutral-500">{jobServiceNames(job).join(", ") || "—"}</p>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
