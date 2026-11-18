import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { createOrgCanceledResolver } from "@/lib/orgs/org-canceled";
import { logger } from "@/lib/logger";
import type { AdminClient } from "@/lib/automations/cmms-automation-actions";
import {
  fetchFleetFaultCodes,
  fetchFleetFuelBattery,
  historyHour,
  historyRow,
  normalizeVehicleStats,
  type SamsaraVehicleStats,
} from "@/lib/samsara/telematics";
import { FAULT_BASELINE_KEY, hasFaultBaseline, syncVehicleFaultEvents } from "@/lib/samsara/fault-events";

const log = logger.child("telematics-history cron");

/**
 * GET /api/cron/telematics-history — called hourly by Vercel Cron.
 *
 * For every org with Samsara switched on:
 *  1. records one fuel / battery / engine-state sample per vehicle (the Telematics
 *     tab's history chart). Samples are keyed to the hour and the insert ignores
 *     duplicates, so a re-run or the tab's own refresh never doubles a row.
 *  2. reconciles fault codes with vehicle_fault_events and fires the org's
 *     "vehicle fault code" automations for codes that just appeared. The org's
 *     FIRST sweep is a silent baseline, so faults that already exist when this
 *     goes live don't raise a burst of work orders.
 * One Samsara call set per org (all vehicles at once), not per vehicle.
 *
 * Security: Vercel passes Authorization: Bearer {CRON_SECRET}.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceClient();
  const { data: integrations, error } = await admin
    .from("integrations")
    .select("org_id, api_key, config")
    .eq("provider", "samsara")
    .eq("enabled", true)
    .not("api_key", "is", null)
    .neq("api_key", "");
  if (error) {
    log.error("could not load Samsara integrations", { error });
    return NextResponse.json({ error: "Could not load integrations" }, { status: 500 });
  }

  const recordedAt = historyHour();
  // Telematics (history + fault-code work orders) is Equipt's: an org whose plan lacks
  // Equipt (Landscapt-only) is paused like a canceled one, same as the automations poll.
  const orgCanceled = createOrgCanceledResolver(admin, { requireModule: "equipt" });
  const results: { orgId: string; recorded: number; faultsOpened?: number; error?: string }[] = [];

  for (const integration of integrations ?? []) {
    const orgId = integration.org_id as string;
    // Canceled / expired-trial orgs, and orgs without Equipt, get no background work.
    if (await orgCanceled(orgId)) continue;
    try {
      const apiKey = integration.api_key as string;
      const stats = await fetchFleetFuelBattery(apiKey);
      const { data: vehicles } = await admin
        .from("vehicles")
        .select("id, name, samsara_vehicle_id")
        .eq("org_id", orgId)
        .is("deleted_at", null);

      // Same matching rule as the odometer sync: explicit Samsara id first, then exact name.
      const matchVehicle = (sv: SamsaraVehicleStats) =>
        (vehicles ?? []).find((v) => v.samsara_vehicle_id && v.samsara_vehicle_id === sv.id) ??
        (vehicles ?? []).find(
          (v) => !v.samsara_vehicle_id && v.name.trim().toLowerCase() === (sv.name ?? "").trim().toLowerCase(),
        );

      const rows = [];
      for (const sv of stats) {
        const vehicle = matchVehicle(sv);
        if (!vehicle) continue;
        const t = normalizeVehicleStats([sv]);
        if (t.fuelPercent === null && t.batteryMilliVolts === null) continue;
        rows.push(historyRow(orgId, vehicle.id, recordedAt, t));
      }

      if (rows.length > 0) {
        const { error: insertErr } = await admin
          .from("vehicle_telematics_history")
          .upsert(rows, { onConflict: "vehicle_id,recorded_at", ignoreDuplicates: true });
        if (insertErr) throw new Error(insertErr.message);
      }

      // Fault codes -> events -> automations. A failure here must not lose the history rows above.
      let faultsOpened = 0;
      try {
        const baseline = hasFaultBaseline(integration.config);
        const faultStats = await fetchFleetFaultCodes(apiKey);
        for (const sv of faultStats) {
          const vehicle = matchVehicle(sv);
          // No faultCodes stat = unknown, not "no faults" — leave that vehicle's events alone.
          if (!vehicle || !sv.faultCodes) continue;
          const t = normalizeVehicleStats([sv]);
          const { opened } = await syncVehicleFaultEvents(admin as unknown as AdminClient, {
            orgId,
            vehicle: { id: vehicle.id, name: vehicle.name },
            faults: t.faultCodes,
            checkEngineLight: t.checkEngineLight,
            fire: baseline,
          });
          faultsOpened += opened;
        }
        if (!baseline) {
          await admin
            .from("integrations")
            .update({ config: { ...((integration.config as Record<string, unknown> | null) ?? {}), [FAULT_BASELINE_KEY]: new Date().toISOString() } })
            .eq("org_id", orgId)
            .eq("provider", "samsara");
        }
      } catch (faultErr) {
        log.warn("fault sweep failed", { orgId, err: faultErr });
      }
      results.push({ orgId, recorded: rows.length, faultsOpened });
    } catch (err) {
      // One org's Samsara outage or bad key must not stop the others.
      log.warn("history sample failed", { orgId, err });
      results.push({ orgId, recorded: 0, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ recordedAt, results });
}
