import { NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = ReturnType<typeof import("@supabase/supabase-js").createClient<any>>;
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createOrgCanceledResolver } from "@/lib/orgs/org-canceled";

const SAMSARA_STATS_URL =
  "https://api.samsara.com/fleet/vehicles/stats?types=obdOdometerMeters,gpsDistanceMeters";

interface SamsaraVehicleStat {
  id: string;
  name: string;
  obdOdometerMeters?: { value: number };
  gpsDistanceMeters?: { value: number };
}

/**
 * GET  /api/integrations/samsara/sync  — called by Vercel Cron (GET only)
 * POST /api/integrations/samsara/sync  — called by the Settings UI manual trigger
 *
 * Auth:
 *  Cron  — Vercel passes Authorization: Bearer {CRON_SECRET} automatically.
 *  Manual — authenticated admin session cookie (no cron secret needed).
 */
export async function GET(request: Request) {
  return handleSync(request);
}

export async function POST(request: Request) {
  return handleSync(request);
}

async function handleSync(request: Request) {
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

  const orgCanceled = createOrgCanceledResolver(adminClient);
  for (const integration of integrations) {
    // Canceled orgs get no background sync (cron or manual), same as the other cron routes.
    if (await orgCanceled(integration.org_id as string)) continue;
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

  // 1. Fetch Samsara vehicle stats — follow pagination cursors until exhausted.
  let samsaraVehicles: SamsaraVehicleStat[] = [];
  try {
    let cursor: string | null = null;
    do {
      const pageUrl: string = cursor
        ? `${SAMSARA_STATS_URL}&after=${encodeURIComponent(cursor)}`
        : SAMSARA_STATS_URL;
      const pageRes: Response = await fetch(pageUrl, {
        headers: { Authorization: `Bearer ${samsaraApiKey}`, Accept: "application/json" },
      });
      if (!pageRes.ok) throw new Error(`Samsara API ${pageRes.status}: ${pageRes.statusText}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pageBody: any = await pageRes.json();
      samsaraVehicles = samsaraVehicles.concat(pageBody.data ?? []);
      cursor = pageBody.pagination?.hasNextPage ? (pageBody.pagination.endCursor ?? null) : null;
    } while (cursor);
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
    const source = obd !== undefined ? "OBD" : "GPS";

    // Match Samsara vehicle → Equipt vehicle (by samsara_vehicle_id first, then name).
    // An explicit samsara_vehicle_id link must win over a name match; a single
    // find() with an OR returned whichever vehicle came first in the list.
    const dbVehicle =
      (dbVehicles ?? []).find((v) => v.samsara_vehicle_id && v.samsara_vehicle_id === sv.id) ??
      (dbVehicles ?? []).find(
        (v) => !v.samsara_vehicle_id && v.name.trim().toLowerCase() === (sv.name ?? "").trim().toLowerCase()
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
      // Reconciling a Samsara reading with meters.current_value:
      //   * Every Samsara reading is recorded as a meter_readings row (equal
      //     values too, so there is a daily record even with no movement).
      //   * last_reading_at is always refreshed, so the meter never looks
      //     stale while sync is healthy.
      //   * current_value moves when the reading is higher (normal case), OR
      //     when the reading is LOWER but the meter's latest reading is a
      //     manual entry: telematics is the source of truth, and one fat-
      //     fingered high manual value used to block this meter's sync
      //     forever (every later reading looked like the odometer going
      //     backwards). A lower reading after a Samsara reading is a
      //     telematics glitch — odometers never decrease — so it is kept in
      //     the history, flagged in the note, and does not lower the value.
      const currentValue = meter.current_value ?? 0;
      const wentBackwards = miles < currentValue;
      let overridesManual = false;
      if (wentBackwards) {
        const { data: latest } = await adminClient
          .from("meter_readings")
          .select("source")
          .eq("meter_id", meter.id)
          .is("deleted_at", null)
          .order("reading_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        overridesManual = latest?.source === "manual";
      }

      const readingAt = new Date().toISOString();

      const { error: readingErr } = await adminClient.from("meter_readings").insert({
        org_id: orgId,
        meter_id: meter.id,
        value: miles,
        reading_at: readingAt,
        source: "samsara",
        recorded_by_name: `Samsara (${source})`,
        notes:
          wentBackwards && !overridesManual
            ? `Below the meter's current value (${currentValue} mi) — current value not changed`
            : wentBackwards
              ? `Replaces a higher manual value (${currentValue} mi) with the telematics reading`
              : null,
      });

      if (readingErr) {
        detail.push(`Failed to insert reading for "${dbVehicle.name}": ${readingErr.message}`);
        errors++;
        continue;
      }

      // Each write is conditioned on the DB row's CURRENT value (not the
      // in-memory snapshot fetched at the top of this sync) so a concurrent
      // sync run (Vercel Cron and a manual admin POST can overlap) can't
      // clobber a newer value based on a stale read.
      if (miles > currentValue) {
        await adminClient
          .from("meters")
          .update({ current_value: miles, last_reading_at: readingAt })
          .eq("id", meter.id)
          .lt("current_value", miles);
      } else if (wentBackwards && overridesManual) {
        await adminClient
          .from("meters")
          .update({ current_value: miles, last_reading_at: readingAt })
          .eq("id", meter.id)
          .eq("current_value", currentValue);
      } else {
        // Equal (or an ignored glitch): value untouched, freshness refreshed.
        await adminClient
          .from("meters")
          .update({ last_reading_at: readingAt })
          .eq("id", meter.id);
      }

      readings++;
      detail.push(`✓ "${dbVehicle.name}" → ${miles} mi (${source})${wentBackwards ? (overridesManual ? " — replaced a higher manual value" : " — below current value, value kept") : ""}`);
    }
  }

  return { fetched: samsaraVehicles.length, matched, readings, errors, detail };
}
