import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyTwilioRequest, parseTwilioForm } from "@/lib/sms/verify-twilio-request";
import { getOrgTwilioAuthToken } from "@/lib/twilio/client";
import { recordCarrierOptOut } from "@/lib/sms/opt-outs";
import { logger } from "@/lib/logger";

const log = logger.child("twilio status webhook");

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://landscapt.com";

/**
 * POST /api/webhooks/twilio/status
 *
 * Twilio calls this (configured via StatusCallback on the outbound
 * Messages.json POST in sendClientSms) as a text's delivery status changes:
 * queued -> sent -> delivered, or failed/undelivered. Updates the matching
 * client_activity row (matched by ref_table='twilio_messages' + ref_id, the
 * same ref_id/ref_table pattern every other client-facing send uses) so
 * Text Activity reflects real delivery outcomes instead of just the
 * send-time "accepted" status.
 *
 * sendClientSms adds `?logged=1` to the callback URL when it will write that
 * activity row. Twilio can call back before the row exists (the send response
 * and the insert race the first callback), so a TERMINAL status that matches no
 * row on a logged send returns 503 and Twilio retries it (the callback URL
 * carries a `#rc=..&rp=5xx` connection override — Twilio only retries
 * connection timeouts by default). The fragment isn't part of the signature.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const params = parseTwilioForm(rawBody);
  const signature = request.headers.get("X-Twilio-Signature");
  // Twilio signs the full callback URL, query string included (the #fragment is not).
  const search = new URL(request.url).search;
  const url = `${SITE_URL}/api/webhooks/twilio/status${search}`;
  const expectsActivityRow = new URLSearchParams(search).get("logged") === "1";

  const supabase = createServiceClient();

  // Same reasoning as the inbound webhook: an org on its own Twilio
  // subaccount gets its status callbacks signed with that subaccount's own
  // Auth Token, not the legacy platform-wide one — resolve the owning org via
  // MessagingServiceSid (present on status callbacks for messages sent
  // through a Messaging Service, which every send in this app is) first.
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

  const authToken = (ownerOrgId && (await getOrgTwilioAuthToken(supabase, ownerOrgId))) || process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  if (!verifyTwilioRequest(authToken, signature, url, params)) {
    log.error("signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const messageSid = params.MessageSid;
  const messageStatus = params.MessageStatus;
  if (!messageSid || !messageStatus) {
    return NextResponse.json({ received: true });
  }

  const patch: Record<string, string> = { status: messageStatus };
  if (messageStatus === "delivered") patch.delivered_at = new Date().toISOString();
  if (messageStatus === "failed" || messageStatus === "undelivered") patch.failed_at = new Date().toISOString();

  // Twilio doesn't guarantee callback order: a late "sent" must not overwrite
  // "delivered"/"failed". Terminal statuses are never overwritten by a
  // different status; queued/sending/sent can't overwrite each other backwards.
  const RANK: Record<string, number> = { accepted: 0, queued: 0, sending: 1, sent: 2 };
  const terminal = ["delivered", "undelivered", "failed"];
  const excluded = [...terminal];
  if (messageStatus in RANK) {
    excluded.push(...Object.keys(RANK).filter((k) => RANK[k] > RANK[messageStatus]));
  }
  // `status NOT IN (...)` is NULL (not true) for a row whose status is NULL,
  // so a plain .not() silently skipped rows logged without a status — they
  // never received any delivery update. Match NULL explicitly. One combined
  // .or() (rather than two) so both exclusion sets are ANDed in one filter.
  const { data: updated, error } = await supabase
    .from("client_activity")
    // `as never`: postgrest rejects excess properties on a dynamically-built patch.
    .update(patch as never)
    .eq("ref_table", "twilio_messages")
    .eq("ref_id", messageSid)
    .or(`status.is.null,status.not.in.(${excluded.join(",")})`)
    .select("id");
  if (error) {
    log.error("failed to update client_activity", { error: error.message });
    // 5xx so Twilio retries the callback rather than the delivery outcome being lost.
    return NextResponse.json({ error: "Failed to record delivery status" }, { status: 500 });
  }

  // The activity row (client_id, org_id, sent_to) — also needed for 21610 below.
  const { data: activity } = await supabase
    .from("client_activity")
    .select("client_id, org_id, sent_to")
    .eq("ref_table", "twilio_messages")
    .eq("ref_id", messageSid)
    .limit(1)
    .maybeSingle();

  if ((updated ?? []).length === 0 && !activity && expectsActivityRow && terminal.includes(messageStatus)) {
    // The send's activity row isn't written yet: have Twilio retry so a final
    // delivered/failed outcome isn't dropped.
    log.warn("terminal status before activity row exists; asking Twilio to retry", { messageStatus });
    return NextResponse.json({ error: "Activity not recorded yet" }, { status: 503 });
  }

  // 21610: the recipient is on Twilio's/the carrier's opt-out list (texted STOP at
  // that layer). Record the opt-out for the number that was actually texted, or
  // automations keep trying it; the client's own consent flips only when that
  // number is its primary phone.
  if (params.ErrorCode === "21610" && (messageStatus === "failed" || messageStatus === "undelivered")) {
    if (activity?.org_id) {
      const optErr = await recordCarrierOptOut(supabase, {
        orgId: activity.org_id,
        clientId: activity.client_id ?? null,
        phone: activity.sent_to ?? params.To ?? null,
        messageSid,
      });
      if (optErr) {
        log.error("failed to record 21610 opt-out", { error: optErr });
        return NextResponse.json({ error: "Failed to record opt-out" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
