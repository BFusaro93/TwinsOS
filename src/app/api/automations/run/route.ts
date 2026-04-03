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
 * Executes: trigger_type=meter_threshold with any supported action_type
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
    .in("action_type", [
      "create_work_order",
      "create_wo_request",
      "create_requisition",
      "send_notification",
      "send_email",
    ])
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

  const fired: { automationId: string; name: string; result: string }[] = [];
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

    const orgId = auto.org_id as string;
    const acTitle = (ac.title as string) ?? "Automated Work Order";
    const acPriority = (ac.priority as string) ?? "medium";

    let result: string;

    if (auto.action_type === "create_work_order") {
      // ── Create Work Order directly ──────────────────────────────────────────
      const workOrderNumber = `WO-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

      const { data: wo, error: woErr } = await (adminClient as AdminClient)
        .from("work_orders")
        .insert({
          org_id: orgId,
          title: acTitle,
          priority: acPriority,
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
      result = wo.work_order_number;

    } else if (auto.action_type === "create_wo_request") {
      // ── Create Maintenance Request (approval-flow path) ─────────────────────
      const requestNumber = `MR-${new Date().getFullYear()}-${Date.now()}`;

      const { data: mr, error: mrErr } = await (adminClient as AdminClient)
        .from("maintenance_requests")
        .insert({
          org_id: orgId,
          request_number: requestNumber,
          title: acTitle,
          priority: acPriority,
          status: "open",
          asset_id: meter.asset_id ?? null,
          asset_name: meter.asset_name ?? null,
          requested_by_name: "Automation",
          description: `Auto-generated by automation: ${auto.name}`,
          automation_id: auto.id,
        })
        .select("id, request_number")
        .single();

      if (mrErr || !mr) {
        skipped.push({ automationId: auto.id, reason: `failed to create MR: ${mrErr?.message ?? "unknown"}` });
        continue;
      }
      result = mr.request_number;

    } else if (auto.action_type === "create_requisition") {
      // ── Create draft Requisition ────────────────────────────────────────────
      const requisitionNumber = `REQ-${new Date().getFullYear()}-${Date.now()}`;

      const { data: req, error: reqErr } = await (adminClient as AdminClient)
        .from("requisitions")
        .insert({
          org_id: orgId,
          requisition_number: requisitionNumber,
          title: auto.name,
          status: "draft",
          requested_by_name: "Automation",
          notes: (ac.notes as string) || `Auto-generated by automation: ${auto.name}`,
        })
        .select("id, requisition_number")
        .single();

      if (reqErr || !req) {
        skipped.push({ automationId: auto.id, reason: `failed to create requisition: ${reqErr?.message ?? "unknown"}` });
        continue;
      }
      result = req.requisition_number;

    } else if (auto.action_type === "send_notification") {
      // ── Insert in-app notifications for target role ─────────────────────────
      const recipientRole = (ac.recipient_role as string) ?? "all";
      const message = (ac.message as string) ?? `Automation "${auto.name}" triggered.`;

      let profileQuery = (adminClient as AdminClient)
        .from("profiles")
        .select("id")
        .eq("org_id", orgId);

      if (recipientRole !== "all") {
        profileQuery = profileQuery.eq("role", recipientRole);
      }

      const { data: profiles, error: profileErr } = await profileQuery;

      if (profileErr || !profiles?.length) {
        skipped.push({ automationId: auto.id, reason: `no profiles found for role "${recipientRole}"` });
        continue;
      }

      const rows = profiles.map((p: { id: string }) => ({
        org_id: orgId,
        user_id: p.id,
        message,
      }));

      const { error: notifErr } = await (adminClient as AdminClient)
        .from("notifications")
        .insert(rows);

      if (notifErr) {
        skipped.push({ automationId: auto.id, reason: `failed to insert notifications: ${notifErr.message}` });
        continue;
      }
      result = `notified ${profiles.length} user${profiles.length === 1 ? "" : "s"}`;

    } else if (auto.action_type === "send_email") {
      // ── Send email via Resend ───────────────────────────────────────────────
      const recipient = (ac.recipient as string) ?? "";
      if (!recipient) {
        skipped.push({ automationId: auto.id, reason: "no recipient in action_config" });
        continue;
      }

      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) {
        skipped.push({ automationId: auto.id, reason: "RESEND_API_KEY not configured" });
        continue;
      }

      const fromEmail = process.env.FROM_EMAIL ?? "noreply@twinsOS.com";
      const subject = `Automation triggered: ${auto.name}`;
      const body = (ac.message as string)
        ? `${ac.message as string}\n\nTriggered by automation: ${auto.name}`
        : `Automation "${auto.name}" was triggered.`;

      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [recipient],
          subject,
          text: body,
        }),
      });

      if (!emailRes.ok) {
        const errText = await emailRes.text();
        skipped.push({ automationId: auto.id, reason: `email send failed: ${errText}` });
        continue;
      }
      result = `email sent to ${recipient}`;

    } else {
      skipped.push({ automationId: auto.id, reason: `unsupported action_type: ${auto.action_type}` });
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
      result,
    });
  }

  return NextResponse.json({
    fired: fired.length,
    skipped: skipped.length,
    details: { fired, skipped },
  });
}
