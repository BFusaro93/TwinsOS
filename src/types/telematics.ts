/**
 * Vehicle telematics (Samsara) — shapes shared by the refresh route, the
 * react-query hook and the Telematics tab. Values are kept in Samsara's native
 * units (kPa, millidegrees C, millivolts, milli-percent); the UI converts.
 * `null` means "this vehicle does not report that stat".
 */

export type EngineState = "Off" | "On" | "Idle";

export type FaultCodeStatus = "confirmed" | "pending" | "permanent";

export interface TelematicsFaultCode {
  /** e.g. "P0457" (OBD-II) or "SPN 3031 / FMI 1" (J1939). */
  code: string;
  description: string | null;
  status: FaultCodeStatus;
  source: "obdii" | "j1939";
}

export interface VehicleTelematicsSnapshot {
  vehicleId: string;
  samsaraVehicleId: string | null;
  engineState: EngineState | null;
  fuelPercent: number | null;
  batteryMilliVolts: number | null;
  coolantMilliC: number | null;
  defMilliPercent: number | null;
  tireFrontLeftKpa: number | null;
  tireFrontRightKpa: number | null;
  tireBackLeftKpa: number | null;
  tireBackRightKpa: number | null;
  latitude: number | null;
  longitude: number | null;
  /** Samsara's reverse-geocoded street address. */
  address: string | null;
  speedMph: number | null;
  headingDegrees: number | null;
  checkEngineLight: boolean | null;
  faultCodes: TelematicsFaultCode[];
  /** ISO time Samsara measured each stat, keyed by stat name. */
  statTimes: Record<string, string>;
  /** ISO time we last pulled from Samsara. */
  fetchedAt: string;
}

/**
 * What the refresh route returns. `snapshot` is present only for "ok";
 * the other statuses are normal states the tab explains, not errors.
 */
export type TelematicsRefreshResult =
  | { status: "ok"; snapshot: VehicleTelematicsSnapshot }
  | { status: "not_configured" }
  | { status: "not_linked" };
