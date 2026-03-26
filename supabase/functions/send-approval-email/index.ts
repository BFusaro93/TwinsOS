/**
 * send-approval-email — Supabase Edge Function (Deno)
 *
 * Triggered by a Postgres pg_net HTTP call from the
 * fn_notify_approval_email trigger whenever a requisition or
 * purchase order moves into an approval-relevant status.
 *
 * Environment variables required (set via `supabase secrets set`):
 *   RESEND_API_KEY          — Resend API key (re_xxxxxxxxxxxx)
 *   FROM_EMAIL              — Verified sender address (e.g. noreply@twinsOS.com)
 *   APP_URL                 — Public app URL (e.g. https://app.twinsOS.com)
 *
 * Automatically available in Supabase Edge Functions:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TriggerPayload {
  table: "requisitions" | "purchase_orders";
  record: Record<string, unknown>;
  old_record: Record<string, unknown>;
}

interface Profile {
  id: string;
  name: string;
  email: string;
}

interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

// ── Config ────────────────────────────────────────────────────────────────────

const RESEND_API_KEY          = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL              = Deno.env.get("FROM_EMAIL")     ?? "noreply@twinsOS.com";
const APP_URL                 = Deno.env.get("APP_URL")        ?? "https://app.twinsOS.com";
const SUPABASE_URL            = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Helpers ───────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "");
}

function formatCurrency(cents: unknown): string {
  const n = typeof cents === "number" ? cents : Number(cents ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
}

/**
 * Wraps email body content in a full HTML document with the TwinsOS header
 * and footer. Uses inline styles throughout for email-client compatibility.
 */
function emailShell(subject: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background-color:#f8fafc;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation"
               style="background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;max-width:600px;width:100%;">

          <!-- Header bar -->
          <tr>
            <td style="background-color:#1e293b;padding:20px 32px;">
              <span style="font-size:22px;font-weight:700;color:#60ab45;letter-spacing:-0.5px;">TwinsOS</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                TwinsOS &mdash; Operations &amp; Maintenance Platform<br/>
                This is an automated notification. Please do not reply to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(href: string, label: string): string {
  return `<a href="${href}"
     style="display:inline-block;margin-top:24px;padding:12px 24px;
            background-color:#60ab45;color:#ffffff;text-decoration:none;
            border-radius:6px;font-size:14px;font-weight:600;"
   >${label}</a>`;
}

function metaTable(rows: [string, string][]): string {
  const trs = rows
    .map(
      ([label, value]) =>
        `<tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;width:140px;vertical-align:top;">${label}</td>
          <td style="padding:6px 0;font-size:13px;color:#1e293b;font-weight:500;">${value}</td>
        </tr>`
    )
    .join("");
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">${trs}</table>`;
}

// ── Email templates ───────────────────────────────────────────────────────────

function buildApprovalRequestedEmail(opts: {
  approverName: string;
  requesterName: string;
  entityLabel: string;
  entityNumber: string;
  title: string;
  vendorName: string;
  grandTotal: number;
  link: string;
}): string {
  const body = `
    <p style="margin:0 0 4px;font-size:16px;color:#1e293b;">Hi ${opts.approverName},</p>
    <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
      <strong>${opts.requesterName}</strong> has submitted a
      <strong>${opts.entityLabel}</strong> that requires your approval.
    </p>

    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:20px;margin-bottom:24px;">
      ${metaTable([
        ["Number",    opts.entityNumber],
        ["Title",     opts.title],
        ["Vendor",    opts.vendorName || "—"],
        ["Amount",    formatCurrency(opts.grandTotal)],
        ["Submitted by", opts.requesterName],
      ])}
    </div>

    ${ctaButton(opts.link, "Review & Approve")}

    <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;">
      You are receiving this because you are an approver in your organization's workflow.
    </p>`;

  return emailShell(`[Action Required] ${opts.entityLabel} ${opts.entityNumber} needs your approval`, body);
}

function buildApprovedEmail(opts: {
  requesterName: string;
  entityLabel: string;
  entityNumber: string;
  title: string;
  vendorName: string;
  grandTotal: number;
  link: string;
}): string {
  const body = `
    <p style="margin:0 0 4px;font-size:16px;color:#1e293b;">Hi ${opts.requesterName},</p>
    <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
      Great news &mdash; your <strong>${opts.entityLabel}</strong> has been
      <span style="color:#16a34a;font-weight:600;">approved</span> and is ready to proceed.
    </p>

    <div style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:20px;margin-bottom:24px;">
      ${metaTable([
        ["Number", opts.entityNumber],
        ["Title",  opts.title],
        ["Vendor", opts.vendorName || "—"],
        ["Amount", formatCurrency(opts.grandTotal)],
        ["Status", "Approved"],
      ])}
    </div>

    ${ctaButton(opts.link, `View ${opts.entityLabel}`)}`;

  return emailShell(`${opts.entityLabel} ${opts.entityNumber} has been approved`, body);
}

function buildRejectedEmail(opts: {
  requesterName: string;
  entityLabel: string;
  entityNumber: string;
  title: string;
  vendorName: string;
  grandTotal: number;
  rejectionComment: string;
  link: string;
}): string {
  const commentSection = opts.rejectionComment
    ? `<div style="background-color:#fff7ed;border-left:3px solid #f97316;padding:12px 16px;margin:16px 0;border-radius:0 4px 4px 0;">
         <p style="margin:0;font-size:13px;color:#9a3412;font-style:italic;">"${opts.rejectionComment}"</p>
       </div>`
    : "";

  const body = `
    <p style="margin:0 0 4px;font-size:16px;color:#1e293b;">Hi ${opts.requesterName},</p>
    <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
      Your <strong>${opts.entityLabel}</strong> was
      <span style="color:#dc2626;font-weight:600;">not approved</span>.
      Please review the details below, make any necessary changes, and resubmit.
    </p>

    <div style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:20px;margin-bottom:8px;">
      ${metaTable([
        ["Number", opts.entityNumber],
        ["Title",  opts.title],
        ["Vendor", opts.vendorName || "—"],
        ["Amount", formatCurrency(opts.grandTotal)],
        ["Status", "Rejected"],
      ])}
    </div>

    ${commentSection}

    ${ctaButton(opts.link, "Review & Revise")}`;

  return emailShell(`${opts.entityLabel} ${opts.entityNumber} was not approved`, body);
}

// ── Email dispatch ────────────────────────────────────────────────────────────

async function sendEmail(message: EmailMessage): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to:   message.to,
      subject: message.subject,
      html: message.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

// ── Profile lookup ────────────────────────────────────────────────────────────

async function getProfile(
  supabase: ReturnType<typeof createClient>,
  userId: string | null | undefined
): Promise<Profile | null> {
  if (!userId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, name, email")
    .eq("id", userId)
    .single();
  return data as Profile | null;
}

/**
 * Find the next pending approver for an entity.
 *
 * Strategy (in priority order):
 *   1. Query approval_requests for a 'pending' row — the app populates this
 *      when moving to pending_approval.
 *   2. Fall back to approval_flow_steps: find the org's flow for this entity
 *      type and return the assigned_user_id on the first step.
 *   3. Fall back to any org user with the required_role on the first step.
 */
async function findNextApprover(
  supabase: ReturnType<typeof createClient>,
  entityType: "requisition" | "purchase_order",
  entityId: string,
  orgId: string
): Promise<Profile | null> {
  // Strategy 1: approval_requests already populated
  const { data: arRows } = await supabase
    .from("approval_requests")
    .select("approver_id")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("status", "pending")
    .order("order", { ascending: true })
    .limit(1);

  if (arRows && arRows.length > 0) {
    return getProfile(supabase, arRows[0].approver_id as string);
  }

  // Strategy 2: look up the flow for this org and entity type
  const { data: flows } = await supabase
    .from("approval_flows")
    .select("id")
    .eq("org_id", orgId)
    .eq("entity_type", entityType)
    .is("deleted_at", null)
    .limit(1);

  if (!flows || flows.length === 0) return null;

  const { data: steps } = await supabase
    .from("approval_flow_steps")
    .select("assigned_user_id, required_role")
    .eq("flow_id", flows[0].id)
    .order("order", { ascending: true })
    .limit(1);

  if (!steps || steps.length === 0) return null;

  const step = steps[0] as { assigned_user_id: string | null; required_role: string };

  // Strategy 2a: specific user assigned to this step
  if (step.assigned_user_id) {
    return getProfile(supabase, step.assigned_user_id);
  }

  // Strategy 2b: any user in the org with the required role
  const { data: roleUsers } = await supabase
    .from("profiles")
    .select("id, name, email")
    .eq("org_id", orgId)
    .eq("role", step.required_role)
    .limit(1);

  return roleUsers && roleUsers.length > 0 ? (roleUsers[0] as Profile) : null;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!RESEND_API_KEY) {
    // Resend not configured — log and return 200 so pg_net doesn't retry
    console.warn("RESEND_API_KEY not set; skipping email notification");
    return new Response(JSON.stringify({ skipped: "no_api_key" }), { status: 200 });
  }

  let payload: TriggerPayload;
  try {
    payload = await req.json() as TriggerPayload;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { table, record, old_record } = payload;
  const oldStatus = str(old_record?.status);
  const newStatus = str(record?.status);

  if (oldStatus === newStatus) {
    return new Response(JSON.stringify({ skipped: "no_status_change" }), { status: 200 });
  }

  const relevantStatuses = ["pending_approval", "pending", "approved", "rejected"];
  if (!relevantStatuses.includes(newStatus)) {
    return new Response(JSON.stringify({ skipped: "irrelevant_status" }), { status: 200 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const entityType:   "requisition" | "purchase_order" = table === "requisitions" ? "requisition" : "purchase_order";
  const entityLabel   = entityType === "requisition"    ? "Requisition"            : "Purchase Order";
  const entityNumber  = str(record.requisition_number ?? record.po_number);
  const entityId      = str(record.id);
  const orgId         = str(record.org_id);
  const title         = str(record.title ?? record.po_number);
  const vendorName    = str(record.vendor_name);
  const grandTotal    = Number(record.grand_total ?? 0);
  const requesterId   = str(record.requested_by_id ?? record.created_by ?? "");
  const appLink       = `${APP_URL}/${entityType === "requisition" ? "po/requisitions" : "po/orders"}`;

  const messages: EmailMessage[] = [];

  // ── pending_approval / pending — notify the next approver ──────────────────
  if (newStatus === "pending_approval" || newStatus === "pending") {
    const approver = await findNextApprover(supabase, entityType, entityId, orgId);
    if (approver) {
      const requesterProfile = await getProfile(supabase, requesterId);
      messages.push({
        to:      approver.email,
        subject: `[Action Required] ${entityLabel} ${entityNumber} needs your approval`,
        html:    buildApprovalRequestedEmail({
          approverName:  approver.name,
          requesterName: requesterProfile?.name ?? "A colleague",
          entityLabel,
          entityNumber,
          title,
          vendorName,
          grandTotal,
          link: appLink,
        }),
      });
    }
  }

  // ── approved — notify the requester ────────────────────────────────────────
  else if (newStatus === "approved") {
    const requester = await getProfile(supabase, requesterId);
    if (requester) {
      messages.push({
        to:      requester.email,
        subject: `${entityLabel} ${entityNumber} has been approved`,
        html:    buildApprovedEmail({
          requesterName: requester.name,
          entityLabel,
          entityNumber,
          title,
          vendorName,
          grandTotal,
          link: appLink,
        }),
      });
    }
  }

  // ── rejected — notify the requester with the latest rejection comment ───────
  else if (newStatus === "rejected") {
    const requester = await getProfile(supabase, requesterId);
    if (requester) {
      // Pull the most recent rejection comment from approval_requests
      const { data: rejRows } = await supabase
        .from("approval_requests")
        .select("comment")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("status", "rejected")
        .order("decided_at", { ascending: false })
        .limit(1);

      const rejectionComment = str(rejRows?.[0]?.comment ?? "");

      messages.push({
        to:      requester.email,
        subject: `${entityLabel} ${entityNumber} was not approved`,
        html:    buildRejectedEmail({
          requesterName:    requester.name,
          entityLabel,
          entityNumber,
          title,
          vendorName,
          grandTotal,
          rejectionComment,
          link: appLink,
        }),
      });
    }
  }

  if (messages.length === 0) {
    return new Response(JSON.stringify({ skipped: "no_recipients" }), { status: 200 });
  }

  // Send all messages, collecting individual errors
  const results = await Promise.allSettled(messages.map(sendEmail));
  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => r.reason?.message ?? String(r.reason));

  if (errors.length > 0) {
    console.error("Email send failures:", errors);
    return new Response(
      JSON.stringify({ sent: results.length - errors.length, errors }),
      { status: 500 }
    );
  }

  console.log(`Sent ${messages.length} approval email(s) for ${entityLabel} ${entityNumber}`);
  return new Response(JSON.stringify({ sent: messages.length }), { status: 200 });
});
