import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

type ServerSupabase = Awaited<ReturnType<typeof createServerClient>>;

/**
 * Mirrors useAddWOPart's insert-path inventory deduction (use-wo-costs.ts) for
 * wo_parts rows created here by copying pm_schedule_asset_parts templates.
 * Without this, PM-generated parts were never deducted from parts.quantity_on_hand
 * at all — but useDeleteWOPart still credits +quantity back on delete, so
 * removing a PM-generated line inflated stock that generation never reduced.
 * Uses the session-authenticated client (not the service-role adminClient)
 * because adjust_part_quantity() requires a real auth.uid() to attribute the
 * audit entry to.
 */
async function deductPartsInventory(
  userClient: ServerSupabase,
  workOrderId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  templateParts: any[]
) {
  const withParts = templateParts.filter((tp) => tp.part_id);
  await Promise.all(
    withParts.map((tp) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (userClient.rpc as any)("adjust_part_quantity", {
        p_part_id: tp.part_id,
        p_delta: -tp.quantity,
        p_work_order_id: workOrderId,
      })
    )
  );
}

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
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: scheduleId } = await params;

  // The server has no stored org timezone to derive "today" from — trust
  // the browser's own local calendar date when it's given (a well-formed
  // YYYY-MM-DD), falling back to the server's UTC date only if it's
  // missing/malformed (e.g. a direct API call with no body).
  let clientToday: string | null = null;
  try {
    const body = await request.json() as { today?: string };
    if (body?.today && /^\d{4}-\d{2}-\d{2}$/.test(body.today)) {
      clientToday = body.today;
    }
  } catch {
    // No/invalid JSON body — fall back below.
  }

  const userClient = await createServerClient();
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile } = await userClient
    .from("profiles")
    .select("org_id, role, name")
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

  // ── 2. Duplicate guard — block if any open WOs from this schedule exist ─────
  // Checks across all dates, not just today, so generating a new batch while
  // the previous week's is still open is prevented.
  const { data: openWOs } = await adminClient
    .from("work_orders")
    .select("id, work_order_number, created_at")
    .eq("pm_schedule_id", scheduleId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .not("status", "in", '("done","skipped")')
    .is("parent_work_order_id", null)  // parent WOs only to avoid counting sub-WOs
    .limit(1);

  if (openWOs && openWOs.length > 0) {
    const existing = openWOs[0];
    return NextResponse.json(
      { error: `There are already open work orders for this schedule (${existing.work_order_number}). Complete or close the existing batch before generating a new one.` },
      { status: 409 }
    );
  }

  // ── 3. Fetch linked assets ────────────────────────────────────────────────
  const { data: allScheduleAssets } = await adminClient
    .from("pm_schedule_assets")
    .select("*")
    .eq("pm_schedule_id", scheduleId)
    .is("deleted_at", null)
    .order("asset_name");

  if (!allScheduleAssets || allScheduleAssets.length === 0) {
    return NextResponse.json(
      { error: "No assets linked to this PM schedule. Add assets first." },
      { status: 422 }
    );
  }

  // A schedule's pm_schedule_assets rows cache asset_id/asset_name at link time
  // and are never cleaned up when the underlying asset is later soft-deleted or
  // marked disposed — without this check, generating work orders would keep
  // creating WOs against equipment that no longer exists / is retired.
  const assetIds = allScheduleAssets.map((sa) => sa.asset_id).filter(Boolean);
  const { data: liveAssets } = await adminClient
    .from("assets")
    .select("id, status")
    .in("id", assetIds)
    .is("deleted_at", null)
    .not("status", "eq", "disposed");
  const liveAssetIds = new Set((liveAssets ?? []).map((a) => a.id));
  const scheduleAssets = allScheduleAssets.filter((sa) => liveAssetIds.has(sa.asset_id));

  if (scheduleAssets.length === 0) {
    return NextResponse.json(
      { error: "All assets linked to this PM schedule have been deleted or disposed. Update the schedule's assets before generating work orders." },
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
    const assigneeIds   = schedule.assigned_to_id   ? [schedule.assigned_to_id]   : [];
    const assigneeNames = schedule.assigned_to_name ? [schedule.assigned_to_name] : [];

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
        assigned_to_id: schedule.assigned_to_id ?? null,
        assigned_to_name: schedule.assigned_to_name ?? null,
        assigned_to_ids: assigneeIds,
        assigned_to_names: assigneeNames,
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
      await deductPartsInventory(userClient, singleWO.id, templateParts);
    }

    primaryWOId = singleWO.id;
  } else {
    // ── 4b. Multiple assets — create a parent WO + one sub-WO per asset ──────
    const assigneeIds   = schedule.assigned_to_id   ? [schedule.assigned_to_id]   : [];
    const assigneeNames = schedule.assigned_to_name ? [schedule.assigned_to_name] : [];

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
        assigned_to_id: schedule.assigned_to_id ?? null,
        assigned_to_name: schedule.assigned_to_name ?? null,
        assigned_to_ids: assigneeIds,
        assigned_to_names: assigneeNames,
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
          assigned_to_id: schedule.assigned_to_id ?? null,
          assigned_to_name: schedule.assigned_to_name ?? null,
          assigned_to_ids: assigneeIds,
          assigned_to_names: assigneeNames,
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
        await deductPartsInventory(userClient, subWO.id, templateParts);
      }
    }

    primaryWOId = parentWO.id;
  }

  // ── 5. Advance next_due_date on the PM schedule ───────────────────────────
  // Advance from today (actual generation date) so that generating early
  // doesn't push the next due date further out than one interval from now.
  const today = clientToday ?? new Date().toISOString().slice(0, 10);
  const nextDue = advanceDate(today, schedule.frequency);
  await adminClient
    .from("pm_schedules")
    .update({
      next_due_date: nextDue,
      last_completed_date: today,
    })
    .eq("id", scheduleId);

  // The update above runs through the service-role client, so fn_audit_log()
  // can't see the acting user via auth.uid() and the generic field-diff
  // description is noisy for a routine automatic bump. Rewrite the entry the
  // trigger just wrote with proper attribution and a clean description.
  const { data: scheduleAudit } = await adminClient
    .from("audit_log")
    .select("id")
    .eq("record_type", "pm_schedule")
    .eq("record_id", scheduleId)
    .eq("action", "updated")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (scheduleAudit) {
    await adminClient
      .from("audit_log")
      .update({
        created_by: user.id,
        changed_by_name: profile.name ?? "system",
        description: `Work orders generated — next due date advanced to ${nextDue}`,
      })
      .eq("id", scheduleAudit.id);
  }

  return NextResponse.json({ parentWorkOrderId: primaryWOId });
}

function advanceDate(from: string, frequency: string): string {
  const d = new Date(from);
  const monthsToAdd =
    frequency === "monthly" ? 1 :
    frequency === "quarterly" ? 3 :
    frequency === "annual" ? 12 :
    0;

  if (monthsToAdd > 0) {
    // Building the target date from (year, targetMonthIndex, clampedDay)
    // rather than mutating via .setMonth()/.setFullYear() avoids JS Date's
    // month-overflow rollover: a schedule due Jan 31 advanced with
    // .setMonth(+1) landed on Mar 3 (Feb has only 28/29 days), silently
    // skipping February's occurrence entirely.
    const targetMonthIndex = d.getMonth() + monthsToAdd;
    const daysInTargetMonth = new Date(d.getFullYear(), targetMonthIndex + 1, 0).getDate();
    const next = new Date(d.getFullYear(), targetMonthIndex, Math.min(d.getDate(), daysInTargetMonth));
    return next.toISOString().slice(0, 10);
  }

  switch (frequency) {
    case "daily":  d.setDate(d.getDate() + 1); break;
    case "weekly": d.setDate(d.getDate() + 7); break;
  }
  return d.toISOString().slice(0, 10);
}
