// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/**
 * Sends an SMS via Twilio's REST API (no SDK — a single authenticated POST),
 * then logs it to the client's activity timeline the same way every other
 * client-facing send in the app does.
 */
export async function sendClientSms(
  supabase: AnyClient,
  params: { orgId: string; clientId: string | null; toPhone: string; body: string }
): Promise<{ ok: true; sid: string | null } | { ok: false; reason: string }> {
  // TCPA consent gate, enforced here (the actual Twilio call) rather than
  // only in the automation-content resolver, so no future call site — a
  // manual 1:1 text feature, say — can accidentally bypass it.
  if (params.clientId) {
    const { data: client } = await supabase
      .from("clients")
      .select("sms_opt_in")
      .eq("id", params.clientId)
      .single();
    if (!client?.sms_opt_in) return { ok: false, reason: "client has not opted in to SMS" };
  }

  // Every org can override its Account SID / Messaging Service SID (for when
  // a licensed org gets its own Twilio subaccount) — org_id is looked up
  // first, falling back to the platform-wide shared account. The auth token
  // is always the platform-wide one for now; see the migration that added
  // these columns for why.
  const { data: org } = await supabase
    .from("organizations")
    .select("twilio_account_sid, twilio_messaging_service_sid")
    .eq("id", params.orgId)
    .single();

  const accountSid = org?.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = org?.twilio_messaging_service_sid || process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!accountSid || !authToken || !messagingServiceSid) {
    return { ok: false, reason: "Twilio not configured (env vars or org override)" };
  }

  const form = new URLSearchParams({
    To: params.toPhone,
    MessagingServiceSid: messagingServiceSid,
    Body: params.body,
  });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, reason: `Twilio send failed: ${payload?.message ?? res.statusText}` };
  }

  if (params.clientId) {
    await supabase.from("client_activity").insert({
      org_id: params.orgId,
      client_id: params.clientId,
      activity_type: "sms",
      body: params.body,
      sent_to: params.toPhone,
      status: payload?.status ?? null,
      ref_id: payload?.sid ?? null,
      ref_table: "twilio_messages",
      occurred_at: new Date().toISOString(),
    });
  }

  // Feeds the SMS add-on's included-volume/overage billing (Phase 3) — every
  // successful send counts, regardless of which org/messaging-service sent
  // it. Best-effort: a failure here shouldn't fail the send itself.
  const periodStart = new Date();
  periodStart.setUTCDate(1);
  await supabase
    .rpc("increment_sms_usage", {
      p_org_id: params.orgId,
      p_period_start: periodStart.toISOString().slice(0, 10),
    })
    .then(() => {}, () => {});

  return { ok: true, sid: payload?.sid ?? null };
}
