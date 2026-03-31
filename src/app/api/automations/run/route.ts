import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = ReturnType<typeof createClient<any>>;

/**
 * POST /api/automations/run
 *
 * Execution engine for automation rules.
 * Two callers:
 *  1. Vercel Cron — passes Authorization: Bearer {CRON_SECRET}
 *  2. Authenticated admin triggering manually
 *
 * Currently executes: trigger_type=meter_threshold + action_type=create_wo_request
 */
export async function POST(request: Request) {
  const adminClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("Authorization") ?? "";
  const isCron =
    process.env.CRON_SECRET &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`;

  let callerOrgId: string | null = null;

  if (!isCron) {
    const userClient = await createServerClient();
    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: profile } = await userClient
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .single();
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }
    callerOrgId = profile.org_id;
  }

  // ── Fetch automations ─────────────────────────────────────────────────────
  let autoQuery = adminClient
    .from("automations")
    .select("*")
    .eq("trigger_type", "meter_threshold")
    .eq("action_type", "create_wo_request")
    .eq("enabled", true)
    .eq("pending_reset", false)
    .is("deleted_at", null);

  if (callerOrgId) {
    autoQuery = autoQuery.eq("org_id", callerOrgId);
  }

  const { data: automations, error: autoErr } = await autoQuery;
  if (autoErr) {
    return NextResponse.json({ error: autoErr.message }, { status: 500 });
  }

  const fired: { automationId: string; name: string; workOrderNumber: string }[] = [];
  const skipped: { automationId: string; reason: string }[] = [];

  for (const auto of automations ?? []) {
    const tc = (auto.trigger_config ?? {}) as Record<string, unknown>;
    const ac = (auto.action_config ?? {}) as Record<string, unknown>;
    const meterId = tc.meter_id as string | undefined;
    const threshold = Number(tc.threshold ?? 0);
    const operator = (tc.operator as string | undefined) ?? ">=";

    if (!meterId) {
      skipped.push({ automationId: auto.id, reason: "no meter_id in trigger_config" });
      continue;
    }

    // Fetch meter
    const { data: meter, error: meterErr } = await (adminClient as AdminClient)
      .from("meters")
      .select("id, current_value, asset_id, asset_name, org_id")
      .eq("id", meterId)
      .is("deleted_at", null)
      .single();

    if (meterErr || !meter) {
      skipped.push({ automationId: auto.id, reason: "meter not found" });
      continue;
    }

    const currentValue = Number(meter.current_value ?? 0);
    const triggered =
      operator === ">="
        ? currentValue >= threshold
        : currentValue <= threshold;

    if (!triggered) {
      skipped.push({
        automationId: auto.id,
        reason: `meter value ${currentValue} does not satisfy ${operator} ${threshold}`,
      });
      continue;
    }

    // Generate work order number
    const orgId = auto.org_id as string;
    const { count } = await (adminClient as AdminClient)
      .from("work_orders")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId);

    const woCount = (count ?? 0) + 1;
    const workOrderNumber = `WO${String(woCount).padStart(5, "0")}`;

    // Insert work order
    const { data: wo, error: woErr } = await (adminClient as AdminClient)
      .from("work_orders")
      .insert({
        org_id: orgId,
        title: (ac.title as string) ?? "Automated Work Order",
        priority: (ac.priority as string) ?? "medium",
        assigned_to_name: (ac.assigned_to as string) || null,
        status: "open",
        asset_id: meter.asset_id ?? null,
        asset_name: meter.asset_name ?? null,
        work_order_number: workOrderNumber,
        automation_id: auto.id,
        is_recurring: false,
      })
      .select("id, work_order_number")
      .single();

    if (woErr || !wo) {
      skipped.push({ automationId: auto.id, reason: `failed to create WO: ${woErr?.message ?? "unknown"}` });
      continue;
    }

    // Update automation: set last_fired_at, last_fired_value, pending_reset = true
    await (adminClient as AdminClient)
      .from("automations")
      .update({
        last_fired_at: new Date().toISOString(),
        last_fired_value: currentValue,
        pending_reset: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", auto.id);

    fired.push({
      automationId: auto.id,
      name: auto.name,
      workOrderNumber: wo.work_order_number,
    });
  }

  return NextResponse.json({
    fired: fired.length,
    skipped: skipped.length,
    details: { fired, skipped },
  });
}
