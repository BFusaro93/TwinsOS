"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Pentagon, Ruler, SquareMinus, Trash2, Undo2 } from "lucide-react";
import { useClient, useClientProperties, useAddClientProperty, useUpdateClientPropertyZones } from "@/lib/hooks/use-clients";
import { useOrgSettings } from "@/lib/hooks/use-org-settings";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import type { PropertyZone } from "@/types/crm";
import { isAreaZone, sumLinearFt, sumZoneSqft, type LinearType } from "@/lib/property-zones";
import { usePropertyCustomFieldValues, useUpsertPropertyCustomFieldValue } from "@/lib/hooks/use-rate-matrix";
import {
  useCustomFieldDefs,
  useClientCustomFieldValues,
  useUpsertClientCustomFieldValue,
} from "@/lib/hooks/use-client-custom-fields";

/** Which measurement total a number-type custom field should be kept in sync with. */
type FieldMapping = "none" | "turf" | "mulch_bed" | "parking_lot" | "gross" | "perimeter" | "edging" | "linear_other" | "linear";

function suggestMapping(fieldName: string): FieldMapping {
  const n = fieldName.toLowerCase();
  if (n.includes("turf")) return "turf";
  if (n.includes("mulch")) return "mulch_bed";
  if (n.includes("parking")) return "parking_lot";
  if (n.includes("perimeter")) return "perimeter";
  if (n.includes("edg")) return "edging";
  if (/linear|fence|length|distance|\bfeet\b|\bft\b/.test(n)) return "linear";
  if (n.includes("gross") || n.includes("total")) return "gross";
  return "none";
}

const ZONE_TYPES: { value: PropertyZone["type"]; label: string; short: string; color: string }[] = [
  { value: "turf", label: "Turf", short: "Turf", color: "#22c55e" },
  { value: "mulch_bed", label: "Mulch Bed", short: "Mulch Bed", color: "#92400e" },
  { value: "parking_lot", label: "Parking Lot / Hardscape", short: "Hardscape", color: "#64748b" },
  { value: "other", label: "Other", short: "Other", color: "#6366f1" },
];

const SQFT_PER_SQMETER = 10.7639;
const FT_PER_METER = 3.28084;
const LINEAR_TYPES: { value: LinearType; label: string }[] = [
  { value: "perimeter", label: "Perimeter" },
  { value: "edging", label: "Edging" },
  { value: "other", label: "Other" },
];
const SUBTRACT_COLOR = "#dc2626";
const LINEAR_COLOR = "#f97316";

type DrawKind = "add" | "subtract" | "linear";

function colorForZone(z: Pick<PropertyZone, "type" | "mode" | "kind">): string {
  if (z.kind === "linear") return LINEAR_COLOR;
  if (z.mode === "subtract") return SUBTRACT_COLOR;
  return colorForType(z.type);
}

/** Closed-loop perimeter of an area zone, in feet (needs the Maps geometry library to be loaded). */
function perimeterFt(path: LatLngLiteral[]): number {
  if (path.length < 3 || typeof google === "undefined" || !google.maps.geometry) return 0;
  return Math.round(google.maps.geometry.spherical.computeLength([...path, path[0]]) * FT_PER_METER);
}

function colorForType(type: PropertyZone["type"]): string {
  return ZONE_TYPES.find((t) => t.value === type)?.color ?? "#6366f1";
}

type LatLngLiteral = { lat: number; lng: number };

/** Cross-product-sign orientation test used by the segment-intersection check below. */
function orientation(a: LatLngLiteral, b: LatLngLiteral, c: LatLngLiteral): 0 | 1 | 2 {
  const val = (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);
  if (Math.abs(val) < 1e-12) return 0;
  return val > 0 ? 1 : 2;
}

/** Is point b on segment a-c, given a,b,c are already known to be collinear? */
function onSegment(a: LatLngLiteral, b: LatLngLiteral, c: LatLngLiteral): boolean {
  return (
    Math.min(a.lng, c.lng) - 1e-12 <= b.lng &&
    b.lng <= Math.max(a.lng, c.lng) + 1e-12 &&
    Math.min(a.lat, c.lat) - 1e-12 <= b.lat &&
    b.lat <= Math.max(a.lat, c.lat) + 1e-12
  );
}

function segmentsIntersect(p1: LatLngLiteral, p2: LatLngLiteral, p3: LatLngLiteral, p4: LatLngLiteral): boolean {
  const o1 = orientation(p1, p2, p3);
  const o2 = orientation(p1, p2, p4);
  const o3 = orientation(p3, p4, p1);
  const o4 = orientation(p3, p4, p2);

  if (o1 !== o2 && o3 !== o4) return true;

  // Collinear special cases (one endpoint lies exactly on the other segment).
  if (o1 === 0 && onSegment(p1, p3, p2)) return true;
  if (o2 === 0 && onSegment(p1, p4, p2)) return true;
  if (o3 === 0 && onSegment(p3, p1, p4)) return true;
  if (o4 === 0 && onSegment(p3, p2, p4)) return true;

  return false;
}

/**
 * A hand-traced polygon is invalid ("bowtie") if any two non-adjacent edges cross.
 * O(n^2) pairwise edge check — fine for the small vertex counts a traced zone has.
 */
function isSelfIntersecting(path: LatLngLiteral[]): boolean {
  const n = path.length;
  if (n < 4) return false; // a triangle can never self-intersect
  for (let i = 0; i < n; i++) {
    const a1 = path[i];
    const a2 = path[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      const isAdjacent = (j + 1) % n === i || (i + 1) % n === j;
      if (isAdjacent) continue;
      const b1 = path[j];
      const b2 = path[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

interface DraftZone extends PropertyZone {
  _id: string;
  /** Local-only flag (never persisted) — true when this zone's traced path crosses itself. */
  invalid?: boolean;
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
  const { data: client } = useClient(clientId);
  const addProperty = useAddClientProperty();
  const { data: orgSettings } = useOrgSettings();
  const updateZones = useUpdateClientPropertyZones();
  const { data: customFieldDefs } = useCustomFieldDefs();
  const { data: customFieldValues } = useClientCustomFieldValues(clientId);
  const upsertCustomField = useUpsertClientCustomFieldValue();
  const upsertPropertyField = useUpsertPropertyCustomFieldValue();
  const numberFieldDefs = (customFieldDefs ?? []).filter((f) => f.fieldType === "number");

  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [zones, setZones] = useState<DraftZone[]>([]);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [mapsReady, setMapsReady] = useState(false);
  const [fieldMappings, setFieldMappings] = useState<Record<string, FieldMapping>>({});

  const [isDrawing, setIsDrawing] = useState(false);
  const [drawKind, setDrawKind] = useState<DrawKind>("add");
  const [draftPointCount, setDraftPointCount] = useState(0);

  // State (not a plain ref) so the map-init effect re-runs once the container actually mounts —
  // the dialog content is portaled and the container only renders after properties load, so a
  // ref read at effect time was usually still null and the map stayed blank.
  const [mapEl, setMapEl] = useState<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polygonsRef = useRef<Map<string, google.maps.Polygon | google.maps.Polyline>>(new Map());
  const isDrawingRef = useRef(false);
  const drawKindRef = useRef<DrawKind>("add");
  const markerRef = useRef<google.maps.Marker | null>(null);
  const draftVertexMarkersRef = useRef<google.maps.Marker[]>([]);
  const draftGuideRef = useRef<google.maps.Polyline | null>(null);
  const [draftReadout, setDraftReadout] = useState("");
  const draftPathRef = useRef<google.maps.LatLngLiteral[]>([]);
  const draftPolygonRef = useRef<google.maps.Polygon | google.maps.Polyline | null>(null);
  const autoCreatedPropertyRef = useRef(false);

  const property = useMemo(
    () => properties?.find((p) => p.id === propertyId) ?? null,
    [properties, propertyId]
  );

  // Satellite properties keep their own custom values; only the master mirrors the client's.
  const { data: propertyFieldValues } = usePropertyCustomFieldValues(
    property && !property.isMaster ? property.id : ""
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
      mapRef.current = null;
      polygonsRef.current.forEach((p) => p.setMap(null));
      polygonsRef.current.clear();
      clearDraftOverlays();
      markerRef.current?.setMap(null);
      markerRef.current = null;
      draftPathRef.current = [];
      isDrawingRef.current = false;
      setIsDrawing(false);
      setDraftPointCount(0);
      setFieldMappings({});
      autoCreatedPropertyRef.current = false;
    }
  }, [open, properties, propertyId]);

  // Most clients never get a separate Property record added — they just use
  // the client's own service/billing address — so this used to dead-end here
  // with "Add a property to this client before taking measurements" for
  // almost everyone. Silently create a master property from the client's own
  // address instead, once per time the dialog is opened, so the tool just
  // works without an extra manual step.
  useEffect(() => {
    if (!open || !client || !properties || properties.length > 0) return;
    if (autoCreatedPropertyRef.current || addProperty.isPending) return;
    const address = client.serviceAddress ?? client.billingAddress;
    if (!address) return;
    autoCreatedPropertyRef.current = true;
    addProperty.mutate({
      clientId,
      isMaster: true,
      property: {
        address,
        city: client.serviceAddress ? client.serviceCity ?? undefined : client.billingCity ?? undefined,
        state: client.serviceAddress ? client.serviceState ?? undefined : client.billingState ?? undefined,
        zip: client.serviceAddress ? client.serviceZip ?? undefined : client.billingZip ?? undefined,
        gateCode: client.gateCode ?? undefined,
        notesToCrew: client.notesToCrew ?? undefined,
      },
    }, {
      onError: () => {
        autoCreatedPropertyRef.current = false;
        toast.error("Couldn't set up this client's property automatically — try adding one manually.");
      },
    });
  }, [open, client, properties, clientId, addProperty]);

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

  /** Removes every in-progress overlay: the draft shape, its numbered corner dots, and the cursor guide line. */
  function clearDraftOverlays() {
    draftPolygonRef.current?.setMap(null);
    draftPolygonRef.current = null;
    draftVertexMarkersRef.current.forEach((m) => m.setMap(null));
    draftVertexMarkersRef.current = [];
    draftGuideRef.current?.setMap(null);
    draftGuideRef.current = null;
    mapRef.current?.setOptions({ draggableCursor: undefined });
    setDraftReadout("");
  }

  /** Live "so far" figure shown while tracing, including the segment out to the cursor. */
  function updateReadout(cursor?: google.maps.LatLngLiteral) {
    const pts = cursor ? [...draftPathRef.current, cursor] : draftPathRef.current;
    if (pts.length < 2) return setDraftReadout("");
    if (drawKindRef.current === "linear") {
      const ft = Math.round(google.maps.geometry.spherical.computeLength(pts) * FT_PER_METER);
      setDraftReadout(`${ft.toLocaleString()} ft so far`);
    } else if (pts.length >= 3) {
      const sqft = Math.round(google.maps.geometry.spherical.computeArea(pts) * SQFT_PER_SQMETER);
      setDraftReadout(`${sqft.toLocaleString()} sq ft so far`);
    }
  }

  function startDrawing(kind: DrawKind) {
    clearDraftOverlays();
    mapRef.current?.setOptions({ draggableCursor: "crosshair" });
    draftPathRef.current = [];
    drawKindRef.current = kind;
    setDrawKind(kind);
    isDrawingRef.current = true;
    setIsDrawing(true);
    setDraftPointCount(0);
  }

  function cancelDrawing() {
    clearDraftOverlays();
    draftPathRef.current = [];
    isDrawingRef.current = false;
    setIsDrawing(false);
    setDraftPointCount(0);
  }

  function undoLastPoint() {
    if (draftPathRef.current.length === 0) return;
    draftPathRef.current = draftPathRef.current.slice(0, -1);
    draftPolygonRef.current?.setPath(draftPathRef.current);
    draftVertexMarkersRef.current.pop()?.setMap(null);
    draftGuideRef.current?.setPath([]);
    updateReadout();
    setDraftPointCount(draftPathRef.current.length);
  }

  function finishDrawing() {
    const path = draftPathRef.current;
    const kind = drawKindRef.current;
    const minPoints = kind === "linear" ? 2 : 3;
    if (path.length < minPoints || !mapRef.current) return;

    if (kind !== "linear" && isSelfIntersecting(path)) {
      toast.error("This shape crosses itself — please retrace it.");
      return; // leave the draft in place so the user can keep adjusting or hit Cancel
    }

    clearDraftOverlays();

    const id = crypto.randomUUID();
    if (kind === "linear") {
      const lengthFt = Math.round(google.maps.geometry.spherical.computeLength(path) * FT_PER_METER);
      setZones((prev) => {
        const n = prev.filter((z) => z.kind === "linear").length + 1;
        return [...prev, { _id: id, name: `Distance ${n}`, type: "other", kind: "linear", linearType: "perimeter", sqft: 0, lengthFt, notes: "", path }];
      });
      registerPolyline(
        id,
        new google.maps.Polyline({
          path,
          strokeColor: LINEAR_COLOR,
          strokeWeight: 3,
          editable: true,
          map: mapRef.current,
        })
      );
    } else {
      const mode = kind === "subtract" ? "subtract" : "add";
      const sqft = Math.round(google.maps.geometry.spherical.computeArea(path) * SQFT_PER_SQMETER);
      setZones((prev) => {
        const n = prev.filter(isAreaZone).length + 1;
        return [
          ...prev,
          {
            _id: id,
            name: mode === "subtract" ? `Cut-out ${n}` : `Zone ${n}`,
            type: "turf",
            mode,
            sqft,
            notes: "",
            path,
          },
        ];
      });
      const color = colorForZone({ type: "turf", mode });
      registerPolygon(
        id,
        new google.maps.Polygon({
          paths: path,
          strokeColor: color,
          strokeWeight: 2,
          fillColor: color,
          fillOpacity: 0.25,
          editable: true,
          map: mapRef.current,
        })
      );
    }

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
      const invalid = isSelfIntersecting(path);
      setZones((prev) => prev.map((z) => (z._id === id ? { ...z, sqft, path, invalid } : z)));
    };
    polygon.getPath().addListener("set_at", recompute);
    polygon.getPath().addListener("insert_at", recompute);
    polygon.getPath().addListener("remove_at", recompute);
  }

  function registerPolyline(id: string, line: google.maps.Polyline) {
    polygonsRef.current.get(id)?.setMap(null);
    polygonsRef.current.set(id, line);
    const recompute = () => {
      const lengthFt = Math.round(google.maps.geometry.spherical.computeLength(line.getPath()) * FT_PER_METER);
      const path = line.getPath().getArray().map((p) => ({ lat: p.lat(), lng: p.lng() }));
      setZones((prev) => prev.map((z) => (z._id === id ? { ...z, lengthFt, path } : z)));
    };
    line.getPath().addListener("set_at", recompute);
    line.getPath().addListener("insert_at", recompute);
    line.getPath().addListener("remove_at", recompute);
  }

  // Load the map once we have a container + API key
  useEffect(() => {
    if (!open || !orgSettings?.googleMapsApiKey || !mapEl) return;
    let cancelled = false;
    loadGoogleMaps(orgSettings.googleMapsApiKey)
      .then(() => {
        if (cancelled) return;
        const map = new google.maps.Map(mapEl, {
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
            draftPolygonRef.current =
              drawKindRef.current === "linear"
                ? new google.maps.Polyline({
                    path: draftPathRef.current,
                    strokeColor: LINEAR_COLOR,
                    strokeWeight: 3,
                    clickable: false,
                    map,
                  })
                : new google.maps.Polygon({
                    paths: draftPathRef.current,
                    strokeColor: drawKindRef.current === "subtract" ? SUBTRACT_COLOR : "#2563eb",
                    strokeWeight: 2,
                    fillColor: drawKindRef.current === "subtract" ? SUBTRACT_COLOR : "#2563eb",
                    fillOpacity: 0.15,
                    clickable: false,
                    map,
                  });
          } else {
            draftPolygonRef.current.setPath(draftPathRef.current);
          }
          setDraftPointCount(draftPathRef.current.length);

          // Numbered dot at each placed corner so it's obvious exactly where the click landed.
          const n = draftPathRef.current.length;
          draftVertexMarkersRef.current.push(
            new google.maps.Marker({
              position: pt,
              map,
              clickable: false,
              zIndex: 1000,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 9,
                fillColor: n === 1 ? "#16a34a" : "#ffffff",
                fillOpacity: 1,
                strokeColor: drawKindRef.current === "subtract" ? SUBTRACT_COLOR : drawKindRef.current === "linear" ? LINEAR_COLOR : "#2563eb",
                strokeWeight: 3,
              },
              label: { text: String(n), color: n === 1 ? "#ffffff" : "#111827", fontSize: "10px", fontWeight: "700" },
            })
          );
          updateReadout();
        });

        // Dashed guide from the last placed point to the cursor, so the next segment is visible before clicking.
        map.addListener("mousemove", (e: google.maps.MapMouseEvent) => {
          if (!isDrawingRef.current || !e.latLng || draftPathRef.current.length === 0) return;
          const cursor = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          const last = draftPathRef.current[draftPathRef.current.length - 1];
          const guide = [last, cursor];
          if (!draftGuideRef.current) {
            draftGuideRef.current = new google.maps.Polyline({
              path: guide,
              strokeColor: "#111827",
              strokeOpacity: 0.7,
              strokeWeight: 2,
              clickable: false,
              zIndex: 999,
              map,
            });
          } else {
            draftGuideRef.current.setPath(guide);
          }
          updateReadout(cursor);
        });

        setMapsReady(true);
      })
      .catch(() => setMapsError("Failed to load Google Maps. Check the API key in Settings → Integrations."));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orgSettings?.googleMapsApiKey, mapEl]);

  // Seed zones + redraw saved shapes whenever the selected property (or map readiness) changes
  useEffect(() => {
    // Switching properties mid-trace would otherwise silently orphan the in-progress
    // shape (it stays drawn against the old property's map view but its data is discarded
    // the moment `zones` is reseeded below) — cancel the draft and warn instead.
    if (isDrawingRef.current) {
      clearDraftOverlays();
      draftPathRef.current = [];
      isDrawingRef.current = false;
      setIsDrawing(false);
      setDraftPointCount(0);
      toast.warning("Switched property — the shape you were tracing was discarded.");
    }

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
          // Pin the property so it's obvious which building on the overhead this client is.
          markerRef.current?.setMap(null);
          markerRef.current = new google.maps.Marker({
            position: results[0].geometry.location,
            map: mapRef.current,
            title: address,
            clickable: false,
          });
        }
      });
    }

    seeded.forEach((z) => {
      if (!z.path || !mapRef.current) return;
      if (z.kind === "linear") {
        if (z.path.length < 2) return;
        registerPolyline(
          z._id,
          new google.maps.Polyline({
            path: z.path,
            strokeColor: LINEAR_COLOR,
            strokeWeight: 3,
            editable: true,
            map: mapRef.current,
          })
        );
      } else if (z.path.length >= 3) {
        const color = colorForZone(z);
        registerPolygon(
          z._id,
          new google.maps.Polygon({
            paths: z.path,
            strokeColor: color,
            strokeWeight: 2,
            fillColor: color,
            fillOpacity: 0.25,
            editable: true,
            map: mapRef.current,
          })
        );
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
    const existing = zones.find((z) => z._id === id);
    setZones((prev) => prev.map((z) => (z._id === id ? { ...z, ...patch } : z)));
    if (existing && (patch.type || patch.mode)) {
      const color = colorForZone({ ...existing, ...patch });
      polygonsRef.current.get(id)?.setOptions({ strokeColor: color, fillColor: color });
    }
  }

  const areaZones = zones.filter(isAreaZone);
  const linearZones = zones.filter((z) => z.kind === "linear");
  const totalsByType: Record<Exclude<FieldMapping, "none">, number> & { none: number } = {
    none: 0,
    turf: sumZoneSqft(areaZones, "turf"),
    mulch_bed: sumZoneSqft(areaZones, "mulch_bed"),
    parking_lot: sumZoneSqft(areaZones, "parking_lot"),
    gross: sumZoneSqft(areaZones),
    perimeter: sumLinearFt(linearZones, "perimeter"),
    edging: sumLinearFt(linearZones, "edging"),
    linear_other: sumLinearFt(linearZones, "other"),
    linear: sumLinearFt(linearZones),
  };
  const totalSqft = totalsByType.gross;
  const totalLinearFt = totalsByType.linear;
  /** Sum of the distance lines that point at each number custom field (lines sharing a field add together). */
  const lineSums = new Map<string, number>();
  for (const z of linearZones) {
    if (z.customFieldId && numberFieldDefs.some((f) => f.id === z.customFieldId)) {
      lineSums.set(z.customFieldId, (lineSums.get(z.customFieldId) ?? 0) + (z.lengthFt || 0));
    }
  }
  /** A distance mapping only writes when something of that type was actually measured (never overwrite with a phantom 0). */
  function hasMeasurementFor(m: FieldMapping): boolean {
    if (m === "linear") return linearZones.length > 0;
    if (m === "perimeter" || m === "edging") return linearZones.some((z) => z.linearType === m);
    if (m === "linear_other") return linearZones.some((z) => (z.linearType ?? "other") === "other");
    return true;
  }

  async function handleSave() {
    if (!property) return;

    if (isDrawing) {
      toast.error("You have an unfinished shape — finish or cancel it before saving.");
      return;
    }
    if (zones.some((z) => z.invalid)) {
      toast.error("One or more zones cross themselves — please retrace them before saving.");
      return;
    }

    try {
      await updateZones.mutateAsync({
        clientId,
        propertyId: property.id,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        zones: zones.map(({ _id, invalid, ...z }) => z),
      });
    } catch {
      toast.error("Failed to save measurements");
      return;
    }

    // Zone save succeeded at this point — report custom-field sync problems separately
    // so a sync failure doesn't read as "nothing was saved" when the zones did save.
    const syncs = numberFieldDefs
      .map((f) => {
        // Distances pointed straight at this field win over the type-total dropdown.
        if (lineSums.has(f.id)) return { f, value: lineSums.get(f.id) ?? 0 };
        const mapping = fieldMappings[f.id] ?? "none";
        // Don't wipe an existing value with 0 when nothing of that distance type was measured.
        if (mapping === "none" || !hasMeasurementFor(mapping)) return null;
        return { f, value: totalsByType[mapping] };
      })
      .filter((x): x is { f: (typeof numberFieldDefs)[number]; value: number } => x !== null);
    let syncFailures = 0;
    for (const { f, value } of syncs) {
      try {
        // Client-level custom values mirror the client's own (master) address only.
        // A satellite property writes its own values so the totals can't leak into
        // estimates for the master property.
        if (property.isMaster) {
          await upsertCustomField.mutateAsync({
            clientId,
            fieldDefId: f.id,
            valueNumber: value,
          });
        } else {
          await upsertPropertyField.mutateAsync({
            propertyId: property.id,
            fieldDefId: f.id,
            valueNumber: value,
          });
        }
      } catch {
        syncFailures++;
      }
    }

    if (syncFailures > 0) {
      toast.warning(
        `Measurements saved, but ${syncFailures} custom field${syncFailures === 1 ? "" : "s"} failed to sync`
      );
    } else {
      toast.success(
        syncs.length > 0
          ? `Measurements saved — synced ${syncs.length} custom field${syncs.length === 1 ? "" : "s"}`
          : "Measurements saved to property"
      );
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Aerial Measurement</DialogTitle>
        </DialogHeader>

        {!properties || properties.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {addProperty.isPending
              ? "Setting up this client's property…"
              : client && !client.serviceAddress && !client.billingAddress
                ? "This client has no address on file yet — add one under Details, or add a property manually, before taking measurements."
                : "Add a property to this client before taking measurements."}
          </p>
        ) : !orgSettings?.googleMapsApiKey ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
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

            {mapsError && <p className="text-sm text-red-600 dark:text-red-400">{mapsError}</p>}

            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-slate-50 dark:bg-muted/40 px-2 py-2">
              {!isDrawing ? (
                <>
                  <Button type="button" size="sm" variant="outline" onClick={() => startDrawing("add")} disabled={!mapsReady}>
                    <Pentagon className="mr-1.5 h-3.5 w-3.5 text-green-600" />
                    Trace Area
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => startDrawing("subtract")} disabled={!mapsReady}>
                    <SquareMinus className="mr-1.5 h-3.5 w-3.5 text-red-600" />
                    Subtract Area
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => startDrawing("linear")} disabled={!mapsReady}>
                    <Ruler className="mr-1.5 h-3.5 w-3.5 text-orange-500" />
                    Measure Distance
                  </Button>
                  <span className="ml-auto hidden text-[11px] text-slate-400 dark:text-neutral-500 sm:block">
                    Pick a tool, then click the map
                  </span>
                </>
              ) : (
                <>
                  <span className="text-xs font-medium text-slate-700 dark:text-neutral-300">
                    {drawKind === "linear"
                      ? "Measuring distance — click each point along the line."
                      : drawKind === "subtract"
                        ? "Subtracting — click each corner of the area to cut out (e.g. the house)."
                        : "Tracing — click each corner of the area."}
                  </span>
                  {draftReadout && (
                    <span className="rounded bg-white dark:bg-background px-1.5 py-0.5 text-xs font-semibold text-slate-700 dark:text-neutral-300 border border-border">
                      {draftReadout}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={undoLastPoint} disabled={draftPointCount === 0}>
                      <Undo2 className="mr-1 h-3.5 w-3.5" />
                      Undo Point
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={cancelDrawing}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={finishDrawing}
                      disabled={draftPointCount < (drawKind === "linear" ? 2 : 3)}
                    >
                      {drawKind === "linear" ? "Finish Line" : "Finish Shape"}
                    </Button>
                  </div>
                </>
              )}
            </div>

            <div ref={setMapEl} className="h-[420px] w-full rounded-md border border-border bg-muted" />

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-neutral-400">
              <span>📍 Pin = the property&rsquo;s address</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#22c55e" }} /> Area (adds)</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SUBTRACT_COLOR }} /> Subtracted</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: LINEAR_COLOR }} /> Distance</span>
              <span>Zones of the same type add together · drag corners to adjust</span>
            </div>

            {areaZones.length > 0 && (
              <div className="rounded-md border border-border">
                <div className="grid grid-cols-[1fr_9rem_7.5rem_6rem_2.5rem] gap-2 border-b bg-slate-50 dark:bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
                  <span>Zone name</span>
                  <span>Type</span>
                  <span>Effect</span>
                  <span className="text-right">Sq ft</span>
                  <span />
                </div>
                <div className="max-h-48 divide-y overflow-y-auto">
                  {areaZones.map((z) => (
                    <div
                      key={z._id}
                      className={`grid grid-cols-[1fr_9rem_7.5rem_6rem_2.5rem] items-center gap-2 px-3 py-1.5 ${z.invalid ? "bg-red-50 dark:bg-red-950/40" : ""}`}
                    >
                      <div className="min-w-0">
                        <Input
                          value={z.name}
                          onChange={(e) => updateZone(z._id, { name: e.target.value })}
                          className="h-7 text-sm"
                        />
                        {z.path && mapsReady && (
                          <p className="mt-0.5 text-[11px] text-slate-400 dark:text-neutral-500">
                            Perimeter: {perimeterFt(z.path).toLocaleString()} ft
                          </p>
                        )}
                        {z.invalid && (
                          <p className="mt-0.5 text-[11px] text-red-600 dark:text-red-400">
                            This shape crosses itself — retrace it before saving.
                          </p>
                        )}
                      </div>
                      <Select value={z.type} onValueChange={(v) => updateZone(z._id, { type: v as PropertyZone["type"] })}>
                        <SelectTrigger className="h-7 gap-1 px-2 text-left text-xs">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-sm"
                              style={{ background: colorForZone(z) }}
                            />
                            <span className="truncate">{ZONE_TYPES.find((t) => t.value === z.type)?.short}</span>
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {ZONE_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={z.mode === "subtract" ? "subtract" : "add"}
                        onValueChange={(v) => updateZone(z._id, { mode: v as "add" | "subtract" })}
                      >
                        <SelectTrigger className="h-7 px-2 text-left text-xs">
                          <span className="truncate">{z.mode === "subtract" ? "− Subtracts" : "+ Adds"}</span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="add">Adds</SelectItem>
                          <SelectItem value="subtract">Subtracts</SelectItem>
                        </SelectContent>
                      </Select>
                      {z.path ? (
                        <span
                          className={`text-right text-sm ${z.mode === "subtract" ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-neutral-400"}`}
                        >
                          {z.mode === "subtract" ? "−" : ""}
                          {z.sqft.toLocaleString()}
                        </span>
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
                        className="flex h-7 w-7 items-center justify-center rounded text-slate-400 dark:text-neutral-500 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400"
                        onClick={() => removeZone(z._id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-0.5 border-t bg-slate-50 dark:bg-muted/40 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-neutral-400">
                  {(["turf", "mulch_bed", "parking_lot"] as const)
                    .filter((t) => areaZones.some((z) => z.type === t))
                    .map((t) => (
                      <span key={t} className="font-normal">
                        {ZONE_TYPES.find((zt) => zt.value === t)?.label}: {totalsByType[t].toLocaleString()}
                      </span>
                    ))}
                  <span>Total: {totalSqft.toLocaleString()} sq ft</span>
                </div>
              </div>
            )}

            {linearZones.length > 0 && (
              <div className="rounded-md border border-border">
                <div className="grid grid-cols-[1fr_9rem_10rem_8rem_2.5rem] gap-2 border-b bg-slate-50 dark:bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
                  <span>Distance</span>
                  <span>Type</span>
                  <span>Counts toward</span>
                  <span className="text-right">Length</span>
                  <span />
                </div>
                <div className="max-h-32 divide-y overflow-y-auto">
                  {linearZones.map((z) => (
                    <div key={z._id} className="grid grid-cols-[1fr_9rem_10rem_8rem_2.5rem] items-center gap-2 px-3 py-1.5">
                      <Input
                        value={z.name}
                        onChange={(e) => updateZone(z._id, { name: e.target.value })}
                        className="h-7 text-sm"
                      />
                      <Select
                        value={z.linearType ?? "other"}
                        onValueChange={(v) => updateZone(z._id, { linearType: v as LinearType })}
                      >
                        <SelectTrigger className="h-7 px-2 text-left text-xs">
                          <span className="truncate">{LINEAR_TYPES.find((t) => t.value === (z.linearType ?? "other"))?.label}</span>
                        </SelectTrigger>
                        <SelectContent>
                          {LINEAR_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={z.customFieldId ?? "none"}
                        onValueChange={(v) => updateZone(z._id, { customFieldId: v === "none" ? null : v })}
                        disabled={numberFieldDefs.length === 0}
                      >
                        <SelectTrigger className="h-7 px-2 text-left text-xs">
                          <span className="truncate">
                            {numberFieldDefs.find((f) => f.id === z.customFieldId)?.name ??
                              (numberFieldDefs.length === 0 ? "No number fields" : "Not synced")}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not synced</SelectItem>
                          {numberFieldDefs.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-right text-sm text-slate-600 dark:text-neutral-400">
                        {(z.lengthFt ?? 0).toLocaleString()} ft
                        <span className="block text-[11px] text-slate-400 dark:text-neutral-500">
                          {Math.round((z.lengthFt ?? 0) / 3).toLocaleString()} yd ·{" "}
                          {Math.round((z.lengthFt ?? 0) / FT_PER_METER).toLocaleString()} m
                        </span>
                      </span>
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded text-slate-400 dark:text-neutral-500 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400"
                        onClick={() => removeZone(z._id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-0.5 border-t bg-slate-50 dark:bg-muted/40 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-neutral-400">
                  {LINEAR_TYPES.filter((t) => linearZones.some((z) => (z.linearType ?? "other") === t.value)).map((t) => (
                    <span key={t.value} className="font-normal">
                      {t.label}: {sumLinearFt(linearZones, t.value).toLocaleString()} ft
                    </span>
                  ))}
                  <span>Total: {totalLinearFt.toLocaleString()} ft</span>
                </div>
              </div>
            )}

            {numberFieldDefs.length > 0 && (
              <div className="rounded-md border border-border">
                <div className="border-b bg-slate-50 dark:bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
                  Sync to Custom Fields
                </div>
                <div className="divide-y">
                  {numberFieldDefs.map((f) => {
                    const current = (property && !property.isMaster ? propertyFieldValues : customFieldValues ?? [])?.find((v) => v.fieldDefId === f.id)?.valueNumber;
                    const mapping = fieldMappings[f.id] ?? "none";
                    return (
                      <div key={f.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate text-slate-700 dark:text-neutral-300">{f.name}{f.unit ? ` (${f.unit})` : ""}</p>
                          {current != null && (
                            <p className="text-xs text-slate-400 dark:text-neutral-500">Current: {current.toLocaleString()}</p>
                          )}
                        </div>
                        {lineSums.has(f.id) ? (
                          <span className="text-xs text-slate-500 dark:text-neutral-400">
                            From distance lines: {Math.round(lineSums.get(f.id) ?? 0).toLocaleString()} ft
                          </span>
                        ) : (
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
                            <SelectItem value="perimeter">Perimeter total ({totalsByType.perimeter.toLocaleString()} ft)</SelectItem>
                            <SelectItem value="edging">Edging total ({totalsByType.edging.toLocaleString()} ft)</SelectItem>
                            <SelectItem value="linear_other">Other distance total ({totalsByType.linear_other.toLocaleString()} ft)</SelectItem>
                            <SelectItem value="linear">All distances total ({totalsByType.linear.toLocaleString()} ft)</SelectItem>
                          </SelectContent>
                        </Select>
                        )}
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
