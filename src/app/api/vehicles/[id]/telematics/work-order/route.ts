import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerClient, createServiceClient } from "@/lib/supabase/server";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";
import { logger } from "@/lib/logger";
import { faultDescription, faultLabel } from "@/lib/samsara/fault-events";
import type { TelematicsFaultCode } from "@/types/telematics";

const log = logger.child("vehicle-fault-work-order");

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  source: z.enum(["obdii", "j1939"]),
  code: z.string().min(1).max(64),
});

/**
 * POST /api/vehicles/[id]/telematics/work-order
 *
 * Raises a work order for one of the vehicle's current fault codes (the Fault
 * Codes card's "Create work order" button). The work order is inserted with the
 * CALLER's session, not the service role, so the same role rules and RLS as
 * creating one by hand apply (a viewer can't, a canceled org is read-only). The
 * fault must be in the vehicle's latest Samsara snapshot; the client can't make
 * up a code. If an open work order is already linked to this fault occurrence,
 * that one is returned instead of making a duplicate.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = paramsSchema.safeParse(await ctx.params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const vehicleId = params.data.id;
  const { source, code } = body.data;

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = await getEffectiveOrgId(supabase);
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 403 });

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, name")
    .eq("id", vehicleId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!vehicle) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });

  // The fault must really be on the vehicle right now.
  const { data: snapshot } = await supabase
    .from("vehicle_telematics_snapshots")
    .select("fault_codes, check_engine_light")
    .eq("vehicle_id", vehicleId)
    .is("deleted_at", null)
    .maybeSingle();
  const faults = Array.isArray(snapshot?.fault_codes) ? (snapshot.fault_codes as unknown as TelematicsFaultCode[]) : [];
  const fault = faults.find((f) => f.source === source && f.code === code);
  if (!fault) return NextResponse.json({ error: "That fault code isn't active on this vehicle" }, { status: 404 });
  const checkEngineLight = snapshot?.check_engine_light ?? null;
  // Pending codes flicker while the ECU decides whether the fault is real and have no fault event to
  // link a work order to, so a second click would raise a duplicate. Only confirmed / permanent codes raise work.
  if (fault.status === "pending") {
    return NextResponse.json({ error: "This code is still pending. A work order can be raised once the vehicle confirms it." }, { status: 409 });
  }

  // The open occurrence of this code (if the sweep has recorded it) and any work order already raised for it.
  const { data: event } = await supabase
    .from("vehicle_fault_events")
    .select("id, work_order_id")
    .eq("vehicle_id", vehicleId)
    .eq("source", source)
    .eq("code", code)
    .is("cleared_at", null)
    .is("deleted_at", null)
    .maybeSingle();
  if (event?.work_order_id) {
    const { data: existing } = await supabase
      .from("work_orders")
      .select("id, work_order_number, status")
      .eq("id", event.work_order_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing && existing.status !== "done" && existing.status !== "skipped") {
      return NextResponse.json({ status: "exists", workOrder: { id: existing.id, number: existing.work_order_number } });
    }
  }

  const { data: woNumber, error: numErr } = await supabase.rpc("next_work_order_number");
  if (numErr || !woNumber) {
    log.error("could not allocate WO number", { error: numErr });
    return NextResponse.json({ error: "Could not create the work order" }, { status: 500 });
  }

  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .insert({
      created_by: user.id,
      title: `${vehicle.name}: ${faultLabel(fault)}`,
      description: faultDescription(vehicle.name, fault, checkEngineLight),
      status: "open",
      priority: checkEngineLight ? "high" : "medium",
      wo_type: "reactive",
      asset_id: vehicle.id,
      asset_name: vehicle.name,
      linked_entity_type: "vehicle",
      work_order_number: woNumber as string,
      is_recurring: false,
    })
    .select("id, work_order_number")
    .single();
  if (woErr || !wo) {
    // 42501 = RLS refused: a viewer / limited role, or a read-only (canceled) org.
    if (woErr?.code === "42501") {
      return NextResponse.json({ error: "You don't have permission to create work orders" }, { status: 403 });
    }
    log.error("work order insert failed", { error: woErr, vehicleId });
    return NextResponse.json({ error: "Could not create the work order" }, { status: 500 });
  }

  // Remember which work order answers this fault (events are written by the service role only).
  if (event) {
    const admin = createServiceClient();
    const { error: linkErr } = await admin
      .from("vehicle_fault_events")
      .update({ work_order_id: wo.id })
      .eq("id", event.id)
      .eq("org_id", orgId)
      // Don't overwrite a work order an automation linked while this request was running.
      .is("work_order_id", null);
    if (linkErr) log.warn("could not link work order to fault event", { error: linkErr, workOrderId: wo.id });
  }

  return NextResponse.json({ status: "created", workOrder: { id: wo.id, number: wo.work_order_number } });
}
