"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import { useJobCoords, type JobCoord } from "@/lib/hooks/use-job-coords";

export interface DispatchMapStop {
  visitId: string;
  jobId: string;
  /** Position in the board's current order (1-based). */
  order: number;
  clientName: string;
  address: string;
  crewKey: string;
  crewLabel: string;
  statusLabel: string;
  lat: number | null;
  lng: number | null;
}

const CREW_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4d7c0f"];
const UNASSIGNED_COLOR = "#64748b";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** Every stop on the board plotted on a map, numbered in route order and colored by crew. */
export function DispatchMap({ stops, apiKey }: { stops: DispatchMapStop[]; apiKey: string }) {
  const [mapEl, setMapEl] = useState<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);

  const known = new Map<string, JobCoord>();
  for (const s of stops) if (s.lat != null && s.lng != null) known.set(s.jobId, { lat: s.lat, lng: s.lng });
  const { data: fetched, isFetching, error } = useJobCoords(stops.map((s) => s.jobId), known);

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
        });
        infoRef.current = new google.maps.InfoWindow();
        setReady(true);
      })
      .catch(() => setLoadError("Failed to load Google Maps. Check the API key in Settings → Integrations."));
    return () => {
      cancelled = true;
      mapRef.current = null;
      setReady(false);
    };
  }, [mapEl, apiKey]);

  const crewKeys = Array.from(new Set(stops.map((s) => s.crewKey))).sort();
  const colorOf = (key: string) => {
    const i = crewKeys.filter((k) => k !== "__none__").indexOf(key);
    return i < 0 ? UNASSIGNED_COLOR : CREW_COLORS[i % CREW_COLORS.length];
  };

  const coordsSig = stops.map((s) => `${s.visitId}:${s.order}:${s.crewKey}`).join("|");
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    const bounds = new google.maps.LatLngBounds();
    let placed = 0;
    for (const s of stops) {
      const c = known.get(s.jobId) ?? fetched?.coords.get(s.jobId);
      if (!c) continue;
      const marker = new google.maps.Marker({
        map,
        position: c,
        label: { text: String(s.order), color: "#ffffff", fontSize: "11px", fontWeight: "600" },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: colorOf(s.crewKey),
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
        title: `${s.order}. ${s.clientName}`,
      });
      marker.addListener("click", () => {
        infoRef.current?.setContent(
          `<div style="font-size:12px;line-height:1.4"><strong>${s.order}. ${escapeHtml(s.clientName)}</strong><br/>${escapeHtml(s.address)}<br/>${escapeHtml(s.crewLabel)} · ${escapeHtml(s.statusLabel)}</div>`
        );
        infoRef.current?.open({ map, anchor: marker });
      });
      markersRef.current.push(marker);
      bounds.extend(c);
      placed++;
    }
    if (placed > 0) {
      map.fitBounds(bounds, 48);
      // A single stop would otherwise zoom to street level on a rooftop.
      google.maps.event.addListenerOnce(map, "idle", () => {
        if ((map.getZoom() ?? 0) > 16) map.setZoom(16);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, coordsSig, fetched]);

  const placedCount = stops.filter((s) => known.has(s.jobId) || fetched?.coords.has(s.jobId)).length;
  const crewLegend = crewKeys.map((k) => ({
    key: k,
    label: stops.find((s) => s.crewKey === k)?.crewLabel ?? "Unassigned",
  }));

  return (
    <div className="border-b bg-card px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {placedCount} of {stops.length} stops on map{isFetching ? " · locating…" : ""}
        </span>
        {crewLegend.map((c) => (
          <span key={c.key} className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorOf(c.key) }} />
            {c.label}
          </span>
        ))}
        {(loadError || error || fetched?.googleError) && (
          <span className="text-red-600 dark:text-red-400">
            {loadError ?? (error instanceof Error ? error.message : null) ?? `Google Maps: ${fetched?.googleError}`}
          </span>
        )}
        {!isFetching && placedCount < stops.length && !loadError && (
          <span>Stops without a resolvable address aren&rsquo;t shown.</span>
        )}
      </div>
      <div ref={setMapEl} className="h-[360px] w-full rounded-md border border-border bg-muted" />
    </div>
  );
}
