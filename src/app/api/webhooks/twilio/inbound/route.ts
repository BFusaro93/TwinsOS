import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyTwilioRequest, parseTwilioForm } from "@/lib/sms/verify-twilio-request";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://twins-os.vercel.app";

// Twilio's own Advanced Opt-Out feature (on the Messaging Service) normally
// intercepts these keywords before they ever reach this webhook and replies
// with its own confirmation — this list is a defense-in-depth backstop for
// if that setting is ever off, not the primary compliance mechanism.
const OPT_OUT_KEYWORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const OPT_IN_KEYWORDS = new Set(["START", "YES", "UNSTOP"]);

const EMPTY_TWIML = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

function last10Digits(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

/**
 * POST /api/webhooks/twilio/inbound
 *
 * Twilio calls this when a client texts our number back. Logs every inbound
 * reply to client_activity (matched to a client by phone number — no
 * multi-org routing yet, see the comment below) and, as a backstop, applies
 * opt-out/opt-in keywords directly to clients.sms_opt_in.
 */
export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const rawBody = await request.text();
  const params = parseTwilioForm(rawBody);
  const signature = request.headers.get("X-Twilio-Signature");
  const url = `${SITE_URL}/api/webhooks/twilio/inbound`;

  if (!verifyTwilioRequest(authToken, signature, url, params)) {
    console.error("[twilio inbound webhook] signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const from = params.From;
  const body = params.Body ?? "";
  const messageSid = params.MessageSid;
  if (!from || !messageSid) {
    return new NextResponse(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
  }

  const supabase = createServiceClient();

  // Single shared Twilio account today (see org-scoped Twilio settings
  // migration) — every org's inbound texts land on the same number, so
  // there's no way yet to route this to the right org. Matches by phone
  // across all orgs, which is correct as long as only one org is live.
  // Revisit once a second org gets its own subaccount/number.
  const digits = last10Digits(from);
  const { data: clients } = await supabase
    .from("clients")
    .select("id, org_id, primary_phone")
    .not("primary_phone", "is", null);

  const matched = (clients ?? []).find(
    (c: { primary_phone: string | null }) => c.primary_phone && last10Digits(c.primary_phone) === digits
  ) as { id: string; org_id: string } | undefined;

  if (!matched) {
    console.error(`[twilio inbound webhook] no client matched for ${from}`);
    return new NextResponse(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
  }

  await supabase.from("client_activity").insert({
    org_id: matched.org_id,
    client_id: matched.id,
    activity_type: "sms",
    direction: "inbound",
    body,
    sent_to: from,
    status: "received",
    ref_id: messageSid,
    ref_table: "twilio_messages",
    occurred_at: new Date().toISOString(),
  });

  const keyword = body.trim().toUpperCase();
  if (OPT_OUT_KEYWORDS.has(keyword)) {
    await supabase.from("clients").update({ sms_opt_in: false }).eq("id", matched.id);
  } else if (OPT_IN_KEYWORDS.has(keyword)) {
    await supabase
      .from("clients")
      .update({ sms_opt_in: true, sms_opt_in_at: new Date().toISOString(), sms_opt_in_source: "keyword" })
      .eq("id", matched.id);
  }

  return new NextResponse(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
}
