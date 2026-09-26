import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyTwilioRequest, parseTwilioForm } from "@/lib/sms/verify-twilio-request";
import { notifyStaffOfNewTicket, notifyTicketComment } from "@/lib/ticket-notify";
import { getOrgTwilioAuthToken } from "@/lib/twilio/client";
import { logger } from "@/lib/logger";

const log = logger.child("twilio inbound webhook");

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://landscapt.com";

// Twilio's own Advanced Opt-Out feature (on the Messaging Service) normally
// intercepts these keywords before they ever reach this webhook and replies
// with its own confirmation — this list is a defense-in-depth backstop for
// if that setting is ever off, not the primary compliance mechanism.
const OPT_OUT_KEYWORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const OPT_IN_KEYWORDS = new Set(["START", "YES", "UNSTOP"]);
// None of these need a ticket — they're single-word system commands, not
// something a staff member needs to respond to.
const SKIP_TICKET_KEYWORDS = new Set([...OPT_OUT_KEYWORDS, ...OPT_IN_KEYWORDS, "HELP", "INFO"]);
const OPEN_TICKET_STATUSES = ["open", "pending", "on_hold"];

const EMPTY_TWIML = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

function last10Digits(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

/**
 * POST /api/webhooks/twilio/inbound
 *
 * Twilio calls this when a client texts our number back. Logs every inbound
 * reply to client_activity (matched to a client by phone number, scoped to
 * the org owning the inbound MessagingServiceSid when one is configured —
 * see the comment below) and, as a backstop, applies opt-out/opt-in
 * keywords directly to clients.sms_opt_in.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const params = parseTwilioForm(rawBody);
  const signature = request.headers.get("X-Twilio-Signature");
  const url = `${SITE_URL}/api/webhooks/twilio/inbound`;

  const supabase = createServiceClient();

  // Orgs can override their own Twilio Messaging Service SID (see
  // organizations.twilio_messaging_service_sid, used by sendClientSms) —
  // when the inbound webhook's MessagingServiceSid matches a configured
  // org, scope the client lookup to that org so two orgs' clients can never
  // collide on a reused/shared phone number. When no org has that
  // MessagingServiceSid configured (the shared platform sender), the
  // candidates are narrowed to the orgs that send through it — see the
  // client match below. Resolved before
  // signature verification (a plain lookup, no side effects) because which
  // Auth Token verifies the signature depends on the answer — see below.
  const messagingServiceSid = params.MessagingServiceSid;
  let ownerOrgId: string | null = null;
  if (messagingServiceSid) {
    const { data: owningOrg } = await supabase
      .from("organizations")
      .select("id")
      .eq("twilio_messaging_service_sid", messagingServiceSid)
      .maybeSingle();
    ownerOrgId = owningOrg?.id ?? null;
  }

  // Twilio signs a webhook with the Auth Token of whichever account actually
  // owns the resource that triggered it — for a number on an org's own
  // Twilio subaccount, that's the SUBACCOUNT's own token, never the parent's
  // or the legacy platform-wide TWILIO_AUTH_TOKEN. Orgs with no subaccount
  // (the legacy fallback path, e.g. Twins Lawn Service today) have no stored
  // token, so getOrgTwilioAuthToken() returns null and this falls back to
  // the shared env var exactly as before.
  const authToken = (ownerOrgId && (await getOrgTwilioAuthToken(supabase, ownerOrgId))) || process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  if (!verifyTwilioRequest(authToken, signature, url, params)) {
    log.error("signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const from = params.From;
  const body = params.Body ?? "";
  const messageSid = params.MessageSid;
  if (!from || !messageSid) {
    return new NextResponse(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
  }

  const digits = last10Digits(from);
  const keyword = body.trim().toUpperCase();

  // ── Which tenant's clients can this text belong to? ──────────────────────
  // When the MessagingServiceSid resolved to an org above, only that org.
  // Otherwise the message came in on the shared platform sender (or an
  // unknown one), which every org WITHOUT its own messaging service sends
  // from — so only those orgs are candidates (an org with its own number
  // can't have texted this person from the shared one). This used to match
  // the first client with this phone across ALL orgs, filing another
  // tenant's customer's reply (and STOP) on whichever org came back first.
  // There is no per-org phone-number column, so the inbound `To` can't
  // narrow it further than the messaging service does.
  let candidateOrgIds: string[] | null = null;
  if (!ownerOrgId) {
    const { data: sharedOrgs } = await supabase
      .from("organizations")
      .select("id")
      .is("twilio_messaging_service_sid", null);
    candidateOrgIds = ((sharedOrgs ?? []) as { id: string }[]).map((o) => o.id);
  }

  let clientQuery = supabase
    .from("clients")
    .select("id, org_id, primary_phone, display_name, created_at")
    .not("primary_phone", "is", null)
    // A soft-deleted client must not claim an inbound text — the message would
    // be filed against a record no screen shows.
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (ownerOrgId) clientQuery = clientQuery.eq("org_id", ownerOrgId);
  else clientQuery = clientQuery.in("org_id", candidateOrgIds ?? []);
  const { data: clients } = await clientQuery;

  type MatchedClient = { id: string; org_id: string; display_name: string };
  const allMatches = ((clients ?? []) as (MatchedClient & { primary_phone: string | null })[]).filter(
    (c) => c.primary_phone && last10Digits(c.primary_phone) === digits
  );

  if (allMatches.length === 0) {
    log.warn("no client matched inbound sms", { ownerOrgId });
    return new NextResponse(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
  }

  const matchedOrgIds = [...new Set(allMatches.map((c) => c.org_id))];
  if (matchedOrgIds.length > 1) {
    // The same number is a client in more than one org on the shared sender,
    // so there's no way to tell whose customer replied. Don't file the text
    // (timeline row / ticket) on any tenant.
    //
    // STOP is still honored for every one of those orgs: sendClientSms()
    // gates purely on clients.sms_opt_in, and each of these orgs sends to
    // this person from the very sender they just opted out of — leaving the
    // flag set would let any of them text again. START is deliberately NOT
    // applied: consent must never be granted to a tenant it wasn't given to.
    if (OPT_OUT_KEYWORDS.has(keyword)) {
      await supabase.from("clients").update({ sms_opt_in: false }).in("id", allMatches.map((c) => c.id));
    }
    log.warn("inbound sms matched clients in multiple orgs; not attached to any tenant", {
      orgCount: matchedOrgIds.length,
      optOutApplied: OPT_OUT_KEYWORDS.has(keyword),
    });
    return new NextResponse(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
  }

  // One org. Every client in it with this number (duplicates, a household
  // sharing a phone) gets the opt-out and the timeline row — opting out only
  // the first match left the others still textable after a STOP.
  const orgMatches: MatchedClient[] = allMatches;
  const matchedIds = orgMatches.map((c) => c.id);
  const orgId = orgMatches[0].org_id;

  await supabase.from("client_activity").insert(
    orgMatches.map((c) => ({
      org_id: c.org_id,
      client_id: c.id,
      activity_type: "sms",
      direction: "inbound",
      body,
      sent_to: from,
      status: "received",
      ref_id: messageSid,
      ref_table: "twilio_messages",
      occurred_at: new Date().toISOString(),
    }))
  );

  if (OPT_OUT_KEYWORDS.has(keyword)) {
    await supabase.from("clients").update({ sms_opt_in: false }).eq("org_id", orgId).in("id", matchedIds);
  } else if (OPT_IN_KEYWORDS.has(keyword)) {
    await supabase
      .from("clients")
      .update({ sms_opt_in: true, sms_opt_in_at: new Date().toISOString(), sms_opt_in_source: "keyword" })
      .eq("org_id", orgId)
      .in("id", matchedIds);
  }

  // The ticket goes on one client: the one that already has an open text
  // conversation, else the oldest matching record.
  let matched: MatchedClient = orgMatches[0];

  // A real reply (not a STOP/START/HELP-style system command) needs a staff
  // response — surface it as a ticket. An open "text" ticket for this client
  // means an ongoing conversation, so the reply is appended as a comment on
  // it rather than spawning a new ticket per message.
  if (!SKIP_TICKET_KEYWORDS.has(keyword) && body.trim()) {
    const { data: openTicket } = await supabase
      .from("crm_tickets")
      .select("id, ticket_number, subject, assigned_to_id, assigned_to, client_id")
      .eq("org_id", orgId)
      .in("client_id", matchedIds)
      .eq("type", "text")
      .in("status", OPEN_TICKET_STATUSES)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (openTicket) {
      matched = orgMatches.find((c) => c.id === openTicket.client_id) ?? matched;
      await supabase.from("comments").insert({
        org_id: matched.org_id,
        created_by: null,
        record_type: "ticket",
        record_id: openTicket.id,
        author_id: null,
        author_name: matched.display_name,
        body,
      });
      await notifyTicketComment(supabase, {
        orgId: matched.org_id,
        ticketId: openTicket.id,
        ticketNumber: openTicket.ticket_number,
        subject: openTicket.subject,
        assignedToId: openTicket.assigned_to_id,
        assignedToName: openTicket.assigned_to,
        commenterName: matched.display_name,
        commenterId: null,
        commentBody: body,
      });
    } else {
      const { data: ticket, error: ticketErr } = await supabase
        .from("crm_tickets")
        .insert({
          org_id: matched.org_id,
          type: "text",
          client_id: matched.id,
          subject: `Text from ${matched.display_name}`,
          body,
          priority: "normal",
        })
        .select("id, ticket_number, subject")
        .single();

      if (ticketErr) {
        log.error("failed to create text ticket", { error: ticketErr.message });
      } else if (ticket) {
        await notifyStaffOfNewTicket(supabase, {
          orgId: matched.org_id,
          ticketId: ticket.id,
          ticketNumber: ticket.ticket_number,
          subject: ticket.subject,
          assignedToId: null,
          assignedToName: null,
          createdByUserId: null,
        });
      }
    }
  }

  return new NextResponse(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
}
