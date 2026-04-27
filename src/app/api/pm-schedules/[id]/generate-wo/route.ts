import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/pm-schedules/[id]/generate-wo
 *
 * Generates a parent Work Order + one sub-WO per asset in the PM schedule.
 * Parts templates (pm_schedule_asset_parts) are copied into wo_parts for each sub-WO.
 * Updates pm_schedules.next_due_date based on frequency.
 *
 * Returns: { parentWorkOrderId: string }
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: scheduleId } = await params;

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
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ── 1. Fetch the PM schedule ──────────────────────────────────────────────
  const { data: schedule, error: schedErr } = await adminClient
    .from("pm_schedules")
    .select("*")
    .eq("id", scheduleId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .single();

  if (schedErr || !schedule) {
    return NextResponse.json({ error: "PM schedule not found" }, { status: 404 });
  }

  // ── 2. Fetch linked assets ────────────────────────────────────────────────
  const { data: scheduleAssets } = await adminClient
    .from("pm_schedule_assets")
    .select("*")
    .eq("pm_schedule_id", scheduleId)
    .is("deleted_at", null)
    .order("asset_name");

  if (!scheduleAssets || scheduleAssets.length === 0) {
    return NextResponse.json(
      { error: "No assets linked to this PM schedule. Add assets first." },
      { status: 422 }
    );
  }

  // ── 3. Generate a WO number prefix ───────────────────────────────────────
  const suffix = Date.now().toString().slice(-6);
  const dateLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const isSingleAsset = scheduleAssets.length === 1;

  let primaryWOId: string;

  if (isSingleAsset) {
    // ── 4a. Single asset — create one flat WO with the asset attached directly ──
    const sa = scheduleAssets[0];
    const { data: singleWO, error: singleErr } = await adminClient
      .from("work_orders")
      .insert({
        org_id: profile.org_id,
        created_by: user.id,
        title: `${schedule.title} — ${dateLabel}`,
        description: schedule.description,
        status: "open",
        priority: "medium",
        wo_type: "preventive",
        asset_id: sa.asset_id,
        asset_name: sa.asset_name,
        pm_schedule_id: scheduleId,
        work_order_number: `WO-${suffix}`,
        assigned_to_ids: [],
        assigned_to_names: [],
        categories: ["Preventive Maintenance"],
        is_recurring: false,
      })
      .select()
      .single();

    if (singleErr || !singleWO) {
      return NextResponse.json({ error: singleErr?.message ?? "Failed to create WO" }, { status: 500 });
    }

    // Copy pm_schedule_asset_parts → wo_parts
    const { data: templateParts } = await adminClient
      .from("pm_schedule_asset_parts")
      .select("*")
      .eq("pm_schedule_asset_id", sa.id)
      .is("deleted_at", null);

    if (templateParts && templateParts.length > 0) {
      await adminClient.from("wo_parts").insert(
        templateParts.map((tp) => ({
          org_id: profile.org_id,
          work_order_id: singleWO.id,
          part_id: tp.part_id,
          part_name: tp.part_name,
          part_number: tp.part_number,
          quantity: tp.quantity,
          unit_cost: tp.unit_cost,
        }))
      );
    }

    primaryWOId = singleWO.id;
  } else {
    // ── 4b. Multiple assets — create a parent WO + one sub-WO per asset ──────
    const { data: parentWO, error: parentErr } = await adminClient
      .from("work_orders")
      .insert({
        org_id: profile.org_id,
        created_by: user.id,
        title: `${schedule.title} — ${dateLabel}`,
        description: schedule.description,
        status: "open",
        priority: "medium",
        wo_type: "preventive",
        pm_schedule_id: scheduleId,
        work_order_number: `WO-${suffix}-P`,
        assigned_to_ids: [],
        assigned_to_names: [],
        categories: ["Preventive Maintenance"],
        is_recurring: false,
      })
      .select()
      .single();

    if (parentErr || !parentWO) {
      return NextResponse.json({ error: parentErr?.message ?? "Failed to create parent WO" }, { status: 500 });
    }

    for (let i = 0; i < scheduleAssets.length; i++) {
      const sa = scheduleAssets[i];

      const { data: subWO, error: subErr } = await adminClient
        .from("work_orders")
        .insert({
          org_id: profile.org_id,
          created_by: user.id,
          title: sa.asset_name,
          status: "open",
          priority: "medium",
          wo_type: "preventive",
          asset_id: sa.asset_id,
          asset_name: sa.asset_name,
          pm_schedule_id: scheduleId,
          parent_work_order_id: parentWO.id,
          work_order_number: `WO-${suffix}-${i + 1}`,
          assigned_to_ids: [],
          assigned_to_names: [],
          categories: ["Preventive Maintenance"],
          is_recurring: false,
        })
        .select()
        .single();

      if (subErr || !subWO) continue;

      // Copy pm_schedule_asset_parts → wo_parts for this sub-WO
      const { data: templateParts } = await adminClient
        .from("pm_schedule_asset_parts")
        .select("*")
        .eq("pm_schedule_asset_id", sa.id)
        .is("deleted_at", null);

      if (templateParts && templateParts.length > 0) {
        await adminClient.from("wo_parts").insert(
          templateParts.map((tp) => ({
            org_id: profile.org_id,
            work_order_id: subWO.id,
            part_id: tp.part_id,
            part_name: tp.part_name,
            part_number: tp.part_number,
            quantity: tp.quantity,
            unit_cost: tp.unit_cost,
          }))
        );
      }
    }

    primaryWOId = parentWO.id;
  }

  // ── 6. Advance next_due_date on the PM schedule ───────────────────────────
  const nextDue = advanceDate(schedule.next_due_date, schedule.frequency);
  await adminClient
    .from("pm_schedules")
    .update({
      next_due_date: nextDue,
      last_completed_date: new Date().toISOString().slice(0, 10),
    })
    .eq("id", scheduleId);

  return NextResponse.json({ parentWorkOrderId: primaryWOId });
}

function advanceDate(from: string, frequency: string): string {
  const d = new Date(from);
  switch (frequency) {
    case "daily":     d.setDate(d.getDate() + 1); break;
    case "weekly":    d.setDate(d.getDate() + 7); break;
    case "monthly":   d.setMonth(d.getMonth() + 1); break;
    case "quarterly": d.setMonth(d.getMonth() + 3); break;
    case "annual":    d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString().slice(0, 10);
}
