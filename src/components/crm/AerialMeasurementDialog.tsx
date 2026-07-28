"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useClientProperties, useUpdateClientPropertyZones } from "@/lib/hooks/use-clients";
import { useOrgSettings } from "@/lib/hooks/use-org-settings";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import type { PropertyZone } from "@/types/crm";
import {
  useCustomFieldDefs,
  useClientCustomFieldValues,
  useUpsertClientCustomFieldValue,
} from "@/lib/hooks/use-client-custom-fields";

/** Which measurement total a number-type custom field should be kept in sync with. */
type FieldMapping = "none" | "turf" | "mulch_bed" | "parking_lot" | "gross";

function suggestMapping(fieldName: string): FieldMapping {
  const n = fieldName.toLowerCase();
  if (n.includes("turf")) return "turf";
  if (n.includes("mulch")) return "mulch_bed";
  if (n.includes("parking")) return "parking_lot";
  if (n.includes("gross") || n.includes("total")) return "gross";
  return "none";
}

const ZONE_TYPES: { value: PropertyZone["type"]; label: string; color: string }[] = [
  { value: "turf", label: "Turf", color: "#22c55e" },
  { value: "mulch_bed", label: "Mulch Bed", color: "#92400e" },
  { value: "parking_lot", label: "Parking Lot / Hardscape", color: "#64748b" },
  { value: "other", label: "Other", color: "#6366f1" },
];

const SQFT_PER_SQMETER = 10.7639;

function colorForType(type: PropertyZone["type"]): string {
  return ZONE_TYPES.find((t) => t.value === type)?.color ?? "#6366f1";
}

interface DraftZone extends PropertyZone {
  _id: string;
}

export function AerialMeasurementDialog({
  clientId,
  open,
  onOpenChange,
}: {
  clientId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data: properties } = useClientProperties(clientId);
  const { data: orgSettings } = useOrgSettings();
  const updateZones = useUpdateClientPropertyZones();
  const { data: customFieldDefs } = useCustomFieldDefs();
  const { data: customFieldValues } = useClientCustomFieldValues(clientId);
  const upsertCustomField = useUpsertClientCustomFieldValue();
  const numberFieldDefs = (customFieldDefs ?? []).filter((f) => f.fieldType === "number");

  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [zones, setZones] = useState<DraftZone[]>([]);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [mapsReady, setMapsReady] = useState(false);
  const [fieldMappings, setFieldMappings] = useState<Record<string, FieldMapping>>({});

  const [isDrawing, setIsDrawing] = useState(false);
  const [draftPointCount, setDraftPointCount] = useState(0);

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polygonsRef = useRef<Map<string, google.maps.Polygon>>(new Map());
  const isDrawingRef = useRef(false);
  const draftPathRef = useRef<google.maps.LatLngLiteral[]>([]);
  const draftPolygonRef = useRef<google.maps.Polygon | null>(null);

  const property = useMemo(
    () => properties?.find((p) => p.id === propertyId) ?? null,
    [properties, propertyId]
  );

  // Reset / default property selection whenever the dialog opens or closes
  useEffect(() => {
    if (open) {
      if (properties && properties.length > 0 && !propertyId) {
        setPropertyId(properties.find((p) => p.isMaster)?.id ?? properties[0].id);
      }
    } else {
      setPropertyId(null);
      setZones([]);
      setMapsReady(false);
      setMapsError(null);
      polygonsRef.current.forEach((p) => p.setMap(null));
      polygonsRef.current.clear();
      draftPolygonRef.current?.setMap(null);
      draftPolygonRef.current = null;
      draftPathRef.current = [];
      isDrawingRef.current = false;
      setIsDrawing(false);
      setDraftPointCount(0);
      setFieldMappings({});
    }
  }, [open, properties, propertyId]);

  // Default-suggest a mapping for each number-type custom field the first time it's seen this session
  useEffect(() => {
    if (!open || numberFieldDefs.length === 0) return;
    setFieldMappings((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const f of numberFieldDefs) {
        if (!(f.id in next)) {
          next[f.id] = suggestMapping(f.name);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customFieldDefs]);

  function startDrawing() {
    draftPolygonRef.current?.setMap(null);
    draftPolygonRef.current = null;
    draftPathRef.current = [];
    isDrawingRef.current = true;
    setIsDrawing(true);
    setDraftPointCount(0);
  }

  function cancelDrawing() {
    draftPolygonRef.current?.setMap(null);
    draftPolygonRef.current = null;
    draftPathRef.current = [];
    isDrawingRef.current = false;
    setIsDrawing(false);
    setDraftPointCount(0);
  }

  function finishDrawing() {
    const path = draftPathRef.current;
    if (path.length < 3 || !mapRef.current) return;
    draftPolygonRef.current?.setMap(null);
    draftPolygonRef.current = null;

    const id = crypto.randomUUID();
    const sqft = Math.round(google.maps.geometry.spherical.computeArea(path) * SQFT_PER_SQMETER);
    setZones((prev) => [...prev, { _id: id, name: `Zone ${prev.length + 1}`, type: "turf", sqft, notes: "", path }]);
    const polygon = new google.maps.Polygon({
      paths: path,
      strokeColor: colorForType("turf"),
      strokeWeight: 2,
      fillColor: colorForType("turf"),
      fillOpacity: 0.25,
      editable: true,
      map: mapRef.current,
    });
    registerPolygon(id, polygon);

    isDrawingRef.current = false;
    setIsDrawing(false);
    draftPathRef.current = [];
    setDraftPointCount(0);
  }

  function registerPolygon(id: string, polygon: google.maps.Polygon) {
    polygonsRef.current.get(id)?.setMap(null);
    polygonsRef.current.set(id, polygon);
    const recompute = () => {
      const sqft = Math.round(google.maps.geometry.spherical.computeArea(polygon.getPath()) * SQFT_PER_SQMETER);
      const path = polygon.getPath().getArray().map((p) => ({ lat: p.lat(), lng: p.lng() }));
      setZones((prev) => prev.map((z) => (z._id === id ? { ...z, sqft, path } : z)));
    };
    polygon.getPath().addListener("set_at", recompute);
    polygon.getPath().addListener("insert_at", recompute);
    polygon.getPath().addListener("remove_at", recompute);
  }

  // Load the map once we have a container + API key
  useEffect(() => {
    if (!open || !orgSettings?.googleMapsApiKey || !mapDivRef.current) return;
    let cancelled = false;
    loadGoogleMaps(orgSettings.googleMapsApiKey)
      .then(() => {
        if (cancelled || !mapDivRef.current) return;
        const map = new google.maps.Map(mapDivRef.current, {
          center: { lat: 39.5, lng: -98.35 },
          zoom: 4,
          mapTypeId: google.maps.MapTypeId.HYBRID,
          tilt: 0,
        });
        mapRef.current = map;
        map.setOptions({ disableDoubleClickZoom: true });

        // The Drawing library was deprecated/removed by Google (v3.65+), so tracing is
        // done manually: click to add vertices to the in-progress polygon, then Finish/Cancel.
        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (!isDrawingRef.current || !e.latLng) return;
          const pt = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          draftPathRef.current = [...draftPathRef.current, pt];
          if (!draftPolygonRef.current) {
            draftPolygonRef.current = new google.maps.Polygon({
              paths: draftPathRef.current,
              strokeColor: "#2563eb",
              strokeWeight: 2,
              fillColor: "#2563eb",
              fillOpacity: 0.15,
              clickable: false,
              map,
            });
          } else {
            draftPolygonRef.current.setPath(draftPathRef.current);
          }
          setDraftPointCount(draftPathRef.current.length);
        });

        setMapsReady(true);
      })
      .catch(() => setMapsError("Failed to load Google Maps. Check the API key in Settings → Integrations."));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orgSettings?.googleMapsApiKey]);

  // Seed zones + redraw saved shapes whenever the selected property (or map readiness) changes
  useEffect(() => {
    if (!property) {
      setZones([]);
      return;
    }
    const seeded: DraftZone[] = (property.zones ?? []).map((z) => ({ ...z, _id: crypto.randomUUID() }));
    setZones(seeded);

    if (!mapsReady || !mapRef.current) return;

    polygonsRef.current.forEach((p) => p.setMap(null));
    polygonsRef.current.clear();

    const address = [property.address, property.city, property.state, property.zip].filter(Boolean).join(", ");
    if (address) {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address }, (results, status) => {
        if (status === "OK" && results?.[0] && mapRef.current) {
          mapRef.current.setCenter(results[0].geometry.location);
          mapRef.current.setZoom(20);
        }
      });
    }

    seeded.forEach((z) => {
      if (z.path && z.path.length >= 3 && mapRef.current) {
        const polygon = new google.maps.Polygon({
          paths: z.path,
          strokeColor: colorForType(z.type),
          strokeWeight: 2,
          fillColor: colorForType(z.type),
          fillOpacity: 0.25,
          editable: true,
          map: mapRef.current,
        });
        registerPolygon(z._id, polygon);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property?.id, mapsReady]);

  function removeZone(id: string) {
    polygonsRef.current.get(id)?.setMap(null);
    polygonsRef.current.delete(id);
    setZones((prev) => prev.filter((z) => z._id !== id));
  }

  function updateZone(id: string, patch: Partial<PropertyZone>) {
    setZones((prev) => prev.map((z) => (z._id === id ? { ...z, ...patch } : z)));
    if (patch.type) {
      const color = colorForType(patch.type);
      const polygon = polygonsRef.current.get(id);
      polygon?.setOptions({ strokeColor: color, fillColor: color });
    }
  }

  const totalsByType: Record<FieldMapping, number> = {
    none: 0,
    turf: zones.filter((z) => z.type === "turf").reduce((s, z) => s + (z.sqft || 0), 0),
    mulch_bed: zones.filter((z) => z.type === "mulch_bed").reduce((s, z) => s + (z.sqft || 0), 0),
    parking_lot: zones.filter((z) => z.type === "parking_lot").reduce((s, z) => s + (z.sqft || 0), 0),
    gross: zones.reduce((s, z) => s + (z.sqft || 0), 0),
  };
  const totalSqft = totalsByType.gross;

  async function handleSave() {
    if (!property) return;
    try {
      await updateZones.mutateAsync({
        clientId,
        propertyId: property.id,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        zones: zones.map(({ _id, ...z }) => z),
      });

      const syncs = numberFieldDefs
        .map((f) => ({ f, mapping: fieldMappings[f.id] ?? "none" }))
        .filter(({ mapping }) => mapping !== "none");
      for (const { f, mapping } of syncs) {
        await upsertCustomField.mutateAsync({
          clientId,
          fieldDefId: f.id,
          valueNumber: totalsByType[mapping],
        });
      }

      toast.success(
        syncs.length > 0 ? `Measurements saved — synced ${syncs.length} custom field${syncs.length === 1 ? "" : "s"}` : "Measurements saved to property"
      );
      onOpenChange(false);
    } catch {
      toast.error("Failed to save measurements");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Aerial Measurement</DialogTitle>
        </DialogHeader>

        {!properties || properties.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Add a property to this client before taking measurements.
          </p>
        ) : !orgSettings?.googleMapsApiKey ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Google Maps API key not configured. Add it in Settings → Integrations.
          </p>
        ) : (
          <div className="space-y-3">
            {properties.length > 1 && (
              <Select value={propertyId ?? undefined} onValueChange={setPropertyId}>
                <SelectTrigger className="h-8 w-72 text-sm">
                  <SelectValue placeholder="Select a property" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name || p.address || "Unnamed property"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {mapsError && <p className="text-sm text-red-600">{mapsError}</p>}

            <div className="flex items-center gap-2">
              {!isDrawing ? (
                <Button type="button" size="sm" variant="outline" onClick={startDrawing} disabled={!mapsReady}>
                  + Trace a Zone
                </Button>
              ) : (
                <>
                  <span className="text-xs text-slate-500">
                    Click the map to trace the boundary ({draftPointCount} point{draftPointCount === 1 ? "" : "s"})
                  </span>
                  <Button type="button" size="sm" onClick={finishDrawing} disabled={draftPointCount < 3}>
                    Finish Shape
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={cancelDrawing}>
                    Cancel
                  </Button>
                </>
              )}
            </div>

            <div ref={mapDivRef} className="h-[420px] w-full rounded-md border border-slate-200 bg-slate-100" />

            <p className="text-xs text-slate-400">
              Click &ldquo;Trace a Zone&rdquo;, then click the map to place each corner of a turf area, bed, or
              hardscape, and click &ldquo;Finish Shape&rdquo; to close it. Drag a saved shape&rsquo;s corners to
              adjust it — the square footage updates automatically.
            </p>

            {zones.length > 0 && (
              <div className="rounded-md border border-slate-200">
                <div className="grid grid-cols-[1fr_10rem_6rem_2.5rem] gap-2 border-b bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <span>Zone name</span>
                  <span>Type</span>
                  <span className="text-right">Sq ft</span>
                  <span />
                </div>
                <div className="max-h-48 divide-y overflow-y-auto">
                  {zones.map((z) => (
                    <div key={z._id} className="grid grid-cols-[1fr_10rem_6rem_2.5rem] items-center gap-2 px-3 py-1.5">
                      <Input
                        value={z.name}
                        onChange={(e) => updateZone(z._id, { name: e.target.value })}
                        className="h-7 text-sm"
                      />
                      <Select value={z.type} onValueChange={(v) => updateZone(z._id, { type: v as PropertyZone["type"] })}>
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ZONE_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {z.path ? (
                        <span className="text-right text-sm text-slate-600">{z.sqft.toLocaleString()}</span>
                      ) : (
                        <Input
                          type="number"
                          value={z.sqft}
                          onChange={(e) => updateZone(z._id, { sqft: Number(e.target.value) || 0 })}
                          className="h-7 text-right text-sm"
                        />
                      )}
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600"
                        onClick={() => removeZone(z._id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-end gap-1 border-t bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
                  Total: {totalSqft.toLocaleString()} sq ft
                </div>
              </div>
            )}

            {numberFieldDefs.length > 0 && (
              <div className="rounded-md border border-slate-200">
                <div className="border-b bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Sync to Custom Fields
                </div>
                <div className="divide-y">
                  {numberFieldDefs.map((f) => {
                    const current = (customFieldValues ?? []).find((v) => v.fieldDefId === f.id)?.valueNumber;
                    const mapping = fieldMappings[f.id] ?? "none";
                    return (
                      <div key={f.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate text-slate-700">{f.name}{f.unit ? ` (${f.unit})` : ""}</p>
                          {current != null && (
                            <p className="text-xs text-slate-400">Current: {current.toLocaleString()}</p>
                          )}
                        </div>
                        <Select
                          value={mapping}
                          onValueChange={(v) => setFieldMappings((prev) => ({ ...prev, [f.id]: v as FieldMapping }))}
                        >
                          <SelectTrigger className="h-7 w-44 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Don&rsquo;t sync</SelectItem>
                            <SelectItem value="turf">Turf total ({totalsByType.turf.toLocaleString()})</SelectItem>
                            <SelectItem value="mulch_bed">Mulch bed total ({totalsByType.mulch_bed.toLocaleString()})</SelectItem>
                            <SelectItem value="parking_lot">Parking lot total ({totalsByType.parking_lot.toLocaleString()})</SelectItem>
                            <SelectItem value="gross">Gross total ({totalsByType.gross.toLocaleString()})</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!property || updateZones.isPending}
            className="bg-brand-500 hover:bg-brand-600 text-white"
          >
            {updateZones.isPending ? "Saving…" : "Save Measurements"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
