/**
 * POST /api/notifications/email
 *
 * Sends transactional email notifications for events that happen outside
 * the approval-requests flow (WO assigned, WO status changed, approved,
 * rejected, new maintenance request).
 *
 * Called best-effort (fire-and-forget) from client hooks after mutations.
 *
 * Body:
 *   type        — event type string
 *   entityId    — UUID of the affected entity
 *   entityType  — "work_order" | "requisition" | "purchase_order" | "maintenance_request"
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

type NotifType =
  | "wo_assigned"
  | "wo_status_changed"
  | "approved"
  | "rejected"
  | "new_maintenance_request";

// Maps event type → the notification_prefs key that gates email delivery
const PREF_KEY: Record<NotifType, string> = {
  wo_assigned:              "emailWorkOrderAssigned",
  wo_status_changed:        "emailWorkOrderStatusChanged",
  approved:                 "emailRequisitionApproved",
  rejected:                 "emailRequisitionRejected",
  new_maintenance_request:  "emailNewMaintenanceRequest",
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://twins-os.vercel.app";
const FROM     = "Equipt <noreply@twinslawnservice.com>";

export async function POST(request: Request) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const userClient = await createServerClient();
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: callerProfile } = await userClient
    .from("profiles")
    .select("org_id, name")
    .eq("id", user.id)
    .single();
  if (!callerProfile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  }

  let body: { type?: string; entityId?: string; entityType?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, entityId, entityType } = body;
  if (!type || !entityId || !entityType) {
    return NextResponse.json({ error: "type, entityId, and entityType required" }, { status: 400 });
  }

  const prefKey = PREF_KEY[type as NotifType];
  if (!prefKey) {
    return NextResponse.json({ error: `Unknown notification type: ${type}` }, { status: 400 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ── Fetch the entity ──────────────────────────────────────────────────────
  const tableMap: Record<string, string> = {
    work_order:           "work_orders",
    requisition:          "requisitions",
    purchase_order:       "purchase_orders",
    maintenance_request:  "maintenance_requests",
  };
  const table = tableMap[entityType];
  if (!table) {
    return NextResponse.json({ error: `Unknown entityType: ${entityType}` }, { status: 400 });
  }

  const { data: entity } = await adminClient.from(table).select("*").eq("id", entityId).single();
  if (!entity) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  // ── Determine recipient user IDs ──────────────────────────────────────────
  let recipientIds: string[] = [];

  if (type === "wo_assigned" || type === "wo_status_changed") {
    // Notify all users assigned to the WO
    const ids: string[] = Array.isArray(entity.assigned_to_ids)
      ? (entity.assigned_to_ids as string[])
      : entity.assigned_to_id ? [entity.assigned_to_id as string] : [];
    // Don't email the person who triggered the action
    recipientIds = ids.filter((id) => id !== user.id);

  } else if (type === "approved" || type === "rejected") {
    // Notify whoever submitted/requested the entity
    const submitterId = (entity.requested_by_id ?? entity.created_by) as string | null;
    if (submitterId && submitterId !== user.id) {
      recipientIds = [submitterId];
    }

  } else if (type === "new_maintenance_request") {
    // Notify all admins and managers in the org
    const { data: managers } = await adminClient
      .from("profiles")
      .select("id")
      .eq("org_id", callerProfile.org_id)
      .in("role", ["admin", "manager"])
      .neq("id", user.id);
    recipientIds = (managers ?? []).map((p: { id: string }) => p.id);
  }

  if (recipientIds.length === 0) {
    return NextResponse.json({ success: true, sent: 0, reason: "no recipients" });
  }

  // ── Fetch profiles (email + prefs) and filter by opt-in ──────────────────
  const { data: profiles } = await adminClient
    .from("profiles")
    .select("id, email, name, notification_prefs")
    .in("id", recipientIds);

  const eligible = (profiles ?? []).filter((p: { email: string | null; notification_prefs: Record<string, unknown> | null }) => {
    if (!p.email) return false;
    const prefs = (p.notification_prefs ?? {}) as Record<string, unknown>;
    // Default is opt-in (true) if the key isn't stored yet
    return prefs[prefKey] !== false;
  });

  if (eligible.length === 0) {
    return NextResponse.json({ success: true, sent: 0, reason: "all recipients opted out" });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }
  const resend = new Resend(resendKey);

  // ── Build subject + HTML per type ─────────────────────────────────────────
  const callerName = callerProfile.name ?? "A team member";

  function buildEmail(recipientName: string | null): { subject: string; html: string } {
    const hi = `Hi ${recipientName ?? "there"},`;

    if (type === "wo_assigned") {
      const num   = entity.work_order_number ?? "Work Order";
      const title = entity.title ?? "";
      const link  = `${SITE_URL}/dashboard/cmms/work-orders`;
      return {
        subject: `Work order assigned: ${num}`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
            <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Work Order Assigned</h2>
            <p style="margin:0 0 4px;color:#475569">${hi}</p>
            <p style="margin:0 0 24px;color:#475569">
              ${callerName} assigned you to <strong>${num}${title ? ` — ${title}` : ""}</strong>.
            </p>
            <a href="${link}" style="display:inline-block;padding:12px 24px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
              View Work Order
            </a>
          </div>`,
      };
    }

    if (type === "wo_status_changed") {
      const num    = entity.work_order_number ?? "Work Order";
      const title  = entity.title ?? "";
      const status = ((entity.status as string) ?? "").replace(/_/g, " ");
      const link   = `${SITE_URL}/dashboard/cmms/work-orders`;
      return {
        subject: `Work order status updated: ${num}`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
            <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Work Order Status Changed</h2>
            <p style="margin:0 0 4px;color:#475569">${hi}</p>
            <p style="margin:0 0 24px;color:#475569">
              <strong>${num}${title ? ` — ${title}` : ""}</strong> status was changed to
              <strong>${status}</strong> by ${callerName}.
            </p>
            <a href="${link}" style="display:inline-block;padding:12px 24px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
              View Work Order
            </a>
          </div>`,
      };
    }

    if (type === "approved" || type === "rejected") {
      const isApproved = type === "approved";
      const num = (entity.requisition_number ?? entity.po_number ?? "Request") as string;
      const entityLabel = entityType === "requisition" ? "Purchase Requisition" : "Purchase Order";
      const link = entityType === "requisition"
        ? `${SITE_URL}/dashboard/po/requisitions`
        : `${SITE_URL}/dashboard/po/orders`;
      const color = isApproved ? "#16a34a" : "#dc2626";
      const verb  = isApproved ? "approved" : "rejected";
      return {
        subject: `${entityLabel} ${verb}: ${num}`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
            <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">${entityLabel} ${isApproved ? "Approved" : "Rejected"}</h2>
            <p style="margin:0 0 4px;color:#475569">${hi}</p>
            <p style="margin:0 0 24px;color:#475569">
              Your ${entityLabel} <strong>${num}</strong> has been <strong style="color:${color}">${verb}</strong> by ${callerName}.
            </p>
            <a href="${link}" style="display:inline-block;padding:12px 24px;background:${color};color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
              View ${entityLabel}
            </a>
          </div>`,
      };
    }

    if (type === "new_maintenance_request") {
      const title = (entity.title ?? "Maintenance Request") as string;
      const num   = (entity.request_number ?? "") as string;
      const link  = `${SITE_URL}/dashboard/cmms/work-orders`;
      return {
        subject: `New maintenance request: ${title}`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
            <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">New Maintenance Request</h2>
            <p style="margin:0 0 4px;color:#475569">${hi}</p>
            <p style="margin:0 0 24px;color:#475569">
              ${callerName} submitted a new maintenance request: <strong>${num ? `${num} — ` : ""}${title}</strong>.
            </p>
            <a href="${link}" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
              Review Request
            </a>
          </div>`,
      };
    }

    return { subject: "Notification from Equipt", html: `<p>${hi}</p>` };
  }

  let sent = 0;
  for (const profile of eligible) {
    const { subject, html } = buildEmail((profile as { name?: string | null }).name ?? null);
    const emailResult = await resend.emails.send({
      from: FROM,
      to: profile.email as string,
      subject,
      html,
    });
    if (!emailResult.error) sent++;
  }

  return NextResponse.json({ success: true, sent });
}
