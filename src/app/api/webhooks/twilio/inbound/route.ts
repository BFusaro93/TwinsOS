import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyTwilioRequest, parseTwilioForm } from "@/lib/sms/verify-twilio-request";
import { notifyStaffOfNewTicket, notifyTicketComment } from "@/lib/ticket-notify";
import { fireServerTrigger } from "@/lib/automations/fire-server-trigger";
import { getOrgTwilioAuthToken } from "@/lib/twilio/client";
import { logger } from "@/lib/logger";
import { SHARED_TWILIO_ORG_ID } from "@/lib/sms/send";

const log = logger.child("twilio inbound webhook");

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://landscapt.com";

// Twilio's own Advanced Opt-Out feature (on the Messaging Service) normally
// intercepts these keywords before they ever reach this webhook and replies
// with its own confirmation — this list is a defense-in-depth backstop for
// if that setting is ever off, not the primary compliance mechanism.
// REVOKE/OPTOUT are in Twilio's own standard opt-out list too.
const OPT_OUT_KEYWORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"]);
// "YES" is deliberately NOT an opt-in keyword: clients reply YES to unrelated
// texts (e.g. "Reply YES to confirm your visit"), which would silently re-grant
// SMS consent to someone who texted STOP. START/UNSTOP are Twilio's own
// opt-in keywords.
const OPT_IN_KEYWORDS = new Set(["START", "UNSTOP"]);
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
 * reply to client_activity (matched to a client by phone number — primary,
 * the client's phone list, or a contact's — scoped to the org owning the
 * inbound MessagingServiceSid when one is configured; see below) and, as a
 * backstop, applies opt-out/opt-in keywords: per number (crm_sms_opt_outs),
 * and to clients.sms_opt_in when it was the client's primary phone.
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
  // Trailing punctuation ("Stop." / "STOP!") is still a STOP.
  const keyword = body.trim().toUpperCase().replace(/[.!?\s]+$/, "");

  // ── Which tenant's clients can this text belong to? ──────────────────────
  // When the MessagingServiceSid resolved to an org above, only that org.
  // Otherwise the message came in on the shared platform sender (or an
  // unknown one). sendClientSms (src/lib/sms/send.ts) lets ONLY
  // SHARED_TWILIO_ORG_ID send from the shared sender, so that org is the only
  // one that can have texted this person from it. This used to treat every
  // org without its own messaging service as a candidate, filing a reply —
  // and applying STOP/START — in an org that never texted that number.
  // There is no per-org phone-number column, so the inbound `To` can't
  // narrow it further than the messaging service does.
  const candidateOrgIds: string[] = ownerOrgId ? [ownerOrgId] : [SHARED_TWILIO_ORG_ID];

  // Matched SQL-side (phone_last10()) rather than loading every phone client
  // of every candidate org and comparing in JS — that select hit PostgREST's
  // 1000-row cap, so on the shared sender a reply (or STOP) from a client past
  // the cap silently matched nobody. Automations also text a client's billing
  // phone and its contacts, so the match covers the client's phone list and
  // live contacts' phones too (match_kind says which); it used to look at
  // primary_phone only, so a contact's STOP matched nobody and was dropped.
  // Not soft-deleted (a deleted client must not claim an inbound text), oldest first.
  type MatchedClient = { id: string; org_id: string; display_name: string; match_kind: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC is newer than the generated types
  const { data: clients, error: matchErr } = await (supabase as any).rpc("find_clients_by_any_phone_last10", {
    p_digits: digits,
    p_org_ids: candidateOrgIds,
  });
  if (matchErr) {
    // Fail loudly (5xx) so Twilio retries instead of dropping a STOP.
    log.error("client phone match failed", { ownerOrgId, error: matchErr.message });
    return NextResponse.json({ error: "Client lookup failed" }, { status: 500 });
  }
  const allMatches: MatchedClient[] = ((clients ?? []) as MatchedClient[]).map((c) => ({
    id: c.id,
    org_id: c.org_id,
    display_name: c.display_name,
    match_kind: c.match_kind,
  }));

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
    // STOP is still honored for every one of those orgs: each sends to this
    // person from the very sender they just opted out of, so the number is
    // opted out in each org (and a matching primary phone loses the client's
    // consent) — otherwise any of them could text again. START is
    // deliberately NOT applied: consent must never be granted to a tenant it
    // wasn't given to.
    if (OPT_OUT_KEYWORDS.has(keyword)) {
      const failed = await applyOptOut(supabase, allMatches, digits, messageSid);
      if (failed) {
        // 5xx so Twilio retries — a swallowed failure leaves the number textable.
        log.error("failed to apply multi-org STOP", { error: failed });
        return NextResponse.json({ error: "Opt-out failed" }, { status: 500 });
      }
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

  // Apply STOP before the duplicate-delivery check below: that check keys off
  // the timeline row, which is written first — a run that died after logging
  // but before flipping the flag would otherwise make every Twilio retry ack
  // as "already handled" and the opt-out would never land. Idempotent, so
  // re-applying on a genuine duplicate is harmless.
  if (OPT_OUT_KEYWORDS.has(keyword)) {
    const failed = await applyOptOut(supabase, orgMatches, digits, messageSid);
    if (failed) {
      // 5xx so Twilio retries — acking 200 here would leave the number textable
      // after they said STOP.
      log.error("failed to apply STOP", { orgId, error: failed });
      return NextResponse.json({ error: "Opt-out failed" }, { status: 500 });
    }
  }

  // Twilio retries a webhook on timeouts/5xx, so the same MessageSid can arrive
  // more than once. If we already filed it, ack without re-logging or opening
  // a second ticket / re-appending the comment.
  const { data: alreadyLogged } = await supabase
    .from("client_activity")
    .select("id")
    .eq("org_id", orgId)
    .eq("ref_table", "twilio_messages")
    .eq("ref_id", messageSid)
    .eq("direction", "inbound")
    .limit(1);
  if (alreadyLogged && alreadyLogged.length > 0) {
    return new NextResponse(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
  }

  const { error: activityErr } = await supabase.from("client_activity").insert(
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
  // 23505 = the unique index on (client_id, MessageSid) caught a concurrent
  // duplicate delivery that slipped past the check above.
  if (activityErr?.code === "23505") {
    return new NextResponse(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
  }
  if (activityErr) log.error("failed to log inbound sms", { error: activityErr.message });

  if (OPT_IN_KEYWORDS.has(keyword)) {
    // START lifts this number's own opt-out. It grants the CLIENT's consent
    // only when the client's primary phone sent it — a contact can't opt the
    // whole client in.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- crm_sms_opt_outs is newer than the generated types
    const { error: liftErr } = await (supabase as any)
      .from("crm_sms_opt_outs")
      .update({ deleted_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("phone_last10", digits)
      .is("deleted_at", null);
    if (liftErr) log.error("failed to lift number opt-out on START", { orgId, error: liftErr.message });
    const primaryIds = orgMatches.filter((c) => c.match_kind === "primary").map((c) => c.id);
    if (primaryIds.length > 0) {
      const { error: optInErr } = await supabase
        .from("clients")
        .update({ sms_opt_in: true, sms_opt_in_at: new Date().toISOString(), sms_opt_in_source: "keyword" })
        .eq("org_id", orgId)
        .in("id", primaryIds);
      if (optInErr) log.error("failed to apply START", { orgId, error: optInErr.message });
    }
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
        // A texted-in ticket is a new ticket like any other: "Ticket was created"
        // automations run for it. Replies on an open thread (above) don't re-fire.
        await fireServerTrigger(supabase, {
          orgId: matched.org_id,
          clientId: matched.id,
          ticketId: ticket.id,
          triggerType: "ticket_created",
        });
      }
    }
  }

  return new NextResponse(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
}

/**
 * A STOP from this number: remember the opt-out against the NUMBER in each
 * matched org (so texts to a contact's or billing phone stop too), and turn
 * off the client's own consent where the number is the client's primary phone.
 * Returns an error message on failure, null on success. Idempotent.
 */
async function applyOptOut(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  matches: { id: string; org_id: string; match_kind: string }[],
  digits: string,
  messageSid: string,
): Promise<string | null> {
  if (/^[0-9]{10}$/.test(digits)) {
    for (const orgId of [...new Set(matches.map((m) => m.org_id))]) {
      const first = matches.find((m) => m.org_id === orgId);
      const { error } = await supabase.from("crm_sms_opt_outs").insert({
        org_id: orgId,
        phone_last10: digits,
        client_id: first?.id ?? null,
        source_message_sid: messageSid,
      });
      // 23505 = this number already has a live opt-out in the org.
      if (error && error.code !== "23505") return error.message;
    }
  }
  const primaryIds = matches.filter((m) => m.match_kind === "primary").map((m) => m.id);
  if (primaryIds.length > 0) {
    const { error } = await supabase.from("clients").update({ sms_opt_in: false }).in("id", primaryIds);
    if (error) return error.message;
  }
  return null;
}
