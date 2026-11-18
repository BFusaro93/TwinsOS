import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerClient, createServiceClient } from "@/lib/supabase/server";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";
import { assertOrgWritable } from "@/lib/org-writable";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { logger } from "@/lib/logger";
import type { AdminClient } from "@/lib/automations/cmms-automation-actions";
import { hasFaultBaseline, syncVehicleFaultEvents } from "@/lib/samsara/fault-events";
import {
  SamsaraApiError,
  fetchVehicleTelematics,
  historyHour,
  historyRow,
  findSamsaraVehicleIdByName,
  mapTelematicsRow,
  snapshotToRow,
  type TelematicsRow,
} from "@/lib/samsara/telematics";
import type { TelematicsRefreshResult } from "@/types/telematics";

const log = logger.child("vehicle-telematics");

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * POST /api/vehicles/[id]/telematics
 *
 * Pulls the vehicle's latest Samsara stats (gauges, tire pressure, DEF, fault
 * codes) and stores them in vehicle_telematics_snapshots. Called when the
 * Telematics tab opens and from its Refresh button.
 *
 * Any signed-in member who can see the vehicle may refresh it: the org's
 * Samsara API key is admin-only readable, so it is read with the service role
 * here and never leaves the server. The org always comes from the session.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const parsed = paramsSchema.safeParse(await ctx.params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid vehicle id" }, { status: 400 });
  const vehicleId = parsed.data.id;

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = await getEffectiveOrgId(supabase);
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 403 });

  // Opening the tab calls Samsara, so cap it per user (the endpoint allows 50 req/s per org).
  if (!(await checkAuthRateLimit(`vehicle-telematics:${user.id}`, 30, 60))) {
    return NextResponse.json({ error: "Too many refreshes — try again in a minute" }, { status: 429 });
  }

  // RLS scopes this to the caller's org, so a vehicle id from another tenant is simply "not found".
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, name, samsara_vehicle_id")
    .eq("id", vehicleId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!vehicle) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });

  const admin = createServiceClient();
  const writable = await assertOrgWritable(admin, orgId);
  if (writable) return writable;

  const { data: integration } = await admin
    .from("integrations")
    .select("api_key, enabled, config")
    .eq("org_id", orgId)
    .eq("provider", "samsara")
    .maybeSingle();
  const apiKey = (integration?.api_key as string | null | undefined)?.trim();
  if (!integration?.enabled || !apiKey) {
    return NextResponse.json({ status: "not_configured" } satisfies TelematicsRefreshResult);
  }

  try {
    // Same matching rule as the daily odometer sync: explicit Samsara id first, then exact name.
    const linkedId = (vehicle.samsara_vehicle_id as string | null)?.trim() || null;
    const samsaraId = linkedId ?? (await findSamsaraVehicleIdByName(apiKey, vehicle.name as string));
    if (!samsaraId) {
      return NextResponse.json({ status: "not_linked" } satisfies TelematicsRefreshResult);
    }

    const telematics = await fetchVehicleTelematics(apiKey, samsaraId);
    const fetchedAt = new Date().toISOString();

    const { data: saved, error } = await admin
      .from("vehicle_telematics_snapshots")
      .upsert(snapshotToRow(orgId, vehicleId, samsaraId, user.id, telematics, fetchedAt), { onConflict: "vehicle_id" })
      .select("*")
      .single();
    if (error || !saved) {
      log.error("snapshot upsert failed", { error, vehicleId });
      return NextResponse.json({ error: "Could not save telematics" }, { status: 500 });
    }

    // Also feed the history chart (one sample per vehicle per hour; the hourly cron
    // writes the same row, and a duplicate is ignored). Best-effort — never fails the refresh.
    if (telematics.fuelPercent !== null || telematics.batteryMilliVolts !== null) {
      const { error: historyErr } = await admin
        .from("vehicle_telematics_history")
        .upsert(historyRow(orgId, vehicleId, historyHour(), telematics), {
          onConflict: "vehicle_id,recorded_at",
          ignoreDuplicates: true,
        });
      if (historyErr) log.warn("history sample failed", { vehicleId, error: historyErr });
    }

    // Fault codes -> events (-> automations once the org has its baseline). Skipped when
    // Samsara didn't report the stat: absent means unknown, not "no faults".
    if (telematics.statTimes.faultCodes) {
      try {
        await syncVehicleFaultEvents(admin as unknown as AdminClient, {
          orgId,
          vehicle: { id: vehicleId, name: vehicle.name as string },
          faults: telematics.faultCodes,
          checkEngineLight: telematics.checkEngineLight,
          fire: hasFaultBaseline(integration.config),
        });
      } catch (faultErr) {
        log.warn("fault event sync failed", { vehicleId, err: faultErr });
      }
    }

    return NextResponse.json({
      status: "ok",
      snapshot: mapTelematicsRow(saved as unknown as TelematicsRow),
    } satisfies TelematicsRefreshResult);
  } catch (err) {
    if (err instanceof SamsaraApiError) {
      log.warn("samsara request failed", { vehicleId, httpStatus: err.httpStatus });
      const message =
        err.httpStatus === 401 || err.httpStatus === 403
          ? "Samsara rejected the API key — check it in Settings → Integrations."
          : err.httpStatus === 429
            ? "Samsara is rate limiting requests — try again in a moment."
            : "Samsara could not be reached.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
    log.error("telematics refresh failed", { err, vehicleId });
    return NextResponse.json({ error: "Telematics refresh failed" }, { status: 500 });
  }
}
