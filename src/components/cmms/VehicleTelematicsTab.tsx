"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ExternalLink, MapPin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RingGauge, TruckTires, type GaugeTone, type TireReading } from "@/components/cmms/TelematicsGauges";
import { useRefreshVehicleTelematics, useVehicleTelematics } from "@/lib/hooks/use-vehicle-telematics";
import { cn, relativeTime } from "@/lib/utils";
import type { TelematicsFaultCode, VehicleTelematicsSnapshot } from "@/types/telematics";

// ── Unit conversion + thresholds ─────────────────────────────────────────────

const kpaToPsi = (kpa: number) => Math.round(kpa * 0.145038);
const milliCToF = (mc: number) => Math.round((mc / 1000) * 9 / 5 + 32);

function fuelTone(pct: number): GaugeTone {
  return pct < 10 ? "bad" : pct < 20 ? "warn" : "ok";
}

function defTone(pct: number): GaugeTone {
  return pct < 10 ? "bad" : pct < 20 ? "warn" : "ok";
}

function coolantTone(f: number): GaugeTone {
  return f > 240 ? "bad" : f > 225 ? "warn" : "ok";
}

/** A running engine charges the battery (~13.5–14.5 V); a parked one rests near 12.4–12.8 V. */
function batteryTone(volts: number, running: boolean): GaugeTone {
  if (running) return volts < 12.4 ? "bad" : volts < 13 ? "warn" : "ok";
  return volts < 11.8 ? "bad" : volts < 12.2 ? "warn" : "ok";
}

/** 0–100 fill for a value inside [min, max]. */
function span(value: number, min: number, max: number): number {
  return ((value - min) / (max - min)) * 100;
}

/**
 * Tire pressure target depends on the truck (≈32 psi on a half-ton, ≈75 on a
 * 3/4-ton), so there is no fixed limit. A tire is flagged only when it sits
 * well below the other tire on its axle, which is what a slow leak looks like.
 */
function tireReadings(s: VehicleTelematicsSnapshot): Record<"fl" | "fr" | "bl" | "br", TireReading> {
  const read = (kpa: number | null, mate: number | null): TireReading => {
    if (kpa === null) return { value: null, tone: "idle" };
    const low = mate !== null && kpa < mate * 0.85;
    return { value: String(kpaToPsi(kpa)), tone: low ? "warn" : "ok" };
  };
  return {
    fl: read(s.tireFrontLeftKpa, s.tireFrontRightKpa),
    fr: read(s.tireFrontRightKpa, s.tireFrontLeftKpa),
    bl: read(s.tireBackLeftKpa, s.tireBackRightKpa),
    br: read(s.tireBackRightKpa, s.tireBackLeftKpa),
  };
}

function statTitle(s: VehicleTelematicsSnapshot, key: string): string | undefined {
  const t = s.statTimes[key];
  return t ? `Measured ${relativeTime(t)}` : undefined;
}

function latestStatTime(s: VehicleTelematicsSnapshot): string | null {
  const times = Object.values(s.statTimes);
  if (times.length === 0) return null;
  return times.reduce((a, b) => (new Date(a) > new Date(b) ? a : b));
}

// ── Sections ─────────────────────────────────────────────────────────────────

function Gauges({ s }: { s: VehicleTelematicsSnapshot }) {
  const running = s.engineState === "On" || s.engineState === "Idle";
  const volts = s.batteryMilliVolts === null ? null : s.batteryMilliVolts / 1000;
  const coolantF = s.coolantMilliC === null ? null : milliCToF(s.coolantMilliC);
  const def = s.defMilliPercent === null ? null : s.defMilliPercent / 1000;
  const tires = tireReadings(s);
  const noTires = Object.values(tires).every((t) => t.value === null);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[1fr_minmax(0,1.3fr)_1fr]">
        <div className="flex flex-row justify-around gap-6 md:flex-col md:items-center">
          <RingGauge
            label="Ignition Status"
            value={s.engineState === null ? null : s.engineState === "Off" ? "OFF" : s.engineState === "Idle" ? "IDLE" : "ON"}
            tone={running ? "ok" : "idle"}
            title={statTitle(s, "engineState")}
          />
          <RingGauge
            label="Battery"
            value={volts === null ? null : volts.toFixed(1)}
            unit="Volts"
            percent={volts === null ? null : span(volts, 11, 15)}
            tone={volts === null ? "idle" : batteryTone(volts, running)}
            title={statTitle(s, "batteryMilliVolts")}
          />
        </div>

        <div>
          <TruckTires frontLeft={tires.fl} frontRight={tires.fr} backLeft={tires.bl} backRight={tires.br} />
          <p className="mt-1 text-center text-sm font-medium text-slate-700 dark:text-neutral-300">Tire Pressure</p>
          {noTires && (
            <p className="text-center text-xs text-slate-400 dark:text-neutral-500">
              This vehicle doesn&apos;t report tire pressure.
            </p>
          )}
        </div>

        <div className="flex flex-row justify-around gap-6 md:flex-col md:items-center">
          <RingGauge
            label="Fuel Level"
            value={s.fuelPercent === null ? null : `${Math.round(s.fuelPercent)}%`}
            percent={s.fuelPercent}
            tone={s.fuelPercent === null ? "idle" : fuelTone(s.fuelPercent)}
            title={statTitle(s, "fuelPercent")}
          />
          <RingGauge
            label="Coolant Temp"
            value={coolantF === null ? null : `${coolantF}°`}
            unit="°F"
            percent={coolantF === null ? null : span(coolantF, 60, 260)}
            tone={coolantF === null ? "idle" : coolantTone(coolantF)}
            title={statTitle(s, "coolantMilliC")}
          />
        </div>
      </div>

      {def !== null && (
        <div className="flex justify-center border-t border-slate-100 pt-6 dark:border-neutral-800">
          <RingGauge
            label="DEF Level"
            value={`${Math.round(def)}%`}
            percent={def}
            tone={defTone(def)}
            title={statTitle(s, "defMilliPercent")}
          />
        </div>
      )}
    </div>
  );
}

const FAULT_STATUS_LABEL: Record<TelematicsFaultCode["status"], string> = {
  confirmed: "Confirmed",
  pending: "Pending",
  permanent: "Permanent",
};

function FaultCodes({ s }: { s: VehicleTelematicsSnapshot }) {
  const cel = s.checkEngineLight;
  const hasCodes = s.faultCodes.length > 0;
  const reported = cel !== null || s.statTimes.faultCodes !== undefined;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <h3 className="text-base font-semibold text-slate-900 dark:text-neutral-100">Fault Codes</h3>
        {!reported ? (
          <Badge variant="outline" className="text-slate-500 dark:text-neutral-400">Not reported</Badge>
        ) : cel ? (
          <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
            <AlertTriangle className="h-3 w-3" /> Check engine light ON
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> Check engine light off
          </Badge>
        )}
      </div>

      {hasCodes ? (
        <ul className="divide-y divide-slate-100 dark:divide-neutral-800">
          {s.faultCodes.map((f) => (
            <li key={`${f.source}-${f.code}-${f.status}`} className="flex items-start gap-3 px-5 py-3">
              <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", f.status === "pending" ? "text-slate-400 dark:text-neutral-500" : "text-amber-500")} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-900 dark:text-neutral-100">
                  <span className="font-mono font-semibold">{f.code}</span>
                  {f.description && <span className="text-slate-600 dark:text-neutral-400"> — {f.description}</span>}
                </p>
              </div>
              <Badge variant="outline" className="shrink-0 text-xs text-slate-600 dark:text-neutral-400">
                {FAULT_STATUS_LABEL[f.status]}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-6 text-sm text-slate-500 dark:text-neutral-400">
          {reported ? "No active fault codes." : "This vehicle doesn't report fault codes."}
        </p>
      )}
    </div>
  );
}

function compass(deg: number): string {
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
}

function Location({ s }: { s: VehicleTelematicsSnapshot }) {
  const has = s.latitude !== null && s.longitude !== null;
  const moving = (s.speedMph ?? 0) >= 1;
  const measured = s.statTimes.gps;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <h3 className="text-base font-semibold text-slate-900 dark:text-neutral-100">Location</h3>
        {has && (
          <Badge variant="outline" className="text-xs text-slate-600 dark:text-neutral-400">
            {moving ? `Moving · ${Math.round(s.speedMph ?? 0)} mph${s.headingDegrees !== null ? ` ${compass(s.headingDegrees)}` : ""}` : "Stopped"}
          </Badge>
        )}
      </div>
      {has ? (
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-neutral-100">
                {s.address ?? `${s.latitude?.toFixed(5)}, ${s.longitude?.toFixed(5)}`}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-neutral-400">
                {s.latitude?.toFixed(5)}, {s.longitude?.toFixed(5)}
                {measured ? ` · reported ${relativeTime(measured)}` : ""}
              </p>
            </div>
          </div>
          <a
            href={`https://www.google.com/maps?q=${s.latitude},${s.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            Open in Google Maps <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-slate-500 dark:text-neutral-400">This vehicle isn&apos;t reporting a location.</p>
      )}
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-2 py-16 text-center">
      <p className="text-sm font-medium text-slate-900 dark:text-neutral-100">{title}</p>
      <p className="text-sm text-slate-500 dark:text-neutral-400">{children}</p>
    </div>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────────

/**
 * Samsara telematics for one vehicle. Shows the last stored snapshot instantly
 * and pulls fresh values from Samsara once when the tab opens (the tab content
 * unmounts when another tab is selected, so every open is a refresh).
 */
export function VehicleTelematicsTab({ vehicleId }: { vehicleId: string }) {
  const { data: snapshot, isLoading } = useVehicleTelematics(vehicleId);
  const refresh = useRefreshVehicleTelematics(vehicleId);
  const { mutate } = refresh;

  const requested = useRef(false);
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    mutate();
  }, [mutate]);

  const outcome = refresh.data?.status;
  const refreshing = refresh.isPending;

  if (isLoading || (refreshing && !snapshot)) {
    return (
      <div className="flex h-60 flex-col items-center justify-center gap-3">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        <p className="text-sm text-slate-400 dark:text-neutral-500">Fetching from Samsara…</p>
      </div>
    );
  }

  if (!snapshot) {
    if (outcome === "not_configured") {
      return (
        <Notice title="Samsara isn't connected">
          An admin can add the Samsara API key under{" "}
          <Link href="/settings/equipt" className="font-medium text-brand-600 hover:underline dark:text-brand-400">Settings → Integrations</Link>.
        </Notice>
      );
    }
    if (outcome === "not_linked") {
      return (
        <Notice title="This vehicle isn't linked to Samsara">
          Set its Samsara Vehicle ID on the Details tab, or name it exactly as it appears in Samsara, then reopen this tab.
        </Notice>
      );
    }
    return (
      <Notice title="No telematics yet">
        {refresh.error ? refresh.error.message : "Nothing has been pulled from Samsara for this vehicle."}
        <span className="mt-3 block">
          <Button size="sm" variant="outline" onClick={() => refresh.mutate()}>Try again</Button>
        </span>
      </Notice>
    );
  }

  const latest = latestStatTime(snapshot);
  const stale = !!refresh.error;

  return (
    <div className="space-y-6 p-6">
      <div className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
          <h3 className="text-base font-semibold text-slate-900 dark:text-neutral-100">Telematics Sensor Readings</h3>
          <Button size="sm" variant="outline" onClick={() => refresh.mutate()} disabled={refreshing} className="gap-1.5">
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
        <div className="p-6">
          <Gauges s={snapshot} />
        </div>
        <div className="border-t px-5 py-2.5 text-center text-xs text-slate-500 dark:text-neutral-400">
          {stale ? (
            <span className="text-amber-600 dark:text-amber-400">
              Couldn&apos;t refresh ({refresh.error?.message}) — showing values from {relativeTime(snapshot.fetchedAt)}.
            </span>
          ) : (
            <>
              Latest sensor reading {latest ? relativeTime(latest) : "unknown"} · checked with Samsara {relativeTime(snapshot.fetchedAt)}
            </>
          )}
        </div>
      </div>

      <Location s={snapshot} />

      <FaultCodes s={snapshot} />
    </div>
  );
}
