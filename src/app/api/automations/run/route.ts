import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import type { Database } from "@/types/supabase";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = ReturnType<typeof createClient<any>>;

/**
 * GET  /api/automations/run — called by Vercel Cron (GET only)
 * POST /api/automations/run — called by admin manual trigger from the UI
 *
 * Execution engine for automation rules.
 * Two callers:
 *  1. Vercel Cron — passes Authorization: Bearer {CRON_SECRET}
 *  2. Authenticated admin triggering manually
 *
 * Executes: trigger_type=meter_threshold with any supported action_type
 */
export async function GET(request: Request) {
  return handleRun(request);
}

export async function POST(request: Request) {
  return handleRun(request);
}

async function handleRun(request: Request) {
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

      // Notify admins/managers about the auto-generated maintenance request
      try {
        const resendKey = process.env.RESEND_API_KEY;
        if (resendKey) {
          const { data: recipients } = await (adminClient as AdminClient)
            .from("profiles")
            .select("email, name, notification_prefs")
            .eq("org_id", orgId)
            .in("role", ["admin", "manager"]);

          const eligible = (recipients ?? []).filter((p: { email: string | null; notification_prefs: Record<string, unknown> | null }) => {
            if (!p.email) return false;
            const prefs = (p.notification_prefs ?? {}) as Record<string, unknown>;
            return prefs["emailNewMaintenanceRequest"] !== false;
          });

          if (eligible.length > 0) {
            const resend = new Resend(resendKey);
            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://twins-os.vercel.app";
            const subject = `New maintenance request: ${acTitle}`;
            const link = `${siteUrl}/cmms/work-orders`;
            await Promise.allSettled(
              eligible.map((p: { email: string | null; name: string | null }) =>
                resend.emails.send({
                  from: "Equipt <noreply@twinslawnservice.com>",
                  to: p.email as string,
                  subject,
                  html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
                    <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">New Maintenance Request</h2>
                    <p style="margin:0 0 4px;color:#475569">Hi ${p.name ?? "there"},</p>
                    <p style="margin:0 0 24px;color:#475569">Automation <strong>${auto.name}</strong> created: <strong>${mr.request_number} — ${acTitle}</strong>.</p>
                    <a href="${link}" style="display:inline-block;padding:12px 24px;background:#60ab45;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Review Request</a>
                  </div>`,
                })
              )
            );
          }
        }
      } catch {
        // best-effort — don't fail the automation run
      }

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

  // ── CRM sequence enrollment processor ────────────────────────────────────
  const crmFired: { enrollmentId: string; action: string }[] = [];
  const crmSkipped: { enrollmentId: string; reason: string }[] = [];

  try {
    const now = new Date().toISOString();

    let enrollQuery = (adminClient as AdminClient)
      .from("crm_sequence_enrollments")
      .select("id, org_id, sequence_id, client_id, estimate_id, next_event_position")
      .lte("next_fire_at", now)
      .is("completed_at", null)
      .is("stopped_at", null)
      .is("deleted_at", null)
      .limit(50);

    if (callerOrgId) {
      enrollQuery = enrollQuery.eq("org_id", callerOrgId);
    }

    const { data: enrollments, error: enrollErr } = await enrollQuery;
    if (enrollErr) {
      console.error("[crm-processor] enrollment query error:", enrollErr.message);
    }

    for (const enrollment of enrollments ?? []) {
      const { id: enrollId, org_id: orgId, sequence_id, client_id, estimate_id, next_event_position } = enrollment;

      // Fetch all events for this sequence ordered by position
      const { data: events } = await (adminClient as AdminClient)
        .from("crm_sequence_events")
        .select("id, event_type, config, position")
        .eq("sequence_id", sequence_id)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("position", { ascending: true });

      const currentEvent = (events ?? []).find((e: { position: number }) => e.position === next_event_position);

      if (!currentEvent) {
        // No more events — mark complete
        await (adminClient as AdminClient)
          .from("crm_sequence_enrollments")
          .update({ completed_at: now, updated_at: now })
          .eq("id", enrollId);
        crmFired.push({ enrollmentId: enrollId, action: "completed" });
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eventConfig = (currentEvent.config ?? {}) as Record<string, any>;

      if (currentEvent.event_type === "wait") {
        // Advance past the wait to the next event position
        const nextPos = next_event_position + 1;
        const nextEvent = (events ?? []).find((e: { position: number }) => e.position === nextPos);
        let newFireAt = now;
        if (nextEvent?.event_type === "wait") {
          const days = (nextEvent.config as Record<string, number>)?.days ?? 0;
          const d = new Date();
          d.setDate(d.getDate() + days);
          newFireAt = d.toISOString();
        }
        await (adminClient as AdminClient)
          .from("crm_sequence_enrollments")
          .update({ next_event_position: nextPos, next_fire_at: newFireAt, updated_at: now })
          .eq("id", enrollId);
        crmFired.push({ enrollmentId: enrollId, action: `wait advanced to position ${nextPos}` });
        continue;
      }

      if (currentEvent.event_type === "email") {
        const resendKey = process.env.RESEND_API_KEY;
        if (!resendKey) {
          crmSkipped.push({ enrollmentId: enrollId, reason: "RESEND_API_KEY not configured" });
          continue;
        }

        // Fetch client
        const { data: client } = await (adminClient as AdminClient)
          .from("clients")
          .select("display_name, primary_email")
          .eq("id", client_id)
          .single();

        if (!client?.primary_email) {
          crmSkipped.push({ enrollmentId: enrollId, reason: "client has no primary_email" });
          continue;
        }

        // Fetch org for branding
        const { data: orgRow } = await (adminClient as AdminClient)
          .from("organizations")
          .select("name, brand_color")
          .eq("id", orgId)
          .single();

        // Fetch estimate if present
        let estimateNumber: string | null = null;
        if (estimate_id) {
          const { data: estRow } = await (adminClient as AdminClient)
            .from("estimates")
            .select("estimate_number")
            .eq("id", estimate_id)
            .single();
          if (estRow?.estimate_number != null) {
            estimateNumber = String(estRow.estimate_number).padStart(5, "0");
          }
        }

        const clientDisplayName = (client.display_name as string) ?? "";
        const clientFirstName = clientDisplayName.split(" ")[0] ?? clientDisplayName;
        const orgName = (orgRow?.name as string) ?? "Your Service Provider";

        // Resolve merge tags
        const mergeTags: Record<string, string> = {
          "[clientfirstname]": clientFirstName,
          "[clientfullname]":  clientDisplayName,
          "[companyname]":     orgName,
          "[quotenumber]":     estimateNumber ?? "",
        };

        const resolveBody = (template: string) =>
          template.replace(/\[(\w+)\]/gi, (match) => mergeTags[match.toLowerCase()] ?? match);

        const subject  = resolveBody(eventConfig.subject  ?? "(no subject)");
        const bodyHtml = resolveBody(eventConfig.bodyHtml ?? "");

        const resend = new Resend(resendKey);
        const { data: sent, error: sendErr } = await resend.emails.send({
          from: "Twins Lawn Service <noreply@twinslawnservice.com>",
          to: client.primary_email as string,
          subject,
          html: bodyHtml,
        });

        if (sendErr) {
          console.error("[crm-processor] Resend error:", sendErr);
          crmSkipped.push({ enrollmentId: enrollId, reason: `email send failed: ${String(sendErr)}` });
          continue;
        }

        // Log to estimate_emails if estimate_id present
        if (estimate_id) {
          await (adminClient as AdminClient).from("estimate_emails").insert({
            org_id:     orgId,
            estimate_id,
            to_email:   client.primary_email,
            to_name:    clientDisplayName || null,
            subject,
            body_html:  bodyHtml,
            resend_id:  sent?.id ?? null,
            email_type: "automation",
          });
        }

        // Advance to next event
        const nextPos = next_event_position + 1;
        const nextEvent = (events ?? []).find((e: { position: number }) => e.position === nextPos);

        if (!nextEvent) {
          // No more events — complete
          await (adminClient as AdminClient)
            .from("crm_sequence_enrollments")
            .update({ completed_at: now, updated_at: now })
            .eq("id", enrollId);
          crmFired.push({ enrollmentId: enrollId, action: `email sent → completed` });
        } else if (nextEvent.event_type === "wait") {
          const days = (nextEvent.config as Record<string, number>)?.days ?? 0;
          const d = new Date();
          d.setDate(d.getDate() + days);
          await (adminClient as AdminClient)
            .from("crm_sequence_enrollments")
            .update({ next_event_position: nextPos + 1, next_fire_at: d.toISOString(), updated_at: now })
            .eq("id", enrollId);
          crmFired.push({ enrollmentId: enrollId, action: `email sent → wait ${days}d` });
        } else {
          await (adminClient as AdminClient)
            .from("crm_sequence_enrollments")
            .update({ next_event_position: nextPos, next_fire_at: now, updated_at: now })
            .eq("id", enrollId);
          crmFired.push({ enrollmentId: enrollId, action: `email sent → position ${nextPos}` });
        }
        continue;
      }

      // Unsupported event type — skip without blocking
      crmSkipped.push({ enrollmentId: enrollId, reason: `unsupported event_type: ${currentEvent.event_type}` });
    }
  } catch (crmErr) {
    console.error("[crm-processor] fatal error:", crmErr);
  }

  return NextResponse.json({
    fired: fired.length,
    skipped: skipped.length,
    details: { fired, skipped },
    crm: { fired: crmFired.length, skipped: crmSkipped.length, details: { fired: crmFired, skipped: crmSkipped } },
  });
}
