"use client";

import { useState } from "react";
import {
  useSnowRoutes,
  useCreateSnowRoute,
  useUpdateSnowRoute,
  useDeleteSnowRoute,
  useSnowRouteStops,
  useAddRouteStop,
  useRemoveRouteStop,
  useReorderRouteStops,
  useSnowJobs,
} from "@/lib/hooks/use-snow-dispatch";
import { useCRMCrews } from "@/lib/hooks/use-crm-jobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, X, Route as RouteIcon, Trash2, ChevronUp, ChevronDown } from "lucide-react";

function ManageStopsDialog({
  routeId, routeName, open, onOpenChange,
}: {
  routeId: string;
  routeName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data: stops = [] } = useSnowRouteStops(routeId);
  const { data: snowJobs = [] } = useSnowJobs();
  const addStop = useAddRouteStop();
  const removeStop = useRemoveRouteStop();
  const reorderStops = useReorderRouteStops();
  const [pickJobId, setPickJobId] = useState("");

  function moveStop(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= stops.length) return;
    const reordered = [...stops];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    reorderStops.mutate({ routeId, orderedStopIds: reordered.map((s) => s.id) });
  }

  const stopJobIds = new Set(stops.map((s) => s.jobId));
  const available = snowJobs.filter((j) => !stopJobIds.has(j.id));

  async function handleAdd() {
    if (!pickJobId) return;
    try {
      await addStop.mutateAsync({ routeId, jobId: pickJobId });
      setPickJobId("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add stop");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Stops on &quot;{routeName}&quot;</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Select value={pickJobId} onValueChange={setPickJobId}>
            <SelectTrigger className="h-9 text-sm flex-1"><SelectValue placeholder="Add a snow job…" /></SelectTrigger>
            <SelectContent>
              {available.map((j) => (
                <SelectItem key={j.id} value={j.id}>{j.clientName ?? j.id}</SelectItem>
              ))}
              {available.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-slate-400">No more snow jobs to add</div>
              )}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleAdd} disabled={!pickJobId || addStop.isPending}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="divide-y max-h-80 overflow-y-auto">
          {stops.length === 0 && <p className="py-3 text-sm text-slate-400">No stops yet.</p>}
          {stops.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="w-5 text-xs text-slate-400 font-mono">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium text-slate-700">{s.clientName ?? "—"}</p>
                {s.serviceAddress && <p className="truncate text-xs text-slate-400">{s.serviceAddress}</p>}
              </div>
              <div className="flex flex-col">
                <button
                  onClick={() => moveStop(i, -1)}
                  disabled={i === 0 || reorderStops.isPending}
                  className="text-slate-300 hover:text-slate-600 disabled:opacity-30"
                  title="Move up"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => moveStop(i, 1)}
                  disabled={i === stops.length - 1 || reorderStops.isPending}
                  className="text-slate-300 hover:text-slate-600 disabled:opacity-30"
                  title="Move down"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                onClick={() => removeStop.mutate({ id: s.id, routeId })}
                className="text-slate-300 hover:text-red-500"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SnowRoutesEditor() {
  const { data: routes = [] } = useSnowRoutes();
  const { data: crews = [] } = useCRMCrews();
  const createRoute = useCreateSnowRoute();
  const updateRoute = useUpdateSnowRoute();
  const deleteRoute = useDeleteSnowRoute();

  const [newName, setNewName] = useState("");
  const [stopsRouteId, setStopsRouteId] = useState<string | null>(null);

  async function handleAdd() {
    if (!newName.trim()) return;
    try {
      await createRoute.mutateAsync({ name: newName.trim() });
      setNewName("");
    } catch {
      toast.error("Failed to add route");
    }
  }

  const activeStopsRoute = routes.find((r) => r.id === stopsRouteId);

  return (
    <div className="space-y-1 px-1">
      {routes.length === 0 && <p className="py-3 text-sm text-slate-400">No Master Routes yet. Add one below.</p>}
      {routes.map((route) => (
        <div key={route.id} className="flex items-center gap-2 py-1.5 border-b last:border-b-0">
          <RouteIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="flex-1 text-sm font-medium text-slate-700 truncate">{route.name}</span>
          <span className="text-xs text-slate-400">{route.stopCount ?? 0} stop{route.stopCount === 1 ? "" : "s"}</span>
          <Select
            value={route.defaultCrewId ?? "none"}
            onValueChange={(v) => updateRoute.mutate({ id: route.id, patch: { default_crew_id: v === "none" ? null : v } })}
          >
            <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="Default crew" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No default crew</SelectItem>
              {crews.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Switch
            checked={route.isActive}
            onCheckedChange={(checked) => updateRoute.mutate({ id: route.id, patch: { is_active: checked } })}
          />
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setStopsRouteId(route.id)}>
            Stops…
          </Button>
          <button
            onClick={() => deleteRoute.mutate(route.id)}
            className="text-slate-300 hover:text-red-500"
            title="Delete route"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <div className="flex gap-2 pt-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="e.g. Snow Plow Team 1"
          className="h-8 text-sm"
          onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }}
        />
        <Button size="sm" onClick={handleAdd} disabled={!newName.trim() || createRoute.isPending}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add Route
        </Button>
      </div>

      {activeStopsRoute && (
        <ManageStopsDialog
          routeId={activeStopsRoute.id}
          routeName={activeStopsRoute.name}
          open={!!stopsRouteId}
          onOpenChange={(o) => { if (!o) setStopsRouteId(null); }}
        />
      )}
    </div>
  );
}
