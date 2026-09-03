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

  // Every org can override its Account SID / Messaging Service SID — set
  // once an org has been given its own Twilio subaccount (see
  // src/lib/twilio/provisioning.ts). org_id is looked up first, falling back
  // to the platform-wide shared account (Twins Lawn Service's own, today).
  //
  // A subaccount override means the accountSid is a subaccount of
  // TWILIO_PLATFORM_ACCOUNT_SID (the Landscapt ISV/reseller account, a
  // SEPARATE Twilio account from the legacy fallback below) — the classic
  // /2010-04-01 Messages API accepts the PARENT's own credentials with the
  // target subaccount SID substituted into the URL path, so sending never
  // needs that subaccount's own stored secrets. An org with no override is
  // presumed to be its own full account (not a subaccount of anything), so
  // its own SID must be paired with the legacy fallback token that account
  // actually belongs to.
  const { data: org } = await supabase
    .from("organizations")
    .select("twilio_account_sid, twilio_messaging_service_sid")
    .eq("id", params.orgId)
    .single();

  const hasSubaccountOverride = !!org?.twilio_account_sid;
  const accountSid = org?.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID;
  const messagingServiceSid = org?.twilio_messaging_service_sid || process.env.TWILIO_MESSAGING_SERVICE_SID;

  // Basic Auth must be a genuinely matching (sid, token) pair — Twilio checks
  // the token against the USERNAME's own account, not the URL path. A
  // subaccount override sends as accountSid (the subaccount, in the URL
  // path) authenticated as its PARENT (the Landscapt platform account,
  // TWILIO_PLATFORM_ACCOUNT_SID/TOKEN) — never the subaccount's own SID
  // paired with someone else's token. An org with no override IS its own
  // full account, so it authenticates as itself via the legacy fallback pair.
  const authSid = hasSubaccountOverride ? process.env.TWILIO_PLATFORM_ACCOUNT_SID : process.env.TWILIO_ACCOUNT_SID;
  const authToken = hasSubaccountOverride ? process.env.TWILIO_PLATFORM_AUTH_TOKEN : process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authSid || !authToken || !messagingServiceSid) {
    return { ok: false, reason: "Twilio not configured (env vars or org override)" };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://landscapt.com";
  const form = new URLSearchParams({
    To: params.toPhone,
    MessagingServiceSid: messagingServiceSid,
    Body: params.body,
    StatusCallback: `${siteUrl}/api/webhooks/twilio/status`,
  });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${authSid}:${authToken}`).toString("base64")}`,
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
