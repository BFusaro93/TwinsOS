import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { setWOPartStock } from "@/lib/inventory/part-stock";
import { logger } from "@/lib/logger";

const log = logger.child("pm-generate-wo");

type ServerSupabase = Awaited<ReturnType<typeof createServerClient>>;

/**
 * Copies pm_schedule_asset_parts templates into wo_parts for a generated WO
 * and deducts them from inventory, mirroring useAddWOPart (use-wo-costs.ts):
 * each line is inserted with quantity_deducted 0 and then set_wo_part_stock()
 * takes the stock, recording how much it REALLY took (deductions clamp at 0),
 * so deleting the line later credits back only that. Uses the
 * session-authenticated client for the RPC because it needs a real
 * auth.uid() to attribute the audit entry to. Throws on any failure — a
 * silently skipped deduction leaves inventory wrong with no trace.
 * Returns the part names that were short of stock.
 */
async function copyTemplatePartsAndDeduct(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  userClient: ServerSupabase,
  orgId: string,
  workOrderId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  templateParts: any[]
): Promise<string[]> {
  if (templateParts.length === 0) return [];
  const { data: inserted, error: insertErr } = await adminClient
    .from("wo_parts")
    .insert(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      templateParts.map((tp: any) => ({
        org_id: orgId,
        work_order_id: workOrderId,
        part_id: tp.part_id,
        part_name: tp.part_name,
        part_number: tp.part_number,
        quantity: tp.quantity,
        unit_cost: tp.unit_cost,
        quantity_deducted: 0,
      }))
    )
    .select("id, part_id, part_name, quantity");
  if (insertErr) throw new Error(`Failed to copy parts onto the work order: ${insertErr.message}`);

  const short: string[] = [];
  for (const row of (inserted ?? []) as { id: string; part_id: string | null; part_name: string; quantity: number }[]) {
    if (!row.part_id) continue;
    const res = await setWOPartStock(userClient, row.id, row.quantity);
    if (res.appliedDelta > res.requestedDelta) short.push(row.part_name);
  }
  return short;
}

/**
 * Undoes a partially generated batch: returns any parts already taken from
 * stock and soft-deletes the WOs created so far, so a failed generation
 * doesn't leave a half batch (which the duplicate guard would then block
 * regenerating) or inventory taken for WOs that don't exist.
 */
async function rollbackGeneratedWOs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  userClient: ServerSupabase,
  workOrderIds: string[]
) {
  if (workOrderIds.length === 0) return;
  const { data: parts } = await adminClient
    .from("wo_parts")
    .select("id, part_id")
    .in("work_order_id", workOrderIds)
    .is("deleted_at", null)
    .not("part_id", "is", null);
  for (const wp of (parts ?? []) as { id: string }[]) {
    await setWOPartStock(userClient, wp.id, 0).catch((err: unknown) => {
      log.error("rollback: failed to return part to stock", { woPartId: wp.id, error: err instanceof Error ? err.message : String(err) });
    });
  }
  await adminClient
    .from("work_orders")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", workOrderIds);
}

// The DB-level backstop for the duplicate-batch guard (see the "── 2."
// check below): work_orders_pm_schedule_open_batch_unique
// (20260901140000_pm_generate_wo_race_guard.sql) rejects a second
// concurrent insert with unique_violation (23505) when two requests race
// past the check-then-insert above. Recognize that specific violation so it
// surfaces as the same friendly 409 rather than a raw 500.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isDuplicateBatchError(error: any): boolean {
  return error?.code === "23505" && typeof error?.message === "string"
    && error.message.includes("work_orders_pm_schedule_open_batch_unique");
}

/**
 * POST /api/pm-schedules/[id]/generate-wo
 *
 * Generates a parent Work Order + one sub-WO per asset in the PM schedule.
 * Parts templates (pm_schedule_asset_parts) are copied into wo_parts for each sub-WO.
 * Updates pm_schedules.next_due_date based on frequency.
 *
 * Returns: { parentWorkOrderId: string, shortParts: string[], warning?: string }
 * (shortParts = part names whose stock ran out; deductions clamp at 0)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: scheduleId } = await params;

  // "Today" comes from the org's own stored timezone. This used to trust a
  // `today` sent by the browser, because the server had nowhere to get the
  // org's clock from — that is no longer true, and the browser's answer was
  // never the right one anyway: a manager generating PMs from another
  // timezone would shift the schedule's day for everyone. A `today` in the
  // body is now ignored.

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

  // ── 3. WO number from the atomic per-org counter ──────────────────────────
  // Same next_work_order_number() every other WO path uses. The old
  // `WO-${Date.now().slice(-6)}` could collide and skipped the org's sequence.
  // Sub-WOs share the batch's number with a -1, -2… suffix, which can't
  // collide with a counter-issued number.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: woNumber, error: woNumErr } = await (userClient.rpc as any)("next_work_order_number");
  if (woNumErr || !woNumber) {
    return NextResponse.json({ error: woNumErr?.message ?? "Failed to allocate a work order number" }, { status: 500 });
  }
  const baseNumber = woNumber as string;
  const createdWOIds: string[] = [];
  const shortParts: string[] = [];
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
        work_order_number: baseNumber,
        assigned_to_id: schedule.assigned_to_id ?? null,
        assigned_to_name: schedule.assigned_to_name ?? null,
        assigned_to_ids: assigneeIds,
        assigned_to_names: assigneeNames,
        categories: ["Preventive Maintenance"],
        is_recurring: false,
      })
      .select()
      .single();

    if (singleErr && isDuplicateBatchError(singleErr)) {
      return NextResponse.json(
        { error: "There are already open work orders for this schedule. Complete or close the existing batch before generating a new one." },
        { status: 409 }
      );
    }
    if (singleErr || !singleWO) {
      return NextResponse.json({ error: singleErr?.message ?? "Failed to create WO" }, { status: 500 });
    }

    createdWOIds.push(singleWO.id);

    // Copy pm_schedule_asset_parts → wo_parts
    const { data: templateParts, error: tplErr } = await adminClient
      .from("pm_schedule_asset_parts")
      .select("*")
      .eq("pm_schedule_asset_id", sa.id)
      .is("deleted_at", null);

    try {
      if (tplErr) throw new Error(`Failed to load the schedule's parts: ${tplErr.message}`);
      shortParts.push(...await copyTemplatePartsAndDeduct(adminClient, userClient, profile.org_id, singleWO.id, templateParts ?? []));
    } catch (err) {
      await rollbackGeneratedWOs(adminClient, userClient, createdWOIds);
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
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
        work_order_number: baseNumber,
        assigned_to_id: schedule.assigned_to_id ?? null,
        assigned_to_name: schedule.assigned_to_name ?? null,
        assigned_to_ids: assigneeIds,
        assigned_to_names: assigneeNames,
        categories: ["Preventive Maintenance"],
        is_recurring: false,
      })
      .select()
      .single();

    if (parentErr && isDuplicateBatchError(parentErr)) {
      return NextResponse.json(
        { error: "There are already open work orders for this schedule. Complete or close the existing batch before generating a new one." },
        { status: 409 }
      );
    }
    if (parentErr || !parentWO) {
      return NextResponse.json({ error: parentErr?.message ?? "Failed to create parent WO" }, { status: 500 });
    }
    createdWOIds.push(parentWO.id);

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
          work_order_number: `${baseNumber}-${i + 1}`,
          assigned_to_id: schedule.assigned_to_id ?? null,
          assigned_to_name: schedule.assigned_to_name ?? null,
          assigned_to_ids: assigneeIds,
          assigned_to_names: assigneeNames,
          categories: ["Preventive Maintenance"],
          is_recurring: false,
        })
        .select()
        .single();

      // A missing sub-WO used to be skipped silently while next_due_date
      // still advanced — that asset's PM was simply lost for the cycle. Fail
      // the whole batch instead (rolled back, schedule not advanced).
      if (subErr || !subWO) {
        await rollbackGeneratedWOs(adminClient, userClient, createdWOIds);
        return NextResponse.json(
          { error: `Failed to create the work order for ${sa.asset_name}: ${subErr?.message ?? "unknown error"}. Nothing was generated.` },
          { status: 500 }
        );
      }
      createdWOIds.push(subWO.id);

      // Copy pm_schedule_asset_parts → wo_parts for this sub-WO
      const { data: templateParts, error: tplErr } = await adminClient
        .from("pm_schedule_asset_parts")
        .select("*")
        .eq("pm_schedule_asset_id", sa.id)
        .is("deleted_at", null);

      try {
        if (tplErr) throw new Error(`Failed to load the schedule's parts: ${tplErr.message}`);
        shortParts.push(...await copyTemplatePartsAndDeduct(adminClient, userClient, profile.org_id, subWO.id, templateParts ?? []));
      } catch (err) {
        await rollbackGeneratedWOs(adminClient, userClient, createdWOIds);
        return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
      }
    }

    primaryWOId = parentWO.id;
  }

  // ── 5. Advance next_due_date on the PM schedule ───────────────────────────
  // Advance from today (actual generation date) so that generating early
  // doesn't push the next due date further out than one interval from now.
  const today = todayInZone(await getOrgTimeZone(userClient, profile.org_id as string));
  const nextDue = advanceDate(today, schedule.frequency);
  const { error: advanceErr } = await adminClient
    .from("pm_schedules")
    .update({
      next_due_date: nextDue,
      last_completed_date: today,
    })
    .eq("id", scheduleId);
  if (advanceErr) {
    // The batch exists, so keep it — but say the schedule didn't move.
    return NextResponse.json(
      {
        parentWorkOrderId: primaryWOId,
        shortParts,
        warning: `Work orders were created, but the schedule's next due date could not be advanced: ${advanceErr.message}`,
      },
      { status: 200 }
    );
  }

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

  return NextResponse.json({ parentWorkOrderId: primaryWOId, shortParts });
}

function advanceDate(from: string, frequency: string): string {
  const d = new Date(from);
  const monthsToAdd =
    frequency === "monthly" ? 1 :
    frequency === "quarterly" ? 3 :
    frequency === "annual" ? 12 :
    0;

  // `from` is a "YYYY-MM-DD" string, which `new Date(from)` parses as UTC
  // midnight. All component reads/writes below use the UTC-suffixed
  // getters/setters (and Date.UTC for construction) to match — mixing those
  // with local getters (getMonth/getDate/getFullYear) while serializing back
  // via toISOString() (UTC) would shift the effective day by ±1 on any
  // non-UTC server/runtime.
  if (monthsToAdd > 0) {
    // Building the target date from (year, targetMonthIndex, clampedDay)
    // rather than mutating via .setMonth()/.setFullYear() avoids JS Date's
    // month-overflow rollover: a schedule due Jan 31 advanced with
    // .setMonth(+1) landed on Mar 3 (Feb has only 28/29 days), silently
    // skipping February's occurrence entirely.
    const targetMonthIndex = d.getUTCMonth() + monthsToAdd;
    const daysInTargetMonth = new Date(Date.UTC(d.getUTCFullYear(), targetMonthIndex + 1, 0)).getUTCDate();
    const next = new Date(Date.UTC(d.getUTCFullYear(), targetMonthIndex, Math.min(d.getUTCDate(), daysInTargetMonth)));
    return next.toISOString().slice(0, 10);
  }

  switch (frequency) {
    case "daily":  d.setUTCDate(d.getUTCDate() + 1); break;
    case "weekly": d.setUTCDate(d.getUTCDate() + 7); break;
  }
  return d.toISOString().slice(0, 10);
}
