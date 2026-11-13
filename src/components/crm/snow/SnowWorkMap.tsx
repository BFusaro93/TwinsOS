"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Hand, ListOrdered, MousePointerClick, PenLine, Route as RouteIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, formatCurrency } from "@/lib/utils";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import { useJobCoords, type JobCoord } from "@/lib/hooks/use-job-coords";

export interface SnowMapStop {
  visitId: string;
  jobId: string;
  /** Position within the stop's crew route (1-based). */
  order: number;
  clientName: string;
  address: string;
  serviceName: string;
  crewKey: string;
  crewLabel: string;
  status: string;
  priority: string | null;
  amountCents: number;
  budgetedHours: number;
  lat: number | null;
  lng: number | null;
}

type Mode = "select" | "order" | "draw";

const CREW_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4d7c0f"];
const UNASSIGNED_COLOR = "#64748b";

/**
 * The snow board's working map: every stop plotted and numbered in route order,
 * coloured by crew, with the tools a dispatcher needs without leaving it —
 *   Select       click stops to pick them; a group panel acts on the picks
 *   Route order  left-click a stop to move it later in its crew's route,
 *                right-click to move it earlier
 *   Draw area    click points to outline a shape, Finish selects every stop inside
 * and filters: hide crews, show only the selected stops, route lines.
 * Selection is shared with the board's table, so Dispatch / Close Out / Skip
 * there act on what was picked here.
 */
export function SnowWorkMap({
  apiKey,
  stops,
  selectedIds,
  canManage,
  crews,
  tableOnlySelected,
  reordering,
  onToggle,
  onSelectMany,
  onClearSelection,
  onMoveStop,
  onAssignCrew,
  onDispatch,
  onOpenMultiCrew,
  onTableOnlySelected,
}: {
  apiKey: string;
  stops: SnowMapStop[];
  selectedIds: Set<string>;
  canManage: boolean;
  crews: { id: string; name: string }[];
  tableOnlySelected: boolean;
  reordering: boolean;
  onToggle: (visitId: string) => void;
  onSelectMany: (visitIds: string[]) => void;
  onClearSelection: () => void;
  onMoveStop: (visitId: string, dir: -1 | 1) => void;
  onAssignCrew: (visitIds: string[], crewId: string | null) => Promise<void>;
  onDispatch: (visitIds: string[]) => Promise<void>;
  onOpenMultiCrew: () => void;
  onTableOnlySelected: (v: boolean) => void;
}) {
  const [mapEl, setMapEl] = useState<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("select");
  const [hiddenCrews, setHiddenCrews] = useState<Set<string>>(new Set());
  const [onlySelected, setOnlySelected] = useState(false);
  const [showRoutes, setShowRoutes] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [assignCrewId, setAssignCrewId] = useState("");
  const [busy, setBusy] = useState(false);
  const [drawPoints, setDrawPoints] = useState<google.maps.LatLngLiteral[]>([]);
  const [shapeClosed, setShapeClosed] = useState(false);

  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const linesRef = useRef<google.maps.Polyline[]>([]);
  const shapeRef = useRef<google.maps.Polygon | null>(null);
  const lastFitSig = useRef("");

  // Marker listeners are created once per rebuild; they read the latest handlers from here.
  const handlers = useRef({ onToggle, onMoveStop, setFocusedId, mode });
  handlers.current = { onToggle, onMoveStop, setFocusedId, mode };

  const known = new Map<string, JobCoord>();
  for (const s of stops) if (s.lat != null && s.lng != null) known.set(s.jobId, { lat: s.lat, lng: s.lng });
  const { data: fetched, isFetching, error } = useJobCoords(stops.map((s) => s.jobId), known);
  const coordOf = (jobId: string): JobCoord | undefined => known.get(jobId) ?? fetched?.coords.get(jobId);

  // ── map init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapEl) return;
    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled) return;
        mapRef.current = new google.maps.Map(mapEl, {
          center: { lat: 39.5, lng: -98.35 },
          zoom: 4,
          mapTypeControl: false,
          streetViewControl: false,
          gestureHandling: "greedy",
        });
        setReady(true);
      })
      .catch(() => setLoadError("Failed to load Google Maps. Check the API key in Settings → Integrations."));
    return () => {
      cancelled = true;
      mapRef.current = null;
      setReady(false);
    };
  }, [mapEl, apiKey]);

  const crewKeys = useMemo(() => Array.from(new Set(stops.map((s) => s.crewKey))).sort(), [stops]);
  const colorOf = (key: string) => {
    const i = crewKeys.filter((k) => k !== "__none__").indexOf(key);
    return i < 0 ? UNASSIGNED_COLOR : CREW_COLORS[i % CREW_COLORS.length];
  };

  const shown = stops.filter((s) => !hiddenCrews.has(s.crewKey) && (!onlySelected || selectedIds.has(s.visitId)));

  // ── markers ─────────────────────────────────────────────────────────────────
  const markerSig = shown.map((s) => `${s.visitId}:${s.order}:${s.crewKey}:${selectedIds.has(s.visitId) ? 1 : 0}`).join("|") + `|${mode}|${focusedId ?? ""}`;
  const idsSig = shown.map((s) => s.visitId).sort().join(",");
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    const bounds = new google.maps.LatLngBounds();
    let placed = 0;
    for (const s of shown) {
      const c = coordOf(s.jobId);
      if (!c) continue;
      const selected = selectedIds.has(s.visitId);
      const marker = new google.maps.Marker({
        map,
        position: c,
        label: { text: String(s.order), color: "#ffffff", fontSize: "11px", fontWeight: "600" },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: selected ? 15 : 12,
          fillColor: colorOf(s.crewKey),
          fillOpacity: 1,
          strokeColor: selected ? "#111827" : "#ffffff",
          strokeWeight: selected ? 4 : 2,
        },
        title: `${s.order}. ${s.clientName} — ${s.serviceName}`,
        zIndex: selected ? 2 : 1,
      });
      marker.addListener("click", () => {
        const h = handlers.current;
        if (h.mode === "draw") return;
        if (h.mode === "order") { h.onMoveStop(s.visitId, 1); return; }
        h.setFocusedId(s.visitId);
        h.onToggle(s.visitId);
      });
      marker.addListener("rightclick", () => {
        const h = handlers.current;
        if (h.mode === "order") h.onMoveStop(s.visitId, -1);
      });
      markersRef.current.push(marker);
      bounds.extend(c);
      placed++;
    }
    // Zoom to fit only when the set of stops on the map changes — not on every selection or reorder.
    if (placed > 0 && lastFitSig.current !== idsSig) {
      lastFitSig.current = idsSig;
      map.fitBounds(bounds, 48);
      google.maps.event.addListenerOnce(map, "idle", () => {
        if ((map.getZoom() ?? 0) > 16) map.setZoom(16);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, markerSig, fetched]);

  // ── route lines (each crew's stops in order) ────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    linesRef.current.forEach((l) => l.setMap(null));
    linesRef.current = [];
    if (!showRoutes) return;
    for (const key of crewKeys) {
      const path = shown
        .filter((s) => s.crewKey === key)
        .sort((a, b) => a.order - b.order)
        .map((s) => coordOf(s.jobId))
        .filter((c): c is JobCoord => !!c);
      if (path.length < 2) continue;
      linesRef.current.push(new google.maps.Polyline({ map, path, strokeColor: colorOf(key), strokeOpacity: 0.7, strokeWeight: 3 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, showRoutes, markerSig, fetched]);

  // ── draw area ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setOptions({ draggableCursor: mode === "draw" ? "crosshair" : undefined });
    if (mode !== "draw") return;
    const listener = map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      setShapeClosed(false);
      setDrawPoints((pts) => [...pts, e.latLng!.toJSON()]);
    });
    return () => listener.remove();
  }, [ready, mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    shapeRef.current?.setMap(null);
    shapeRef.current = null;
    if (drawPoints.length === 0) return;
    const style = { strokeColor: "#ea580c", strokeWeight: 2, fillColor: "#ea580c", fillOpacity: 0.15, clickable: false };
    shapeRef.current = shapeClosed || drawPoints.length >= 3
      ? new google.maps.Polygon({ map, paths: drawPoints, ...style })
      : new google.maps.Polygon({ map, paths: drawPoints, ...style, fillOpacity: 0 });
  }, [ready, drawPoints, shapeClosed]);

  function finishShape() {
    if (drawPoints.length < 3) return;
    const poly = shapeRef.current;
    if (!poly) return;
    const ids = shown
      .filter((s) => {
        const c = coordOf(s.jobId);
        return !!c && google.maps.geometry.poly.containsLocation(new google.maps.LatLng(c.lat, c.lng), poly);
      })
      .map((s) => s.visitId);
    setShapeClosed(true);
    setMode("select");
    onSelectMany(ids);
  }

  function clearShape() {
    setDrawPoints([]);
    setShapeClosed(false);
  }

  function toggleCrew(key: string) {
    setHiddenCrews((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // ── selection summary ───────────────────────────────────────────────────────
  const selectedStops = stops.filter((s) => selectedIds.has(s.visitId));
  const totalCents = selectedStops.reduce((sum, s) => sum + s.amountCents, 0);
  const totalHours = selectedStops.reduce((sum, s) => sum + (s.budgetedHours || 0), 0);
  const serviceCount = new Set(selectedStops.map((s) => s.serviceName)).size;
  const focused = stops.find((s) => s.visitId === focusedId) ?? null;
  const placedCount = stops.filter((s) => coordOf(s.jobId)).length;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  }

  const modeBtn = (m: Mode, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => { setMode(m); if (m !== "draw") setDrawPoints((p) => (shapeClosed ? p : [])); }}
      className={cn(
        "flex flex-1 items-center justify-center gap-1 rounded border px-2 py-1.5 text-[11px]",
        mode === m ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400" : "text-muted-foreground hover:bg-muted"
      )}
    >
      {icon}{label}
    </button>
  );

  return (
    <div className="grid border-b bg-card lg:grid-cols-[320px_1fr]">
      <div className="space-y-3 overflow-y-auto border-b p-3 text-xs lg:max-h-[600px] lg:border-b-0 lg:border-r">
        <p className="font-medium text-foreground">
          {placedCount} of {stops.length} stops on map{isFetching ? " · locating…" : ""}
        </p>
        {(loadError || error || fetched?.googleError) && (
          <p className="text-red-600 dark:text-red-400">
            {loadError ?? (error instanceof Error ? error.message : null) ?? `Google Maps: ${fetched?.googleError}`}
          </p>
        )}

        <div className="flex gap-1">
          {modeBtn("select", "Select", <MousePointerClick className="h-3 w-3" />)}
          {canManage && modeBtn("order", "Route order", <ListOrdered className="h-3 w-3" />)}
          {modeBtn("draw", "Draw area", <PenLine className="h-3 w-3" />)}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {mode === "select" && "Click stops to select or unselect them. Selecting here selects them in the table too."}
          {mode === "order" && "Left-click a stop to move it later in its crew's route; right-click to move it earlier."}
          {mode === "draw" && "Click the map to outline an area, then Finish shape to select every stop inside it."}
        </p>

        {mode === "draw" && (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" className="h-7 text-xs" disabled={drawPoints.length < 3} onClick={finishShape}>Finish shape</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={drawPoints.length === 0} onClick={() => setDrawPoints((p) => p.slice(0, -1))}>Undo point</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={drawPoints.length === 0} onClick={clearShape}>Clear</Button>
          </div>
        )}
        {mode !== "draw" && drawPoints.length > 0 && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearShape}><X className="mr-1 h-3 w-3" />Clear shape</Button>
        )}

        <div className="space-y-1.5 border-t pt-2">
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox checked={showRoutes} onCheckedChange={(v) => setShowRoutes(v === true)} className="h-3.5 w-3.5" />
            <RouteIcon className="h-3 w-3" />Show route lines
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox checked={onlySelected} onCheckedChange={(v) => setOnlySelected(v === true)} className="h-3.5 w-3.5" disabled={selectedIds.size === 0 && !onlySelected} />
            Show only selected stops on the map
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox checked={tableOnlySelected} onCheckedChange={(v) => onTableOnlySelected(v === true)} className="h-3.5 w-3.5" disabled={selectedIds.size === 0 && !tableOnlySelected} />
            Show only selected stops in the table
          </label>
        </div>

        <div className="space-y-1 border-t pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Crews (click to show / hide)</p>
          {crewKeys.map((k) => {
            const hidden = hiddenCrews.has(k);
            const label = stops.find((s) => s.crewKey === k)?.crewLabel ?? "Unassigned";
            const count = stops.filter((s) => s.crewKey === k).length;
            return (
              <button key={k} type="button" onClick={() => toggleCrew(k)} className={cn("flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-muted", hidden && "opacity-40")}>
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf(k) }} />
                <span className="flex-1 truncate">{label}</span>
                <span className="text-muted-foreground">{count}</span>
              </button>
            );
          })}
        </div>

        {selectedIds.size > 0 && (
          <div className="space-y-2 rounded-md border bg-brand-50/60 p-2.5 dark:bg-brand-900/20">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-foreground">{selectedIds.size} selected</p>
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={onClearSelection}>Clear</button>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
              <dt className="text-muted-foreground">Services</dt><dd>{serviceCount}</dd>
              <dt className="text-muted-foreground">Budgeted hrs</dt><dd>{totalHours.toFixed(2)}</dd>
              <dt className="text-muted-foreground">Total</dt><dd>{totalCents > 0 ? formatCurrency(totalCents) : "—"}</dd>
            </dl>
            {canManage && (
              <>
                <div className="flex gap-1.5">
                  <Select value={assignCrewId || undefined} onValueChange={setAssignCrewId}>
                    <SelectTrigger className="h-7 flex-1 text-xs"><SelectValue placeholder="Assign to crew…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {crews.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={busy || !assignCrewId}
                    onClick={() => void run(async () => { await onAssignCrew([...selectedIds], assignCrewId === "none" ? null : assignCrewId); setAssignCrewId(""); })}
                  >
                    Update
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onOpenMultiCrew}>Assign crews…</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => void run(() => onDispatch([...selectedIds]))}>Dispatch</Button>
                </div>
              </>
            )}
          </div>
        )}

        {focused && (
          <div className="space-y-1 rounded-md border p-2.5">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-foreground">{focused.order}. {focused.clientName}</p>
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setFocusedId(null)} aria-label="Close stop details"><X className="h-3 w-3" /></button>
            </div>
            <p className="text-muted-foreground">{focused.address || "No address"}</p>
            <p>{focused.serviceName} · {focused.status}{focused.priority ? ` · ${focused.priority} priority` : ""}</p>
            <p>Crew: <span className="font-medium">{focused.crewLabel}</span></p>
            {canManage && (
              <div className="flex gap-1.5 pt-1">
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={reordering} onClick={() => onMoveStop(focused.visitId, -1)}><ArrowUp className="mr-1 h-3 w-3" />Earlier</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={reordering} onClick={() => onMoveStop(focused.visitId, 1)}><ArrowDown className="mr-1 h-3 w-3" />Later</Button>
              </div>
            )}
          </div>
        )}

        {!isFetching && placedCount < stops.length && !loadError && (
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Hand className="h-3 w-3" />Stops without a resolvable address aren&rsquo;t shown.</p>
        )}
      </div>
      <div ref={setMapEl} className="h-[480px] w-full bg-muted lg:h-[600px]" />
    </div>
  );
}
