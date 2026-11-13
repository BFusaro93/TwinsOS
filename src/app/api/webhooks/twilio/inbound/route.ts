import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyTwilioRequest, parseTwilioForm } from "@/lib/sms/verify-twilio-request";
import { notifyStaffOfNewTicket, notifyTicketComment } from "@/lib/ticket-notify";
import { fireServerTrigger } from "@/lib/automations/fire-server-trigger";
import { getOrgTwilioAuthToken } from "@/lib/twilio/client";
import { logger } from "@/lib/logger";
import { SHARED_TWILIO_ORG_ID } from "@/lib/sms/send";
import { classifySmsKeyword, containedOptOutNote, normalizeSmsText } from "@/lib/sms/keywords";
import { attachMediaToTicket, copyInboundMedia, parseInboundMedia, type SmsMediaItem } from "@/lib/sms/media";
import { setContactSmsConsentByNumber, type SmsOptOutSource } from "@/lib/sms/opt-outs";

const log = logger.child("twilio inbound webhook");

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://landscapt.com";

// Keyword recognition (which words opt out / in / ask for help, and the
// "contained in a longer message" rule) lives in src/lib/sms/keywords.ts and
// mirrors what each campaign registers with Twilio. Twilio's own Advanced
// Opt-Out normally handles these first and replies with the registered
// message; this webhook keeps OUR records in step (and is the backstop if that
// setting is ever off), so it never sends a reply of its own.
// (Which tickets count as an open text conversation — open/pending/on_hold —
// is decided in the find_or_create_sms_text_ticket RPC.)

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

  // ── What kind of text is this? ───────────────────────────────────────────
  const kw = classifySmsKeyword(body);
  // When Advanced Opt-Out is on, Twilio tells us how IT classified the text
  // (against the Messaging Service's keyword lists) — honour its STOP even if
  // our own parse missed it. Its START is only followed for START/UNSTOP (see
  // keywords.ts on why a bare YES never re-grants consent here).
  const twilioOptOutType = (params.OptOutType ?? "").toUpperCase();
  const isOptOut = kw.kind === "opt_out" || twilioOptOutType === "STOP";
  const optOutKeyword = kw.kind === "opt_out" ? kw.keyword : isOptOut ? normalizeSmsText(body).slice(0, 40) || "STOP" : null;
  // A longer message that merely CONTAINS an opt-out word: still opts out, but
  // it's a real message too — it gets a ticket and a "re-confirm" note.
  const optOutContained = kw.kind === "opt_out" && kw.contained && twilioOptOutType !== "STOP";
  const optOutSource: SmsOptOutSource = optOutContained ? "keyword_in_message" : "keyword";
  const isOptIn = !isOptOut && kw.kind === "opt_in";
  const isHelp = !isOptOut && (kw.kind === "help" || twilioOptOutType === "HELP");
  // Bare STOP/START/HELP are system commands nobody needs to answer.
  const isSystemCommand = (isOptOut && !optOutContained) || isOptIn || isHelp;
  const inboundMedia = parseInboundMedia(params);
  const optOut = isOptOut ? { source: optOutSource, keyword: optOutKeyword } : null;

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
    // No client or contact has this number. When we know which org's sender
    // received it, STOP/START is still recorded against the NUMBER — a person
    // who isn't (or isn't yet) on file must not get texted after saying STOP,
    // e.g. once someone adds them as a contact. The shared platform sender
    // belongs to SHARED_TWILIO_ORG_ID only (see candidateOrgIds above).
    const receivingOrgId =
      ownerOrgId ??
      (messagingServiceSid && messagingServiceSid === process.env.TWILIO_MESSAGING_SERVICE_SID ? SHARED_TWILIO_ORG_ID : null);
    if (receivingOrgId && /^[0-9]{10}$/.test(digits)) {
      if (optOut) {
        const failed = await applyOptOut(supabase, [], digits, messageSid, optOut, receivingOrgId);
        if (failed) {
          log.error("failed to apply STOP from unmatched number", { orgId: receivingOrgId, error: failed });
          return NextResponse.json({ error: "Opt-out failed" }, { status: 500 });
        }
      } else if (isOptIn) {
        const liftErr = await liftNumberOptOut(supabase, receivingOrgId, digits);
        if (liftErr) log.error("failed to lift number opt-out on START (unmatched)", { orgId: receivingOrgId, error: liftErr });
      }
    }
    log.warn("no client matched inbound sms", { ownerOrgId, receivingOrgId, optOut: !!optOut, optIn: isOptIn });
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
    if (optOut) {
      const failed = await applyOptOut(supabase, allMatches, digits, messageSid, optOut);
      if (failed) {
        // 5xx so Twilio retries — a swallowed failure leaves the number textable.
        log.error("failed to apply multi-org STOP", { error: failed });
        return NextResponse.json({ error: "Opt-out failed" }, { status: 500 });
      }
    }
    log.warn("inbound sms matched clients in multiple orgs; not attached to any tenant", {
      orgCount: matchedOrgIds.length,
      optOutApplied: !!optOut,
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
  if (optOut) {
    const failed = await applyOptOut(supabase, orgMatches, digits, messageSid, optOut);
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

  // MMS: copy pictures into Storage (falls back to Twilio's URL per item).
  const media: SmsMediaItem[] = await copyInboundMedia(supabase, orgId, messageSid, inboundMedia);
  const containedNote = optOutContained && optOutKeyword ? containedOptOutNote(optOutKeyword) : null;
  const subjectParts: string[] = [];
  if (containedNote) subjectParts.push(containedNote);
  else if (optOut) subjectParts.push(`Opted out of texts (replied "${optOutKeyword}")`);
  else if (isOptIn) subjectParts.push(`Opted back in to texts (replied "${kw.keyword}")`);
  if (media.length > 0) subjectParts.push(`${media.length} attachment${media.length === 1 ? "" : "s"}`);

  const { error: activityErr } = await supabase.from("client_activity").insert(
    orgMatches.map((c) => ({
      org_id: c.org_id,
      client_id: c.id,
      activity_type: "sms",
      direction: "inbound",
      subject: subjectParts.length > 0 ? subjectParts.join(" · ") : null,
      body,
      media: media.length > 0 ? media : null,
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

  if (isOptIn) {
    // START lifts this number's own opt-out. It grants the CLIENT's consent
    // only when the client's primary phone sent it — a contact can't opt the
    // whole client in.
    const liftErr = await liftNumberOptOut(supabase, orgId, digits);
    if (liftErr) log.error("failed to lift number opt-out on START", { orgId, error: liftErr });
    // A contact whose main phone this is opts themselves back in.
    const contactErr = await setContactSmsConsentByNumber(supabase, { orgId, last10: digits, optIn: true, source: "keyword" });
    if (contactErr) log.error("failed to apply START to contacts", { orgId, error: contactErr });
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

  // A real reply (not a bare STOP/START/HELP) needs a staff response — surface
  // it as a ticket. A picture with no words is a real reply too. An open
  // "text" ticket for this client means an ongoing conversation, so the reply
  // is appended as a comment on it rather than spawning a new ticket per
  // message. Find-or-create is one locked RPC so two quick texts can't both
  // open a ticket.
  if (!isSystemCommand && (body.trim() || media.length > 0)) {
    const text = body.trim()
      ? body
      : `(picture message — ${media.length} attachment${media.length === 1 ? "" : "s"})`;
    const ticketText = containedNote ? `${text}\n\n— ${containedNote}` : text;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC is newer than the generated types
    const { data: ticketRows, error: ticketErr } = await (supabase as any).rpc("find_or_create_sms_text_ticket", {
      p_org_id: orgId,
      p_client_ids: matchedIds,
      p_new_client_id: matched.id,
      p_subject: `Text from ${matched.display_name}`,
      p_body: ticketText,
    });
    const ticket = ((ticketRows ?? []) as {
      id: string;
      ticket_number: number;
      subject: string | null;
      assigned_to_id: string | null;
      assigned_to: string | null;
      client_id: string;
      created: boolean;
    }[])[0];

    if (ticketErr || !ticket) {
      log.error("failed to find or create text ticket", { orgId, error: ticketErr?.message ?? "no row" });
    } else if (!ticket.created) {
      matched = orgMatches.find((c) => c.id === ticket.client_id) ?? matched;
      await supabase.from("comments").insert({
        org_id: matched.org_id,
        created_by: null,
        record_type: "ticket",
        record_id: ticket.id,
        author_id: null,
        author_name: matched.display_name,
        body: ticketText,
      });
      await notifyTicketComment(supabase, {
        orgId: matched.org_id,
        ticketId: ticket.id,
        ticketNumber: ticket.ticket_number,
        subject: ticket.subject ?? `Text from ${matched.display_name}`,
        assignedToId: ticket.assigned_to_id,
        assignedToName: ticket.assigned_to,
        commenterName: matched.display_name,
        commenterId: null,
        commentBody: ticketText,
      });
    } else {
      await notifyStaffOfNewTicket(supabase, {
        orgId: matched.org_id,
        ticketId: ticket.id,
        ticketNumber: ticket.ticket_number,
        subject: ticket.subject ?? `Text from ${matched.display_name}`,
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
    if (ticket && media.length > 0) {
      await attachMediaToTicket(supabase, {
        orgId,
        ticketId: ticket.id,
        uploadedByName: matched.display_name,
        media,
      });
    }
  }

  return new NextResponse(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
}

/**
 * A STOP from this number: remember the opt-out against the NUMBER in each
 * matched org (so texts to a contact's or billing phone stop too) — or in
 * `fallbackOrgId` when nobody matched — and turn off the client's own consent
 * (recording when and why) where the number is the client's primary phone.
 * Returns an error message on failure, null on success. Idempotent.
 */
async function applyOptOut(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  matches: { id: string; org_id: string; match_kind: string }[],
  digits: string,
  messageSid: string,
  optOut: { source: SmsOptOutSource; keyword: string | null },
  fallbackOrgId?: string,
): Promise<string | null> {
  const now = new Date().toISOString();
  if (/^[0-9]{10}$/.test(digits)) {
    const orgIds = matches.length > 0 ? [...new Set(matches.map((m) => m.org_id))] : fallbackOrgId ? [fallbackOrgId] : [];
    for (const orgId of orgIds) {
      const first = matches.find((m) => m.org_id === orgId);
      const { error } = await supabase.from("crm_sms_opt_outs").insert({
        org_id: orgId,
        phone_last10: digits,
        client_id: first?.id ?? null,
        source_message_sid: messageSid,
        source: optOut.source,
        matched_keyword: optOut.keyword,
        opted_out_at: now,
      });
      // 23505 = this number already has a live opt-out in the org.
      if (error && error.code !== "23505") return error.message;
      // Any contact with this number loses its own text consent too.
      const contactErr = await setContactSmsConsentByNumber(supabase, {
        orgId, last10: digits, optIn: false, source: optOut.source,
      });
      if (contactErr) return contactErr;
    }
  }
  const primaryIds = matches.filter((m) => m.match_kind === "primary").map((m) => m.id);
  if (primaryIds.length > 0) {
    const { error } = await supabase
      .from("clients")
      .update({ sms_opt_in: false, sms_opt_out_at: now, sms_opt_out_source: optOut.source })
      .in("id", primaryIds);
    if (error) return error.message;
  }
  return null;
}

/** START: lift this number's live opt-out in the org. Returns an error message or null. */
async function liftNumberOptOut(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  digits: string,
): Promise<string | null> {
  const { error } = await supabase
    .from("crm_sms_opt_outs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("phone_last10", digits)
    .is("deleted_at", null);
  return error ? error.message : null;
}
