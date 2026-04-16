/**
 * POST /api/approval-requests/notify
 *
 * Sends an approval-request email to every approver whose row for this entity
 * has status = "pending". Called by useSubmitForApproval immediately after it
 * inserts the approval_requests rows.
 *
 * Body: { entityId: string; entityType: "purchase_order" | "requisition" }
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { formatCurrency } from "@/lib/utils";

export async function POST(request: Request) {
  // 1. Verify caller is authenticated
  const supabase = await createServerClient();
  const {
    data: { user },
    error: sessionErr,
  } = await supabase.auth.getUser();
  if (sessionErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { entityId?: string; entityType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { entityId, entityType } = body;
  if (!entityId || !entityType) {
    return NextResponse.json({ error: "entityId and entityType are required" }, { status: 400 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 2. Fetch the entity for display info
  const table = entityType === "requisition" ? "requisitions" : "purchase_orders";
  const { data: entity } = await adminClient
    .from(table)
    .select("*")
    .eq("id", entityId)
    .single();

  const entityNumber =
    entityType === "requisition"
      ? (entity?.requisition_number ?? "Requisition")
      : (entity?.po_number ?? "Purchase Order");

  // Compute grand total for display (grand_total is stored in cents)
  const grandTotalDisplay = entity?.grand_total
    ? formatCurrency(entity.grand_total as number)
    : "";

  // 3. Fetch pending approval requests for this entity
  const { data: requests, error: reqErr } = await adminClient
    .from("approval_requests")
    .select("id, approver_id, approver_name, order")
    .eq("entity_id", entityId)
    .eq("status", "pending")
    .order("order", { ascending: true });

  if (reqErr || !requests || requests.length === 0) {
    // Nothing to notify — not an error
    return NextResponse.json({ success: true, sent: 0 });
  }

  // 4. Fetch approver emails from profiles
  const approverIds = [...new Set(requests.map((r) => r.approver_id))];
  const { data: profiles } = await adminClient
    .from("profiles")
    .select("id, email, name")
    .in("id", approverIds);

  const emailMap = new Map<string, string>();
  for (const p of profiles ?? []) {
    if (p.email) emailMap.set(p.id, p.email);
  }

  // 5. Fetch submitter name
  const { data: submitterProfile } = await adminClient
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();
  const submitterName = submitterProfile?.name ?? "A team member";

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://twins-os.vercel.app";
  const entityPath = entityType === "requisition" ? "po/requisitions" : "po/orders";
  const deepLink = `${siteUrl}/dashboard/${entityPath}`;

  const resend = new Resend(process.env.RESEND_API_KEY!);
  const entityLabel = entityType === "requisition" ? "Purchase Requisition" : "Purchase Order";

  let sent = 0;
  for (const req of requests) {
    const toEmail = emailMap.get(req.approver_id);
    if (!toEmail) continue;

    await resend.emails.send({
      from: "Equipt <noreply@twinslawnservice.com>",
      to: toEmail,
      subject: `Action required: ${entityNumber} needs your approval`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Approval request</h2>
          <p style="margin:0 0 4px;color:#475569">
            Hi ${req.approver_name ?? "there"},
          </p>
          <p style="margin:0 0 24px;color:#475569">
            ${submitterName} submitted <strong>${entityLabel} ${entityNumber}</strong>${grandTotalDisplay ? ` for <strong>${grandTotalDisplay}</strong>` : ""} and it needs your approval.
          </p>
          <a
            href="${deepLink}"
            style="display:inline-block;padding:12px 24px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600"
          >
            Review &amp; Approve
          </a>
          <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">
            Log in to Equipt to approve or reject this request.
          </p>
        </div>
      `,
    });
    sent++;
  }

  return NextResponse.json({ success: true, sent });
}
