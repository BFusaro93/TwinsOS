import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { orgHasAddon } from "@/lib/stripe/addon-access";
import { monthStartInZone } from "@/lib/time/zone";
import { toE164Us } from "@/lib/utils/phone";
import { findOptedOutNumbers, phoneLast10, recordCarrierOptOut } from "@/lib/sms/opt-outs";
import { smsSegmentCount } from "@/lib/sms/segments";
import { logger } from "@/lib/logger";

const log = logger.child("sms send");

/** The org whose Twilio account/campaign the TWILIO_* env fallback belongs to. */
export const SHARED_TWILIO_ORG_ID = "619de9bb-f8f8-46cf-983c-9faf54f6a7d0";
export const SMS_NOT_REGISTERED_REASON = "SMS registration not complete for this organization";

/** True when this org can actually send texts (its own messaging service, or the platform org). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function orgCanSendSms(supabase: any, orgId: string): Promise<boolean> {
  if (orgId === SHARED_TWILIO_ORG_ID) return true;
  const { data } = await supabase.from("organizations").select("twilio_messaging_service_sid").eq("id", orgId).maybeSingle();
  return !!data?.twilio_messaging_service_sid;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/** Every number on a contact (main phone + its phone list) as last-10 keys. */
function contactNumberKeys(contact: { phone: string | null; phones: unknown }): string[] {
  const typed = Array.isArray(contact.phones) ? (contact.phones as { phone?: string }[]) : [];
  return [contact.phone, ...typed.map((p) => p.phone)]
    .map((p) => phoneLast10(p))
    .filter((k): k is string => !!k);
}

/**
 * Consent for texting THIS number for this client, or why not. The client's own
 * numbers (primary phone and its phone list) go by the client's consent; a number
 * that belongs only to one of its contacts goes by that contact's consent. Any
 * other number (not on file) falls back to the client's consent.
 */
async function smsConsentRefusal(
  supabase: AnyClient,
  clientId: string,
  toPhone: string,
): Promise<{ reason: string; permanent: boolean } | null> {
  const no = (reason: string) => ({ reason, permanent: true });
  const { data: client } = await supabase
    .from("clients")
    .select("sms_opt_in, primary_phone, phones")
    .eq("id", clientId)
    .single();
  if (!client) return no("client has not opted in to SMS");
  const clientRefusal = client.sms_opt_in ? null : no("client has not opted in to SMS");
  const key = phoneLast10(toPhone);
  if (!key) return clientRefusal;
  const clientPhones = Array.isArray(client.phones) ? (client.phones as { phone?: string }[]) : [];
  const clientKeys = new Set(
    [client.primary_phone as string | null, ...clientPhones.map((p) => p.phone)]
      .map((p) => phoneLast10(p))
      .filter((k): k is string => !!k),
  );
  if (clientKeys.has(key)) return clientRefusal;

  const { data: contacts, error } = await supabase
    .from("client_contacts")
    .select("phone, phones, sms_opt_in")
    .eq("client_id", clientId)
    .is("deleted_at", null);
  // Fail closed: a lookup error must not text someone who didn't consent.
  if (error) return { reason: "couldn't check the contact's text consent", permanent: false };
  const matching = ((contacts ?? []) as { phone: string | null; phones: unknown; sms_opt_in: boolean | null }[])
    .filter((c) => contactNumberKeys(c).includes(key));
  if (matching.length === 0) return clientRefusal;
  return matching.some((c) => c.sms_opt_in === true) ? null : no("this contact has not opted in to SMS");
}

/**
 * Sends an SMS via Twilio's REST API (no SDK — a single authenticated POST),
 * then logs it to the client's activity timeline the same way every other
 * client-facing send in the app does.
 */
export async function sendClientSms(
  supabase: AnyClient,
  params: {
    orgId: string;
    clientId: string | null;
    toPhone: string;
    body: string;
    /**
     * auth user id to stamp on the activity row. Automations send as the
     * system and leave this unset; a person typing a 1:1 text has to be
     * answerable for it on the timeline.
     */
    createdBy?: string | null;
  }
): Promise<{ ok: true; sid: string | null } | { ok: false; reason: string; permanent?: boolean }> {
  // The SMS add-on is what's billed for texting (included volume + overage); a billable plan
  // without it has no texting. Trials bundle it until they end.
  if (!(await orgHasAddon(supabase, params.orgId, "sms"))) {
    return { ok: false, reason: "texting isn't included on this plan (SMS add-on)", permanent: true };
  }

  // TCPA consent gate, enforced here (the actual Twilio call) rather than
  // only in the automation-content resolver, so no future call site — a
  // manual 1:1 text feature, say — can accidentally bypass it.
  if (params.clientId) {
    const refusal = await smsConsentRefusal(supabase, params.clientId, params.toPhone);
    if (refusal) return { ok: false, ...refusal };
  }

  // A number that texted STOP is opted out on its own — a contact's or
  // billing phone, not just the client's primary (crm_sms_opt_outs). Texting it
  // would only fail at Twilio's opt-out list anyway (error 21610).
  try {
    if ((await findOptedOutNumbers(params.orgId, [params.toPhone])).size > 0) {
      return { ok: false, reason: "this number replied STOP", permanent: true };
    }
  } catch {
    return { ok: false, reason: "couldn't check SMS opt-outs" };
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

  // The env fallback is Twins Lawn Service's own Twilio account and approved A2P campaign. Any other
  // org texting through it would send from Twins' number under Twins' registration (and its STOP
  // replies would be matched to the wrong org), so every other org needs its own sender first.
  if (!org?.twilio_messaging_service_sid && params.orgId !== SHARED_TWILIO_ORG_ID) {
    return { ok: false, reason: SMS_NOT_REGISTERED_REASON, permanent: true };
  }

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
  // `?logged=1` tells the status webhook an activity row will exist for this
  // SID, so a terminal callback that beats the insert below gets a 503 and is
  // retried. Twilio only retries connection timeouts by default; the #fragment
  // (a Twilio connection override, not part of the signature) adds 5xx.
  const statusCallback = `${siteUrl}/api/webhooks/twilio/status${params.clientId ? "?logged=1" : ""}#rc=3&rp=ct,5xx`;
  const form = new URLSearchParams({
    // Twilio only accepts E.164; clients' phones are stored as typed.
    To: toE164Us(params.toPhone) ?? params.toPhone,
    MessagingServiceSid: messagingServiceSid,
    Body: params.body,
    StatusCallback: statusCallback,
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
    // 21610: this number is on Twilio's/the carrier's opt-out list. Remember it
    // per number (and on the client when it's the primary phone) so nothing
    // keeps retrying it.
    if (String(payload?.code) === "21610") {
      const optErr = await recordCarrierOptOut(supabase, {
        orgId: params.orgId,
        clientId: params.clientId,
        phone: params.toPhone,
        messageSid: null,
      });
      if (optErr) log.error("failed to record 21610 opt-out", { orgId: params.orgId, error: optErr });
    }
    // A 400 is Twilio rejecting THIS message (invalid/landline number, the
    // recipient texted STOP — 21211/21614/21610, …): retrying can never
    // succeed. Anything else (401 bad creds, 429, 5xx) may clear on its own,
    // so automation callers retry those with backoff instead.
    return {
      ok: false,
      reason: `Twilio send failed: ${payload?.message ?? res.statusText}${payload?.code ? ` (code ${payload.code})` : ""}`,
      permanent: res.status === 400,
    };
  }

  if (params.clientId) {
    const row = {
      org_id: params.orgId,
      client_id: params.clientId,
      activity_type: "sms",
      body: params.body,
      sent_to: params.toPhone,
      status: payload?.status ?? null,
      ref_id: payload?.sid ?? null,
      ref_table: "twilio_messages",
      occurred_at: new Date().toISOString(),
      created_by: params.createdBy ?? null,
    };
    // The text is already sent, so a failed insert can't fail the send — but it
    // must not vanish silently either (no timeline entry, and the status
    // webhook would keep retrying a callback with nothing to update). One retry.
    let { error: activityErr } = await supabase.from("client_activity").insert(row);
    if (activityErr) ({ error: activityErr } = await supabase.from("client_activity").insert(row));
    if (activityErr) {
      log.error("text sent but its activity row failed to save", {
        orgId: params.orgId,
        clientId: params.clientId,
        sid: payload?.sid ?? null,
        error: activityErr.message,
      });
    }
  }

  // Usage counts SEGMENTS (what carriers bill): Twilio's num_segments when the
  // send response has it, else the GSM-7/UCS-2 count of the body.
  const twilioSegments = parseInt(String(payload?.num_segments ?? ""), 10);
  const segments = Number.isFinite(twilioSegments) && twilioSegments > 0 ? twilioSegments : Math.max(1, smsSegmentCount(params.body));

  // Feeds the SMS add-on's included-volume/overage billing (Phase 3) — every
  // successful send counts, regardless of which org/messaging-service sent
  // it. Best-effort: a failure here shouldn't fail the send itself.
  // The billing period key is the 1st of the month on the ORG's calendar. All
  // three places that touch organization_sms_usage (this, the overage cron,
  // and the usage widget) must derive it identically or usage is written under
  // one key and read under another — and a UTC-derived key already advances on
  // the evening of a month's last day.
  const periodStart = monthStartInZone(new Date(), await getOrgTimeZone(supabase, params.orgId));
  // supabase-js returns {error} instead of throwing: surface a lost increment (under-billing)
  // in the logs rather than swallowing it.
  await supabase
    .rpc("increment_sms_usage", {
      p_org_id: params.orgId,
      p_period_start: periodStart,
      p_count: segments,
    })
    .then(
      ({ error }: { error: { message?: string } | null }) => {
        if (error) log.error("increment_sms_usage failed", { orgId: params.orgId, segments, error: error.message ?? String(error) });
      },
      (err: unknown) => {
        log.error("increment_sms_usage threw", { orgId: params.orgId, error: err instanceof Error ? err.message : String(err) });
      }
    );

  return { ok: true, sid: payload?.sid ?? null };
}
