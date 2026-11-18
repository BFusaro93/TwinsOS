import { fireEventAutomations, type AdminClient } from "@/lib/automations/cmms-automation-actions";
import { logger } from "@/lib/logger";
import type { TelematicsFaultCode } from "@/types/telematics";

const log = logger.child("vehicle-fault-events");

/** Human label for a fault code, e.g. "P0457 — EVAP System Leak Detected (fuel cap loose/off)". */
export function faultLabel(f: Pick<TelematicsFaultCode, "code" | "description">): string {
  return f.description ? `${f.code} — ${f.description}` : f.code;
}

/** Description text for a work order raised from a fault code. */
export function faultDescription(
  vehicleName: string,
  f: Pick<TelematicsFaultCode, "code" | "description" | "status" | "source">,
  checkEngineLight: boolean | null,
): string {
  return [
    `${vehicleName} reported fault code ${faultLabel(f)}.`,
    `Status: ${f.status}. Check-engine light: ${checkEngineLight === null ? "not reported" : checkEngineLight ? "ON" : "off"}.`,
    "Reported by Samsara telematics.",
  ].join("\n");
}

/**
 * Pending codes flicker on and off while the ECU decides whether a fault is real,
 * so only confirmed / permanent codes open an event (and can raise work).
 */
function isActionable(f: TelematicsFaultCode): boolean {
  return f.status === "confirmed" || f.status === "permanent";
}

/**
 * Reconciles a vehicle's currently reported fault codes with its open
 * vehicle_fault_events: opens an event for each code that just appeared, clears
 * those that stopped being reported, and — when `fire` is true — fires the org's
 * vehicle_fault_code automations once per newly opened code.
 *
 * `fire` is false for the first sweep of an org (the baseline): faults that
 * already exist when the feature is switched on must not raise a burst of work
 * orders. Callers must only pass faults when Samsara actually reported the
 * faultCodes stat — an absent stat means "unknown", not "no faults".
 */
export async function syncVehicleFaultEvents(
  admin: AdminClient,
  params: {
    orgId: string;
    vehicle: { id: string; name: string };
    faults: TelematicsFaultCode[];
    checkEngineLight: boolean | null;
    fire: boolean;
  },
): Promise<{ opened: number; cleared: number }> {
  const { orgId, vehicle, checkEngineLight, fire } = params;
  const current = params.faults.filter(isActionable);
  const key = (source: string, code: string) => `${source}:${code}`;
  const currentKeys = new Set(current.map((f) => key(f.source, f.code)));

  const { data: open, error: openErr } = await admin
    .from("vehicle_fault_events")
    .select("id, source, code")
    .eq("org_id", orgId)
    .eq("vehicle_id", vehicle.id)
    .is("cleared_at", null)
    .is("deleted_at", null);
  if (openErr) {
    log.error("could not load open fault events", { error: openErr, vehicleId: vehicle.id });
    return { opened: 0, cleared: 0 };
  }
  const openRows = (open ?? []) as { id: string; source: string; code: string }[];
  const openKeys = new Set(openRows.map((r) => key(r.source, r.code)));

  // Codes that stopped being reported.
  const gone = openRows.filter((r) => !currentKeys.has(key(r.source, r.code)));
  if (gone.length > 0) {
    const { error } = await admin
      .from("vehicle_fault_events")
      .update({ cleared_at: new Date().toISOString() })
      .in("id", gone.map((r) => r.id));
    if (error) log.warn("could not clear fault events", { error, vehicleId: vehicle.id });
  }

  // Codes that just appeared.
  let opened = 0;
  for (const f of current.filter((c) => !openKeys.has(key(c.source, c.code)))) {
    const { data: event, error } = await admin
      .from("vehicle_fault_events")
      .insert({
        org_id: orgId,
        vehicle_id: vehicle.id,
        source: f.source,
        code: f.code,
        description: f.description,
        status: f.status,
        check_engine_light: checkEngineLight,
      })
      .select("id")
      .single();
    // 23505 = another run (cron vs. a tab refresh) opened it first — that run fires the rules.
    if (error || !event) {
      if (error?.code !== "23505") log.warn("could not open fault event", { error, vehicleId: vehicle.id, code: f.code });
      continue;
    }
    opened++;
    if (!fire) continue;

    try {
      const result = await fireEventAutomations(admin, {
        orgId,
        eventTrigger: "vehicle_fault_code",
        assetId: vehicle.id,
        assetName: vehicle.name,
        linkedEntityType: "vehicle",
        detail: {
          title: faultLabel(f),
          description: faultDescription(vehicle.name, f, checkEngineLight),
          checkEngineLight,
        },
      });
      // Remember the work order a rule raised so the Fault Codes card can link to it.
      for (const r of result.fired) {
        const { data: wo } = await admin
          .from("work_orders")
          .select("id")
          .eq("org_id", orgId)
          .eq("work_order_number", r.result)
          .maybeSingle();
        if (wo) {
          await admin.from("vehicle_fault_events").update({ work_order_id: wo.id }).eq("id", event.id);
          break;
        }
      }
    } catch (err) {
      // A failing rule must not stop the sweep (or the tab refresh).
      log.warn("fault automations failed", { err, vehicleId: vehicle.id, code: f.code });
    }
  }
  return { opened, cleared: gone.length };
}

/** Org-level switch: has the first (silent) sweep happened yet? Stored in integrations.config. */
export const FAULT_BASELINE_KEY = "fault_events_baseline_at";

export function hasFaultBaseline(config: unknown): boolean {
  return typeof (config as Record<string, unknown> | null)?.[FAULT_BASELINE_KEY] === "string";
}
