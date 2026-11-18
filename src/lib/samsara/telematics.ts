import type { Json } from "@/types/supabase";
import type {
  EngineState,
  FaultCodeStatus,
  TelematicsFaultCode,
  VehicleTelematicsSnapshot,
} from "@/types/telematics";

/**
 * Samsara stats for ONE vehicle, normalised for storage/display. Only the
 * values — id/timestamps are added by the route. Pure functions so the shapes
 * can be exercised against real payloads without a network.
 */

const SAMSARA_BASE_URL = "https://api.samsara.com";

/** Samsara accepts at most 3 `types` per stats request. */
const STAT_TYPE_GROUPS: readonly string[] = [
  "engineStates,fuelPercents,batteryMilliVolts",
  "engineCoolantTemperatureMilliC,defLevelMilliPercent,tirePressure",
  "faultCodes,gps",
];

// ── Raw Samsara response shapes (only what we read) ─────────────────────────

interface TimedValue<T> {
  time?: string;
  value?: T;
}

interface SamsaraDtc {
  dtcShortCode?: string;
  dtcDescription?: string;
}

interface SamsaraObdiiEntry {
  confirmedDtcs?: SamsaraDtc[] | null;
  pendingDtcs?: SamsaraDtc[] | null;
  permanentDtcs?: SamsaraDtc[] | null;
}

interface SamsaraJ1939Dtc {
  spnId?: number;
  fmiId?: number;
  spnDescription?: string;
  fmiText?: string;
}

interface SamsaraFaultCodes {
  time?: string;
  obdii?: {
    checkEngineLightIsOn?: boolean;
    diagnosticTroubleCodes?: SamsaraObdiiEntry[] | null;
  };
  j1939?: {
    checkEngineLights?: {
      emissionsIsOn?: boolean;
      protectIsOn?: boolean;
      stopIsOn?: boolean;
      warningIsOn?: boolean;
    };
    diagnosticTroubleCodes?: SamsaraJ1939Dtc[] | null;
  };
}

/** One vehicle row from /fleet/vehicles/stats; any stat may be absent. */
export interface SamsaraVehicleStats {
  id: string;
  name?: string;
  engineState?: TimedValue<string>;
  fuelPercent?: TimedValue<number>;
  batteryMilliVolts?: TimedValue<number>;
  engineCoolantTemperatureMilliC?: TimedValue<number>;
  defLevelMilliPercent?: TimedValue<number>;
  tirePressure?: TimedValue<{
    frontLeftTirePressureKPa?: number;
    frontRightTirePressureKPa?: number;
    backLeftTirePressureKPa?: number;
    backRightTirePressureKPa?: number;
  }>;
  faultCodes?: SamsaraFaultCodes;
  gps?: {
    time?: string;
    latitude?: number;
    longitude?: number;
    headingDegrees?: number;
    speedMilesPerHour?: number;
    reverseGeo?: { formattedLocation?: string };
  };
}

export type NormalizedTelematics = Omit<
  VehicleTelematicsSnapshot,
  "vehicleId" | "samsaraVehicleId" | "fetchedAt"
>;

// ── Normalisation ────────────────────────────────────────────────────────────

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function engineState(v: string | undefined): EngineState | null {
  return v === "Off" || v === "On" || v === "Idle" ? v : null;
}

function dtcsFrom(list: SamsaraDtc[] | null | undefined, status: FaultCodeStatus): TelematicsFaultCode[] {
  return (list ?? [])
    .filter((d) => d.dtcShortCode)
    .map((d) => ({
      code: d.dtcShortCode as string,
      description: d.dtcDescription ?? null,
      status,
      source: "obdii" as const,
    }));
}

export function normalizeFaultCodes(fc: SamsaraFaultCodes | undefined): {
  checkEngineLight: boolean | null;
  faultCodes: TelematicsFaultCode[];
} {
  if (!fc) return { checkEngineLight: null, faultCodes: [] };

  const found: TelematicsFaultCode[] = [];
  // Several ECUs (txId) each report their own list; the same code can repeat.
  for (const entry of fc.obdii?.diagnosticTroubleCodes ?? []) {
    found.push(
      ...dtcsFrom(entry.confirmedDtcs, "confirmed"),
      ...dtcsFrom(entry.pendingDtcs, "pending"),
      ...dtcsFrom(entry.permanentDtcs, "permanent"),
    );
  }
  for (const d of fc.j1939?.diagnosticTroubleCodes ?? []) {
    if (d.spnId == null) continue;
    found.push({
      code: d.fmiId != null ? `SPN ${d.spnId} / FMI ${d.fmiId}` : `SPN ${d.spnId}`,
      description: [d.spnDescription, d.fmiText].filter(Boolean).join(" — ") || null,
      status: "confirmed",
      source: "j1939",
    });
  }

  const seen = new Set<string>();
  const faultCodes = found.filter((f) => {
    const key = `${f.source}:${f.code}:${f.status}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const lights = fc.j1939?.checkEngineLights;
  const j1939On = !!lights && (lights.emissionsIsOn || lights.protectIsOn || lights.stopIsOn || lights.warningIsOn);
  const obdiiOn = fc.obdii?.checkEngineLightIsOn;
  const reported = obdiiOn !== undefined || lights !== undefined;
  return {
    checkEngineLight: reported ? !!obdiiOn || !!j1939On : null,
    faultCodes,
  };
}

/** Folds the (up to 3) per-group stats rows for one vehicle into one snapshot. */
export function normalizeVehicleStats(rows: SamsaraVehicleStats[]): NormalizedTelematics {
  const merged: SamsaraVehicleStats = { id: rows[0]?.id ?? "" };
  for (const r of rows) Object.assign(merged, r);

  const tires = merged.tirePressure?.value;
  const times: Record<string, string> = {};
  const stamp = (key: string, t: string | undefined) => {
    if (t) times[key] = t;
  };
  stamp("engineState", merged.engineState?.time);
  stamp("fuelPercent", merged.fuelPercent?.time);
  stamp("batteryMilliVolts", merged.batteryMilliVolts?.time);
  stamp("coolantMilliC", merged.engineCoolantTemperatureMilliC?.time);
  stamp("defMilliPercent", merged.defLevelMilliPercent?.time);
  stamp("tirePressure", merged.tirePressure?.time);
  stamp("faultCodes", merged.faultCodes?.time);
  stamp("gps", merged.gps?.time);

  const faults = normalizeFaultCodes(merged.faultCodes);
  return {
    engineState: engineState(merged.engineState?.value),
    fuelPercent: num(merged.fuelPercent?.value),
    batteryMilliVolts: num(merged.batteryMilliVolts?.value),
    coolantMilliC: num(merged.engineCoolantTemperatureMilliC?.value),
    defMilliPercent: num(merged.defLevelMilliPercent?.value),
    tireFrontLeftKpa: num(tires?.frontLeftTirePressureKPa),
    tireFrontRightKpa: num(tires?.frontRightTirePressureKPa),
    tireBackLeftKpa: num(tires?.backLeftTirePressureKPa),
    tireBackRightKpa: num(tires?.backRightTirePressureKPa),
    latitude: num(merged.gps?.latitude),
    longitude: num(merged.gps?.longitude),
    address: merged.gps?.reverseGeo?.formattedLocation?.trim() || null,
    speedMph: num(merged.gps?.speedMilesPerHour),
    headingDegrees: num(merged.gps?.headingDegrees),
    checkEngineLight: faults.checkEngineLight,
    faultCodes: faults.faultCodes,
    statTimes: times,
  };
}

// ── Samsara HTTP ─────────────────────────────────────────────────────────────

export class SamsaraApiError extends Error {
  constructor(message: string, readonly httpStatus: number) {
    super(message);
    this.name = "SamsaraApiError";
  }
}

async function samsaraGet(apiKey: string, path: string, query: Record<string, string>): Promise<unknown> {
  const url = `${SAMSARA_BASE_URL}${path}?${new URLSearchParams(query).toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new SamsaraApiError(`Samsara API ${res.status}`, res.status);
  return res.json();
}

/** Samsara vehicle id for an Equipt vehicle matched by exact name, or null. */
export async function findSamsaraVehicleIdByName(apiKey: string, name: string): Promise<string | null> {
  const wanted = name.trim().toLowerCase();
  let after: string | null = null;
  do {
    const body = (await samsaraGet(apiKey, "/fleet/vehicles", {
      limit: "512",
      ...(after ? { after } : {}),
    })) as {
      data?: { id: string; name?: string }[];
      pagination?: { hasNextPage?: boolean; endCursor?: string };
    };
    const hit = (body.data ?? []).find((v) => (v.name ?? "").trim().toLowerCase() === wanted);
    if (hit) return hit.id;
    after = body.pagination?.hasNextPage ? (body.pagination.endCursor ?? null) : null;
  } while (after);
  return null;
}

/** Latest stats for one Samsara vehicle (3 parallel requests — the per-call type cap). */
export async function fetchVehicleTelematics(apiKey: string, samsaraVehicleId: string): Promise<NormalizedTelematics> {
  const pages = await Promise.all(
    STAT_TYPE_GROUPS.map(async (types) => {
      const body = (await samsaraGet(apiKey, "/fleet/vehicles/stats", {
        types,
        vehicleIds: samsaraVehicleId,
      })) as { data?: SamsaraVehicleStats[] };
      return body.data ?? [];
    }),
  );
  return normalizeVehicleStats(pages.flat());
}

// ── DB row <-> snapshot ──────────────────────────────────────────────────────

/** Row shape of vehicle_telematics_snapshots (not in the generated types until the next gen). */
export interface TelematicsRow {
  vehicle_id: string;
  samsara_vehicle_id: string | null;
  engine_state: string | null;
  fuel_percent: number | string | null;
  battery_milli_volts: number | null;
  coolant_milli_c: number | null;
  def_milli_percent: number | null;
  tire_front_left_kpa: number | null;
  tire_front_right_kpa: number | null;
  tire_back_left_kpa: number | null;
  tire_back_right_kpa: number | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  speed_mph: number | string | null;
  heading_degrees: number | null;
  check_engine_light: boolean | null;
  fault_codes: Json | null;
  stat_times: Record<string, string> | null;
  fetched_at: string;
}

export function mapTelematicsRow(r: TelematicsRow): VehicleTelematicsSnapshot {
  return {
    vehicleId: r.vehicle_id,
    samsaraVehicleId: r.samsara_vehicle_id,
    engineState: engineState(r.engine_state ?? undefined),
    // numeric(5,2) comes back from PostgREST as a number, but tolerate a string.
    fuelPercent: r.fuel_percent == null ? null : Number(r.fuel_percent),
    batteryMilliVolts: r.battery_milli_volts,
    coolantMilliC: r.coolant_milli_c,
    defMilliPercent: r.def_milli_percent,
    tireFrontLeftKpa: r.tire_front_left_kpa,
    tireFrontRightKpa: r.tire_front_right_kpa,
    tireBackLeftKpa: r.tire_back_left_kpa,
    tireBackRightKpa: r.tire_back_right_kpa,
    latitude: r.latitude,
    longitude: r.longitude,
    address: r.address,
    speedMph: r.speed_mph == null ? null : Number(r.speed_mph),
    headingDegrees: r.heading_degrees,
    checkEngineLight: r.check_engine_light,
    faultCodes: Array.isArray(r.fault_codes) ? (r.fault_codes as unknown as TelematicsFaultCode[]) : [],
    statTimes: r.stat_times ?? {},
    fetchedAt: r.fetched_at,
  };
}

export function snapshotToRow(
  orgId: string,
  vehicleId: string,
  samsaraVehicleId: string,
  userId: string,
  t: NormalizedTelematics,
  fetchedAt: string,
) {
  return {
    org_id: orgId,
    vehicle_id: vehicleId,
    samsara_vehicle_id: samsaraVehicleId,
    engine_state: t.engineState,
    fuel_percent: t.fuelPercent,
    battery_milli_volts: t.batteryMilliVolts,
    coolant_milli_c: t.coolantMilliC,
    def_milli_percent: t.defMilliPercent,
    tire_front_left_kpa: t.tireFrontLeftKpa,
    tire_front_right_kpa: t.tireFrontRightKpa,
    tire_back_left_kpa: t.tireBackLeftKpa,
    tire_back_right_kpa: t.tireBackRightKpa,
    latitude: t.latitude,
    longitude: t.longitude,
    address: t.address,
    speed_mph: t.speedMph,
    heading_degrees: t.headingDegrees,
    check_engine_light: t.checkEngineLight,
    // Plain data (strings/booleans) — the interface type just lacks an index signature for Json.
    fault_codes: t.faultCodes as unknown as Json,
    stat_times: t.statTimes,
    fetched_at: fetchedAt,
    created_by: userId,
    deleted_at: null,
  };
}
