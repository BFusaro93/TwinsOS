import { NextResponse } from "next/server";
import { insertEmailActivity } from "@/lib/email/log-email-activity";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { assertOrgWritable } from "@/lib/org-writable";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import {
  buildClientMergeVars,
  orgEmailFrom,
  resolveMergeTags,
  sendClientEmail,
} from "@/lib/email/send";
import { resolveReplyTo } from "@/lib/email/reply-to";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";
import { logger } from "@/lib/logger";
import { allRecipientsBouncedMessage, findBouncedAddresses } from "@/lib/email/bounced-addresses";

const log = logger.child("ticket-send-email");

const bodySchema = z.object({
  to: z.string().trim().email().max(320).optional(),
  subject: z.string().trim().min(1).max(500),
  bodyHtml: z.string().min(1).max(500_000),
  statusAfter: z.enum(["open", "on_hold", "pending", "closed"]).optional(),
});

/**
 * POST /api/crm/tickets/[id]/send-email
 *
 * Emails the ticket's client from the ticket detail sheet. This is a SERVICE
 * email (a reply about their own ticket): do_not_market is not consulted and
 * no unsubscribe footer is added, but a hard-bounced recipient address
 * (crm_email_bounces) blocks it — typing a different, corrected address works.
 *
 * The sent email is logged as a client_activity row (type 'email') linked to
 * the ticket via ref_table/ref_id, so the Resend webhook's delivered/bounced
 * stamps (matched on resend_message_id) show up on the ticket's history.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = (await getEffectiveOrgId(supabase)) ?? profile.org_id;

  // Same gate as the client send-email route (email_activity_send), plus the
  // ticket permission, so a role that can't work tickets can't email from one.
  // Called through the client, not detached: supabase.rpc reads `this`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = (fn: string, args: Record<string, unknown>) => (supabase as any).rpc(fn, args);
  const [{ data: canEmail }, { data: canTickets }] = await Promise.all([
    rpc("has_settings_permission", { p_key: "email_activity_send" }),
    rpc("has_settings_permission", { p_key: "tickets_view_modify" }),
  ]);
  if (!canEmail || !canTickets) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // A read-only (canceled / expired-trial) org may only send collections.
  const notWritable = await assertOrgWritable(createServiceClient(), orgId);
  if (notWritable) return notWritable;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid subject and message are required" }, { status: 400 });
  }
  const input = parsed.data;
  if (!input.bodyHtml.trim()) {
    return NextResponse.json({ error: "subject and bodyHtml are required" }, { status: 400 });
  }

  const { id: ticketId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ticket } = await (supabase as any)
    .from("crm_tickets")
    .select("id, org_id, client_id, status, ticket_number, category")
    .eq("id", ticketId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  if (!ticket.client_id) {
    return NextResponse.json({ error: "This ticket has no client to email" }, { status: 422 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: client } = await (supabase as any)
    .from("clients")
    .select(`
      id, display_name, first_name, last_name, primary_email, phones, primary_phone,
      account_number, invoice_delivery, balance_outstanding_cents,
      billing_address, billing_city, billing_state, billing_zip,
      service_address, service_city, service_state, service_zip,
      turf_sqft, gross_sqft, mulch_bed_sqft, yards_of_mulch,
      linear_ft_perimeter, linear_ft_edging, gate_lock_code, notes_to_crew,
      referred_by,
      sales_rep:crm_employees!clients_sales_rep_id_fkey(first_name,last_name),
      referring_client:referred_by_client_id(display_name)
    `)
    .eq("id", ticket.client_id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const override = input.to?.trim() || null;
  const recipient = override ?? (client.primary_email as string | null);
  if (!recipient) {
    return NextResponse.json({ error: "Client has no email address on file" }, { status: 422 });
  }
  // A hard-bounced address is blocked whichever way it got here (stored or
  // typed); a different, corrected address isn't on the bounce list.
  if ((await findBouncedAddresses(orgId, [recipient])).size > 0) {
    return NextResponse.json({ error: allRecipientsBouncedMessage([recipient]) }, { status: 422 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (supabase as any)
    .from("organizations")
    .select("name, address")
    .eq("id", orgId)
    .single();

  const salesRep = client.sales_rep as { first_name: string; last_name: string } | null;
  const referringClient = client.referring_client as { display_name: string } | null;
  const clientForMerge = {
    displayName: client.display_name,
    firstName: client.first_name,
    lastName: client.last_name,
    balanceOutstandingCents: client.balance_outstanding_cents,
    primaryEmail: client.primary_email,
    phones: client.phones?.length
      ? client.phones
      : client.primary_phone
        ? [{ phone: client.primary_phone, type: "cell" }]
        : client.phones,
    accountNumber: client.account_number,
    invoiceDelivery: client.invoice_delivery,
    billingAddress: client.billing_address,
    billingCity: client.billing_city,
    billingState: client.billing_state,
    billingZip: client.billing_zip,
    serviceAddress: client.service_address,
    serviceCity: client.service_city,
    serviceState: client.service_state,
    serviceZip: client.service_zip,
    turfSqft: client.turf_sqft,
    grossSqft: client.gross_sqft,
    mulchBedSqft: client.mulch_bed_sqft,
    yardsOfMulch: client.yards_of_mulch,
    linearFtPerimeter: client.linear_ft_perimeter,
    linearFtEdging: client.linear_ft_edging,
    gateLockCode: client.gate_lock_code,
    notesToCrew: client.notes_to_crew,
    salesRepName: salesRep ? `${salesRep.first_name} ${salesRep.last_name}`.trim() : null,
    referringClientName: referringClient?.display_name ?? client.referred_by ?? null,
  };
  const orgForMerge = {
    name: org?.name ?? null,
    addressPhone: org?.address?.phone ?? null,
    addressStreet: org?.address?.street ?? null,
    addressCity: org?.address?.city ?? null,
    addressState: org?.address?.state ?? null,
    addressZip: org?.address?.zip ?? null,
    timeZone: await getOrgTimeZone(supabase, orgId),
  };

  // Subject is plain text (raw values); body is HTML (escaped values).
  const htmlVars = buildClientMergeVars(clientForMerge, orgForMerge);
  const subjectVars = buildClientMergeVars(clientForMerge, orgForMerge, { escape: false });
  const resolvedSubject = resolveMergeTags(input.subject, subjectVars);
  const resolvedBody = resolveMergeTags(input.bodyHtml, htmlVars);

  const replyTo = await resolveReplyTo(supabase, { orgId, mode: "company", userEmail: user.email });

  let resendId: string | null = null;
  try {
    const sent = await sendClientEmail({
      to: recipient,
      subject: resolvedSubject,
      html: resolvedBody,
      from: orgEmailFrom(org?.name),
      replyTo,
      unsubscribeUrl: null,
    });
    resendId = sent.resendId;
  } catch (err) {
    log.error("ticket email send failed", { ticketId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send email" },
      { status: 500 }
    );
  }

  // Record the send. Failure here must not report the (already delivered)
  // email as failed, so it is logged and surfaced as a warning instead.
  const nowIso = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: logErr } = await insertEmailActivity(supabase, {
    org_id: orgId,
    client_id: ticket.client_id,
    activity_type: "email",
    subject: resolvedSubject,
    body: `Sent to ${recipient} (Ticket #${ticket.ticket_number})`,
    sent_to: recipient,
    resend_message_id: resendId,
    ref_id: ticket.id,
    ref_table: "crm_tickets",
    occurred_at: nowIso,
    created_by: user.id,
  }, { html: resolvedBody });
  if (logErr) log.error("client_activity insert failed", { ticketId, error: logErr.message });

  // Optional status change after sending.
  let statusChanged = false;
  if (input.statusAfter && input.statusAfter !== ticket.status) {
    const patch: Record<string, unknown> = { status: input.statusAfter };
    if (input.statusAfter === "closed") patch.closed_at = nowIso;
    else if (ticket.status === "closed") patch.closed_at = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: statusRows, error: statusErr } = await (supabase as any)
      .from("crm_tickets")
      .update(patch)
      .eq("id", ticket.id)
      .eq("org_id", orgId)
      .eq("status", ticket.status)
      .select("id");
    if (statusErr) log.error("ticket status update failed", { ticketId, error: statusErr.message });
    // Zero rows = someone else changed the status meanwhile; don't fire ticket_closed for it.
    else statusChanged = (statusRows?.length ?? 0) > 0;
  }

  // Returned so the client hook can fire ticket_closed / ticket_reopened — the
  // same automation triggers every other status change path fires.
  const wasClosed = statusChanged && input.statusAfter === "closed";
  const wasReopened = statusChanged && ticket.status === "closed" && input.statusAfter !== "closed";

  return NextResponse.json({
    success: true,
    resendId,
    statusChanged,
    wasClosed,
    wasReopened,
    clientId: ticket.client_id,
    category: ticket.category ?? null,
    logged: !logErr,
  });
}
