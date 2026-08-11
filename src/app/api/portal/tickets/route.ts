import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createServiceClient } from "@/lib/supabase/server";
import { getEffectiveTicketCategories } from "@/lib/portal/ticket-categories";
import { notifyStaffOfNewTicket } from "@/lib/ticket-notify";
import type { PortalSettingsRow } from "@/lib/portal/portal-db";

const FROM = "Twins Lawn Service <noreply@twinslawnservice.com>";

export async function GET() {
  const ctx = await getPortalContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settings } = await (supabase as any)
    .from("client_portal_settings")
    .select("allow_tickets, portal_ticket_categories")
    .eq("org_id", ctx.orgId)
    .single() as { data: Pick<PortalSettingsRow, "allow_tickets" | "portal_ticket_categories"> | null };

  const { data: tickets } = await supabase
    .from("crm_tickets")
    .select("id, ticket_number, subject, category, status, priority, created_at, body")
    .eq("client_id", ctx.clientId)
    .eq("org_id", ctx.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  const categories = await getEffectiveTicketCategories(supabase, ctx.orgId, settings?.portal_ticket_categories);

  return NextResponse.json({
    tickets: tickets ?? [],
    allowTickets: settings?.allow_tickets ?? false,
    categories,
  });
}

export async function POST(req: Request) {
  const ctx = await getPortalContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();

  // Fetch settings + client info in parallel
  const [settingsRes, clientRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("client_portal_settings")
      .select("allow_tickets, portal_ticket_categories, support_email, company_name")
      .eq("org_id", ctx.orgId)
      .single() as Promise<{ data: Pick<PortalSettingsRow, "allow_tickets" | "portal_ticket_categories" | "support_email" | "company_name"> | null }>,

    supabase
      .from("clients")
      .select("display_name, first_name, sales_rep_id")
      .eq("id", ctx.clientId)
      .single(),
  ]);

  const settings = settingsRes.data;

  // Only block if settings explicitly disable tickets; missing row = allowed
  if (settings !== null && settings?.allow_tickets === false) {
    return NextResponse.json({ error: "Tickets are not enabled for this portal" }, { status: 403 });
  }

  const { subject, body, category } = await req.json();

  if (!subject?.trim()) {
    return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  }

  const allowedCategories = await getEffectiveTicketCategories(supabase, ctx.orgId, settings?.portal_ticket_categories);

  if (!category || !allowedCategories.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const { data: ticket, error } = await supabase
    .from("crm_tickets")
    .insert({
      org_id: ctx.orgId,
      client_id: ctx.clientId,
      subject: subject.trim(),
      body: body?.trim() ?? null,
      category,
      type: "note",
      status: "open",
      priority: "normal",
    })
    .select("id, ticket_number")
    .single();

  if (error || !ticket) {
    console.error("[portal/tickets] Failed to create ticket:", error);
    return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });
  }

  await supabase.from("client_activity").insert({
    org_id: ctx.orgId,
    client_id: ctx.clientId,
    activity_type: "ticket",
    subject: subject.trim(),
    body: body?.trim() ?? null,
    status: "open",
    ref_id: ticket.id,
    ref_table: "crm_tickets",
  });

  // Staff-facing bell + gated email — separate from the rep/support-email
  // notice sent below, which is a fixed, unconditional "someone should look
  // at this" notice rather than a personal, opt-out-able preference.
  await notifyStaffOfNewTicket(supabase, {
    orgId: ctx.orgId,
    ticketId: ticket.id,
    ticketNumber: ticket.ticket_number,
    subject: subject.trim(),
    assignedToName: null,
    createdByUserId: null,
  });

  // ── Send notification email ─────────────────────────────────────────────────
  // Priority: sales rep assigned to client → support_email in portal settings → skip
  const client = clientRes.data;
  let notifyEmail: string | null = null;
  let notifyName: string | null = null;

  if (client?.sales_rep_id) {
    const { data: rep } = await supabase
      .from("profiles")
      .select("email, name")
      .eq("id", client.sales_rep_id)
      .single();
    if (rep?.email) {
      notifyEmail = rep.email;
      notifyName = rep.name;
    }
  }

  if (!notifyEmail && settings?.support_email) {
    notifyEmail = settings.support_email;
    notifyName = settings.company_name ?? null;
  }

  if (notifyEmail) {
    const clientName = client?.display_name ?? "A client";
    const orgName = settings?.company_name ?? "Your company";
    const ticketUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/crm/tickets`;
    const resend = new Resend(process.env.RESEND_API_KEY!);

    // Best-effort — don't fail the ticket if email errors
    resend.emails.send({
      from: FROM,
      to: notifyEmail,
      subject: `[Ticket #${ticket.ticket_number}] ${subject.trim()} — ${clientName}`,
      html: buildTicketNotificationEmail({
        ticketNumber: ticket.ticket_number,
        subject: subject.trim(),
        body: body?.trim() ?? null,
        category,
        clientName,
        recipientName: notifyName ?? notifyEmail,
        orgName,
        ticketUrl,
      }),
    }).catch((err) => {
      console.error("[portal/tickets] Notification email error:", err);
    });
  }

  return NextResponse.json({ success: true, ticket });
}

function buildTicketNotificationEmail({
  ticketNumber,
  subject,
  body,
  category,
  clientName,
  recipientName,
  orgName,
  ticketUrl,
}: {
  ticketNumber: number;
  subject: string;
  body: string | null;
  category: string;
  clientName: string;
  recipientName: string;
  orgName: string;
  ticketUrl: string;
}) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">
        <tr>
          <td style="background:#60ab45;padding:20px 32px">
            <p style="margin:0;color:#fff;font-size:18px;font-weight:700">${orgName}</p>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px">New client portal ticket</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px">
            <p style="margin:0 0 16px;font-size:15px;color:#475569">Hi ${recipientName},</p>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569">
              <strong>${clientName}</strong> submitted a new support ticket from the client portal.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px">
              <tr>
                <td style="padding:16px 20px">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8">Ticket #${ticketNumber}</p>
                  <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#0f172a">${subject}</p>
                  <p style="margin:0 0 8px;font-size:13px;color:#64748b">
                    <strong>Category:</strong> ${category}
                  </p>
                  ${body ? `<p style="margin:8px 0 0;font-size:13px;color:#475569;line-height:1.6;white-space:pre-wrap">${body}</p>` : ""}
                </td>
              </tr>
            </table>

            <a href="${ticketUrl}" style="display:inline-block;background:#60ab45;color:#fff;text-decoration:none;padding:11px 24px;border-radius:8px;font-size:14px;font-weight:600">
              View in CRM →
            </a>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px">
            <p style="margin:0;font-size:12px;color:#94a3b8">
              This notification was sent because you are ${clientName}'s assigned account manager in ${orgName}.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
