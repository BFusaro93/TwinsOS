import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { createOrgCanceledResolver } from "@/lib/orgs/org-canceled";
import { logger } from "@/lib/logger";
import { fetchFleetFuelBattery, historyHour, historyRow, normalizeVehicleStats } from "@/lib/samsara/telematics";

const log = logger.child("telematics-history cron");

/**
 * GET /api/cron/telematics-history — called hourly by Vercel Cron.
 *
 * Records one fuel / battery / engine-state sample per vehicle for every org
 * with Samsara switched on, for the Telematics tab's history chart. One
 * Samsara call set per org (all vehicles at once), not per vehicle. Samples are
 * keyed to the hour, and the insert ignores duplicates, so a re-run or the
 * tab's own refresh in the same hour never doubles a row.
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
    .select("org_id, api_key")
    .eq("provider", "samsara")
    .eq("enabled", true)
    .not("api_key", "is", null)
    .neq("api_key", "");
  if (error) {
    log.error("could not load Samsara integrations", { error });
    return NextResponse.json({ error: "Could not load integrations" }, { status: 500 });
  }

  const recordedAt = historyHour();
  const orgCanceled = createOrgCanceledResolver(admin);
  const results: { orgId: string; recorded: number; error?: string }[] = [];

  for (const integration of integrations ?? []) {
    const orgId = integration.org_id as string;
    // Canceled / expired-trial orgs get no background work.
    if (await orgCanceled(orgId)) continue;
    try {
      const stats = await fetchFleetFuelBattery(integration.api_key as string);
      const { data: vehicles } = await admin
        .from("vehicles")
        .select("id, name, samsara_vehicle_id")
        .eq("org_id", orgId)
        .is("deleted_at", null);

      // Same matching rule as the odometer sync: explicit Samsara id first, then exact name.
      const rows = [];
      for (const sv of stats) {
        const vehicle =
          (vehicles ?? []).find((v) => v.samsara_vehicle_id && v.samsara_vehicle_id === sv.id) ??
          (vehicles ?? []).find(
            (v) => !v.samsara_vehicle_id && v.name.trim().toLowerCase() === (sv.name ?? "").trim().toLowerCase(),
          );
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
      results.push({ orgId, recorded: rows.length });
    } catch (err) {
      // One org's Samsara outage or bad key must not stop the others.
      log.warn("history sample failed", { orgId, err });
      results.push({ orgId, recorded: 0, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ recordedAt, results });
}
