/**
 * POST /api/notifications/email
 *
 * Sends transactional email notifications and inserts in-app notification rows
 * for events that happen outside the approval-requests flow.
 *
 * Called best-effort (fire-and-forget) from client hooks after mutations.
 *
 * Body:
 *   type        — event type string (see PREF_KEY map below)
 *   entityId    — UUID of the affected entity
 *   entityType  — "work_order" | "requisition" | "purchase_order" | "maintenance_request"
 *   extra       — optional extra context (e.g. comment body text)
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

type NotifType =
  | "wo_created"
  | "wo_assigned"
  | "wo_status_changed"
  | "wo_comment"
  | "approved"
  | "rejected"
  | "new_maintenance_request";

// Maps event type → pref key that gates email to the directly-affected user
const USER_PREF_KEY: Record<NotifType, string | null> = {
  wo_created:              null,                          // no personal pref — admin-only
  wo_assigned:             "emailWorkOrderAssigned",
  wo_status_changed:       "emailWorkOrderStatusChanged",
  wo_comment:              "emailWorkOrderComment",
  approved:                "emailRequisitionApproved",
  rejected:                "emailRequisitionRejected",
  new_maintenance_request: "emailNewMaintenanceRequest",
};

// Maps event type → pref key that gates email to admins who want ALL WO events
const ADMIN_PREF_KEY: Record<NotifType, string | null> = {
  wo_created:              "emailAdminWoCreated",
  wo_assigned:             "emailAdminWoCreated",   // WO creation includes assignment
  wo_status_changed:       "emailAdminWoStatusChanged",
  wo_comment:              "emailAdminWoComment",
  approved:                null,
  rejected:                null,
  new_maintenance_request: null,
};

// Maps event type → in-app pref key (used when inserting notifications rows)
const INAPP_PREF_KEY: Record<NotifType, string | null> = {
  wo_created:              null,
  wo_assigned:             null,   // in-app is derived client-side for assigned
  wo_status_changed:       null,   // same
  wo_comment:              "inAppWorkOrderComment",
  approved:                null,
  rejected:                null,
  new_maintenance_request: null,
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
    .select("org_id, name, role")
    .eq("id", user.id)
    .single();
  if (!callerProfile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  }

  let body: { type?: string; entityId?: string; entityType?: string; extra?: Record<string, string> };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, entityId, entityType, extra = {} } = body;
  if (!type || !entityId || !entityType) {
    return NextResponse.json({ error: "type, entityId, and entityType required" }, { status: 400 });
  }

  if (!(type in USER_PREF_KEY)) {
    return NextResponse.json({ error: `Unknown notification type: ${type}` }, { status: 400 });
  }
  const notifType = type as NotifType;

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
  if (!table) return NextResponse.json({ error: `Unknown entityType: ${entityType}` }, { status: 400 });

  const { data: entity } = await adminClient.from(table).select("*").eq("id", entityId).single();
  if (!entity) return NextResponse.json({ error: "Entity not found" }, { status: 404 });

  // ── Determine direct recipients (users personally affected) ──────────────
  const directRecipientIds: string[] = [];

  if (notifType === "wo_assigned" || notifType === "wo_status_changed" || notifType === "wo_comment" || notifType === "wo_created") {
    const ids: string[] = Array.isArray(entity.assigned_to_ids)
      ? (entity.assigned_to_ids as string[])
      : entity.assigned_to_id ? [entity.assigned_to_id as string] : [];
    directRecipientIds.push(...ids.filter((id) => id !== user.id));

  } else if (notifType === "approved" || notifType === "rejected") {
    const submitterId = (entity.requested_by_id ?? entity.created_by) as string | null;
    if (submitterId && submitterId !== user.id) directRecipientIds.push(submitterId);

  } else if (notifType === "new_maintenance_request") {
    const { data: managers } = await adminClient
      .from("profiles")
      .select("id")
      .eq("org_id", callerProfile.org_id)
      .in("role", ["admin", "manager"])
      .neq("id", user.id);
    directRecipientIds.push(...(managers ?? []).map((p: { id: string }) => p.id));
  }

  // ── Determine admin broadcast recipients ──────────────────────────────────
  // Admins who have opted in to "any WO" events get a copy regardless of assignment
  const adminPrefKey = ADMIN_PREF_KEY[notifType];
  let adminRecipientIds: string[] = [];

  if (adminPrefKey) {
    const { data: admins } = await adminClient
      .from("profiles")
      .select("id, notification_prefs")
      .eq("org_id", callerProfile.org_id)
      .eq("role", "admin")
      .neq("id", user.id);

    adminRecipientIds = (admins ?? [])
      .filter((p: { notification_prefs: Record<string, unknown> | null }) => {
        const prefs = (p.notification_prefs ?? {}) as Record<string, unknown>;
        return prefs[adminPrefKey] === true;
      })
      .map((p: { id: string }) => p.id)
      // Don't double-send to admins already in the direct list
      .filter((id: string) => !directRecipientIds.includes(id));
  }

  // ── Handle in-app notifications (notifications table) for wo_comment ──────
  const inAppPrefKey = INAPP_PREF_KEY[notifType];
  if (inAppPrefKey) {
    // Collect all in-app recipients: direct + admins with admin WO comment pref
    const inAppIds = [...new Set([...directRecipientIds, ...adminRecipientIds])];

    if (inAppIds.length > 0) {
      const { data: inAppProfiles } = await adminClient
        .from("profiles")
        .select("id, notification_prefs")
        .in("id", inAppIds);

      const inAppEligible = (inAppProfiles ?? [])
        .filter((p: { notification_prefs: Record<string, unknown> | null }) => {
          const prefs = (p.notification_prefs ?? {}) as Record<string, unknown>;
          return prefs[inAppPrefKey] !== false; // default opt-in
        })
        .map((p: { id: string }) => p.id);

      if (inAppEligible.length > 0) {
        const woNum   = (entity.work_order_number ?? "") as string;
        const woTitle = (entity.title ?? "") as string;
        const commentBody = extra.commentBody ?? "";

        const inAppRows = inAppEligible.map((uid: string) => ({
          org_id:      callerProfile.org_id as string,
          user_id:     uid,
          type:        "wo_comment",
          entity_id:   entityId,
          entity_type: entityType,
          title:       "New Comment",
          message:     `${callerProfile.name ?? "Someone"} commented on ${woNum}${woTitle ? ` — ${woTitle}` : ""}${commentBody ? `: "${commentBody.slice(0, 80)}${commentBody.length > 80 ? "…" : ""}"` : ""}`,
          read:        false,
        }));

        await adminClient.from("notifications").insert(inAppRows);
      }
    }
  }

  // ── Bail early if no email recipients ────────────────────────────────────
  const resendKey = process.env.RESEND_API_KEY;
  const allEmailIds = [...new Set([...directRecipientIds, ...adminRecipientIds])];

  if (allEmailIds.length === 0 || !resendKey) {
    return NextResponse.json({ success: true, sent: 0 });
  }

  // ── Fetch profiles and filter by opt-in ──────────────────────────────────
  const { data: profiles } = await adminClient
    .from("profiles")
    .select("id, email, name, notification_prefs, role")
    .in("id", allEmailIds);

  const userPrefKey = USER_PREF_KEY[notifType];

  const eligible = (profiles ?? []).filter((p: {
    id: string; email: string | null;
    notification_prefs: Record<string, unknown> | null; role: string | null;
  }) => {
    if (!p.email) return false;
    const prefs = (p.notification_prefs ?? {}) as Record<string, unknown>;

    // Admin broadcast recipients: check admin pref key
    if (adminPrefKey && adminRecipientIds.includes(p.id)) {
      return prefs[adminPrefKey] === true;
    }
    // Direct recipients: check user pref key (default opt-in)
    if (userPrefKey) return prefs[userPrefKey] !== false;
    return true;
  });

  if (eligible.length === 0) {
    return NextResponse.json({ success: true, sent: 0, reason: "all opted out" });
  }

  const resend = new Resend(resendKey);
  const callerName = callerProfile.name ?? "A team member";

  function buildEmail(recipientName: string | null, isAdminBroadcast: boolean): { subject: string; html: string } {
    const hi = `Hi ${recipientName ?? "there"},`;
    const adminNote = isAdminBroadcast
      ? `<p style="margin:0 0 8px;font-size:11px;color:#94a3b8">You're receiving this because you have admin notifications enabled for all work orders.</p>`
      : "";

    if (notifType === "wo_created" || notifType === "wo_assigned") {
      const num   = (entity.work_order_number ?? "Work Order") as string;
      const title = (entity.title ?? "") as string;
      const link  = `${SITE_URL}/dashboard/cmms/work-orders`;
      const verb  = notifType === "wo_created" ? "created" : "assigned you to";
      const subjectVerb = notifType === "wo_created" ? "created" : "assigned";
      return {
        subject: `Work order ${subjectVerb}: ${num}`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Work Order ${notifType === "wo_created" ? "Created" : "Assigned"}</h2>
          ${adminNote}<p style="margin:0 0 4px;color:#475569">${hi}</p>
          <p style="margin:0 0 24px;color:#475569">${callerName} ${verb} <strong>${num}${title ? ` — ${title}` : ""}</strong>.</p>
          <a href="${link}" style="display:inline-block;padding:12px 24px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">View Work Order</a>
        </div>`,
      };
    }

    if (notifType === "wo_status_changed") {
      const num    = (entity.work_order_number ?? "Work Order") as string;
      const title  = (entity.title ?? "") as string;
      const status = ((entity.status as string) ?? "").replace(/_/g, " ");
      const link   = `${SITE_URL}/dashboard/cmms/work-orders`;
      return {
        subject: `Work order status updated: ${num}`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Work Order Status Changed</h2>
          ${adminNote}<p style="margin:0 0 4px;color:#475569">${hi}</p>
          <p style="margin:0 0 24px;color:#475569"><strong>${num}${title ? ` — ${title}` : ""}</strong> status was changed to <strong>${status}</strong> by ${callerName}.</p>
          <a href="${link}" style="display:inline-block;padding:12px 24px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">View Work Order</a>
        </div>`,
      };
    }

    if (notifType === "wo_comment") {
      const num   = (entity.work_order_number ?? "Work Order") as string;
      const title = (entity.title ?? "") as string;
      const commentBody = extra.commentBody ?? "";
      const link  = `${SITE_URL}/dashboard/cmms/work-orders`;
      return {
        subject: `New comment on ${num}`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">New Comment on Work Order</h2>
          ${adminNote}<p style="margin:0 0 4px;color:#475569">${hi}</p>
          <p style="margin:0 0 8px;color:#475569">${callerName} commented on <strong>${num}${title ? ` — ${title}` : ""}</strong>:</p>
          ${commentBody ? `<blockquote style="margin:0 0 24px;padding:12px 16px;background:#f8fafc;border-left:4px solid #e2e8f0;border-radius:4px;color:#374151;font-style:italic">${commentBody}</blockquote>` : ""}
          <a href="${link}" style="display:inline-block;padding:12px 24px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">View Work Order</a>
        </div>`,
      };
    }

    if (notifType === "approved" || notifType === "rejected") {
      const isApproved = notifType === "approved";
      const num = ((entity.requisition_number ?? entity.po_number ?? "Request")) as string;
      const entityLabel = entityType === "requisition" ? "Purchase Requisition" : "Purchase Order";
      const link = entityType === "requisition" ? `${SITE_URL}/dashboard/po/requisitions` : `${SITE_URL}/dashboard/po/orders`;
      const color = isApproved ? "#16a34a" : "#dc2626";
      const verb  = isApproved ? "approved" : "rejected";
      return {
        subject: `${entityLabel} ${verb}: ${num}`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">${entityLabel} ${isApproved ? "Approved" : "Rejected"}</h2>
          <p style="margin:0 0 4px;color:#475569">${hi}</p>
          <p style="margin:0 0 24px;color:#475569">Your ${entityLabel} <strong>${num}</strong> has been <strong style="color:${color}">${verb}</strong> by ${callerName}.</p>
          <a href="${link}" style="display:inline-block;padding:12px 24px;background:${color};color:#fff;text-decoration:none;border-radius:6px;font-weight:600">View ${entityLabel}</a>
        </div>`,
      };
    }

    if (notifType === "new_maintenance_request") {
      const title = (entity.title ?? "Maintenance Request") as string;
      const num   = (entity.request_number ?? "") as string;
      const link  = `${SITE_URL}/dashboard/cmms/work-orders`;
      return {
        subject: `New maintenance request: ${title}`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">New Maintenance Request</h2>
          <p style="margin:0 0 4px;color:#475569">${hi}</p>
          <p style="margin:0 0 24px;color:#475569">${callerName} submitted: <strong>${num ? `${num} — ` : ""}${title}</strong>.</p>
          <a href="${link}" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Review Request</a>
        </div>`,
      };
    }

    return { subject: "Notification from Equipt", html: `<p>${hi}</p>` };
  }

  let sent = 0;
  for (const profile of eligible) {
    const isAdminBroadcast = adminRecipientIds.includes(profile.id);
    const { subject, html } = buildEmail((profile as { name?: string | null }).name ?? null, isAdminBroadcast);
    const result = await resend.emails.send({ from: FROM, to: profile.email as string, subject, html });
    if (!result.error) sent++;
  }

  return NextResponse.json({ success: true, sent });
}
