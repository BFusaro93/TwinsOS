import { NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = ReturnType<typeof import("@supabase/supabase-js").createClient<any>>;
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const SAMSARA_STATS_URL =
  "https://api.samsara.com/fleet/vehicles/stats?types=obdOdometerMeters,gpsDistanceMeters";

interface SamsaraVehicleStat {
  id: string;
  name: string;
  obdOdometerMeters?: { value: number };
  gpsDistanceMeters?: { value: number };
}

/**
 * POST /api/integrations/samsara/sync
 *
 * Two callers:
 *  1. Vercel Cron — passes Authorization: Bearer {CRON_SECRET} (set automatically
 *     by Vercel when CRON_SECRET env var is configured).
 *  2. Settings UI manual trigger — authenticated admin session (no cron secret needed).
 *
 * Returns a JSON summary of vehicles matched and readings written.
 */
export async function POST(request: Request) {
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ── Auth: cron secret OR authenticated admin ──────────────────────────────

  const authHeader = request.headers.get("Authorization") ?? "";
  const isCron =
    process.env.CRON_SECRET &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`;

  let callerOrgId: string | null = null;

  if (!isCron) {
    // Must be an authenticated admin user triggering manually.
    const userClient = await createServerClient();
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: profile } = await userClient
      .from("profiles")
      .select("org_id, role")
      .eq("id", user.id)
      .single();
    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Admin role required" }, { status: 403 });
    }
    callerOrgId = profile.org_id;
  }

  // ── Determine which orgs to sync ──────────────────────────────────────────

  let integrationsQuery = adminClient
    .from("integrations")
    .select("id, org_id, api_key")
    .eq("provider", "samsara")
    .eq("enabled", true)
    .not("api_key", "is", null)
    .neq("api_key", "");

  if (callerOrgId) {
    // Manual trigger — only sync the caller's org.
    integrationsQuery = integrationsQuery.eq("org_id", callerOrgId);
  }

  const { data: integrations, error: integrationsErr } = await integrationsQuery;
  if (integrationsErr) {
    return NextResponse.json({ error: integrationsErr.message }, { status: 500 });
  }
  if (!integrations || integrations.length === 0) {
    return NextResponse.json({ message: "No orgs with Samsara integration configured." });
  }

  const results: Record<string, unknown>[] = [];

  for (const integration of integrations) {
    const orgResult = await syncOrg(adminClient, integration.org_id as string, integration.api_key as string);
    results.push({ orgId: integration.org_id, ...orgResult });

    // Record sync timestamp and status on the integration row.
    await adminClient
      .from("integrations")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: orgResult.errors > 0
          ? (orgResult.matched > 0 ? "partial" : "error")
          : "ok",
      })
      .eq("id", integration.id);
  }

  return NextResponse.json({ synced: results });
}

// ── Core sync logic per org ───────────────────────────────────────────────────

async function syncOrg(
  adminClient: AdminClient,
  orgId: string,
  samsaraApiKey: string,
): Promise<{ fetched: number; matched: number; readings: number; errors: number; detail: string[] }> {
  const detail: string[] = [];
  let errors = 0;

  // 1. Fetch Samsara vehicle stats.
  let samsaraVehicles: SamsaraVehicleStat[] = [];
  try {
    const res = await fetch(SAMSARA_STATS_URL, {
      headers: { Authorization: `Bearer ${samsaraApiKey}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Samsara API ${res.status}: ${res.statusText}`);
    const body = await res.json();
    samsaraVehicles = body.data ?? [];
  } catch (err) {
    return { fetched: 0, matched: 0, readings: 0, errors: 1, detail: [`Samsara fetch failed: ${err}`] };
  }

  // 2. Fetch all Equipt vehicles for this org.
  const { data: dbVehicles } = await adminClient
    .from("vehicles")
    .select("id, name, asset_tag, samsara_vehicle_id")
    .eq("org_id", orgId)
    .is("deleted_at", null);

  // 3. Fetch all meters for this org (unit = 'miles' preferred; fall back to any).
  const { data: meters } = await adminClient
    .from("meters")
    .select("id, asset_id, unit, current_value")
    .eq("org_id", orgId)
    .is("deleted_at", null);

  let matched = 0;
  let readings = 0;

  for (const sv of samsaraVehicles) {
    const obd = sv.obdOdometerMeters?.value;
    const gps = sv.gpsDistanceMeters?.value;
    const meters_value = obd ?? gps ?? null;
    if (meters_value === null) continue;

    const miles = parseFloat((meters_value * 0.000621371).toFixed(2));
    const source = obd ? "OBD" : "GPS";

    // Match Samsara vehicle → Equipt vehicle (by samsara_vehicle_id first, then name).
    const dbVehicle = (dbVehicles ?? []).find(
      (v) =>
        (v.samsara_vehicle_id && v.samsara_vehicle_id === sv.id) ||
        v.name.trim().toLowerCase() === sv.name.trim().toLowerCase()
    );

    if (!dbVehicle) {
      detail.push(`No match for Samsara vehicle "${sv.name}" (${sv.id})`);
      continue;
    }

    matched++;

    // Find all miles meters linked to this vehicle.
    const vehicleMeters = (meters ?? []).filter(
      (m) =>
        m.asset_id === dbVehicle.id &&
        (m.unit?.toLowerCase() === "miles" || m.unit?.toLowerCase() === "mi")
    );

    if (vehicleMeters.length === 0) {
      // Auto-create a miles meter for this vehicle so the user doesn't have to.
      const { data: newMeter, error: meterErr } = await adminClient
        .from("meters")
        .insert({
          org_id: orgId,
          asset_id: dbVehicle.id,
          asset_type: "vehicle",
          name: "Odometer",
          unit: "miles",
          current_value: 0,
        })
        .select("id, asset_id, unit, current_value")
        .single();

      if (meterErr || !newMeter) {
        detail.push(`Vehicle "${dbVehicle.name}" matched but failed to create miles meter: ${meterErr?.message}`);
        errors++;
        continue;
      }

      detail.push(`Vehicle "${dbVehicle.name}" — auto-created Odometer meter`);
      vehicleMeters.push(newMeter);
    }

    for (const meter of vehicleMeters) {
      // Only write if the new reading is greater (odometers don't go backwards).
      if (miles <= (meter.current_value ?? 0)) {
        detail.push(`Vehicle "${dbVehicle.name}" reading ${miles} mi not greater than current ${meter.current_value} mi — skipped`);
        continue;
      }

      const readingAt = new Date().toISOString();

      const { error: readingErr } = await adminClient.from("meter_readings").insert({
        org_id: orgId,
        meter_id: meter.id,
        value: miles,
        reading_at: readingAt,
        source: "samsara",
        recorded_by_name: `Samsara (${source})`,
      });

      if (readingErr) {
        detail.push(`Failed to insert reading for "${dbVehicle.name}": ${readingErr.message}`);
        errors++;
        continue;
      }

      // Update meter current value.
      await adminClient
        .from("meters")
        .update({ current_value: miles, last_reading_at: readingAt })
        .eq("id", meter.id);

      readings++;
      detail.push(`✓ "${dbVehicle.name}" → ${miles} mi (${source})`);
    }
  }

  return { fetched: samsaraVehicles.length, matched, readings, errors, detail };
}
