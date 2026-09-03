import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyTwilioRequest, parseTwilioForm } from "@/lib/sms/verify-twilio-request";
import { getOrgTwilioAuthToken } from "@/lib/twilio/client";

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
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const params = parseTwilioForm(rawBody);
  const signature = request.headers.get("X-Twilio-Signature");
  const url = `${SITE_URL}/api/webhooks/twilio/status`;

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
    console.error("[twilio status webhook] signature verification failed");
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

  const { error } = await supabase
    .from("client_activity")
    .update(patch)
    .eq("ref_table", "twilio_messages")
    .eq("ref_id", messageSid);
  if (error) console.error("[twilio status webhook] failed to update client_activity:", error);

  return NextResponse.json({ received: true });
}
