// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/**
 * Two distinct Twilio auth modes, because Twilio's API families don't all
 * accept the same credentials (confirmed against Twilio's subaccount-auth
 * docs, 2026-09-01):
 *
 * - The classic /2010-04-01 API (Accounts, Messages, Addresses, subaccount
 *   API Keys) accepts the PARENT account's SID/AuthToken with the target
 *   subaccount's SID substituted into the URL path.
 * - Newer API families on their own subdomains (trusthub.twilio.com,
 *   messaging.twilio.com — Customer Profiles, Brand Registration, Messaging
 *   Services, A2P Campaigns) require the subaccount's OWN credentials. We
 *   never store a subaccount's raw auth token; instead provisioning creates
 *   a subaccount-scoped API Key/Secret (Basic Auth username = the Key SID,
 *   password = the Secret), which is independently revocable and is what
 *   this second mode authenticates with.
 */

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function twilioFetch(url: string, authHeader: string, body?: URLSearchParams, method: "GET" | "POST" = "POST") {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = payload?.message ?? payload?.detail ?? res.statusText;
    throw new Error(`Twilio ${method} ${url} failed (${res.status}): ${message}`);
  }
  return payload;
}

// This is the Landscapt ISV/reseller account — deliberately a SEPARATE
// Twilio account from TWILIO_ACCOUNT_SID (Twins Lawn Service's own account,
// still used by sendClientSms()'s fallback and the inbound webhook for any
// org with no subaccount override). Every new org's subaccount is created
// under THIS account, so a compliance issue on one org's subaccount can
// never touch Twins' or the platform-wide fallback's numbers.
function parentAuthHeader(): { sid: string; header: string } {
  const parentSid = process.env.TWILIO_PLATFORM_ACCOUNT_SID;
  const parentToken = process.env.TWILIO_PLATFORM_AUTH_TOKEN;
  if (!parentSid || !parentToken) throw new Error("TWILIO_PLATFORM_ACCOUNT_SID/TWILIO_PLATFORM_AUTH_TOKEN not configured");
  return { sid: parentSid, header: basicAuthHeader(parentSid, parentToken) };
}

/** Calls the classic /2010-04-01 API using the Landscapt platform account's credentials, scoped to a subaccount SID in the path. */
export async function parentRequest(
  path: string,
  opts: { accountSid?: string; method?: "GET" | "POST"; body?: Record<string, string> } = {}
) {
  const { sid: parentSid, header } = parentAuthHeader();
  const accountSid = opts.accountSid ?? parentSid;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}${path}`;
  const body = opts.body ? new URLSearchParams(opts.body) : undefined;
  return twilioFetch(url, header, body, opts.method ?? "POST");
}

/** Creates a new subaccount under the parent account — the one /2010-04-01 call with no existing accountSid to scope by. */
export async function createParentSubaccount(friendlyName: string) {
  const { header } = parentAuthHeader();
  const url = `https://api.twilio.com/2010-04-01/Accounts.json`;
  return twilioFetch(url, header, new URLSearchParams({ FriendlyName: friendlyName }), "POST");
}

/** Calls a subaccount-scoped API (Trust Hub, Messaging v1, ...) using that subaccount's own API Key/Secret. */
export async function subaccountRequest(
  baseUrl: string,
  path: string,
  creds: { apiKeySid: string; apiKeySecret: string },
  opts: { method?: "GET" | "POST"; body?: Record<string, string> } = {}
) {
  const url = `${baseUrl}${path}`;
  const body = opts.body ? new URLSearchParams(opts.body) : undefined;
  return twilioFetch(url, basicAuthHeader(creds.apiKeySid, creds.apiKeySecret), body, opts.method ?? "POST");
}

/** Looks up an org's subaccount-scoped credentials (SID from the row, Secret decrypted from Vault server-side). */
export async function getOrgTwilioCreds(
  supabase: AnyClient,
  orgId: string
): Promise<{ subaccountSid: string; apiKeySid: string; apiKeySecret: string } | null> {
  const { data: reg } = await supabase
    .from("org_sms_registrations")
    .select("twilio_subaccount_sid, twilio_api_key_sid")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!reg?.twilio_subaccount_sid || !reg?.twilio_api_key_sid) return null;

  const { data: secret, error } = await supabase.rpc("get_org_twilio_api_secret", { p_org_id: orgId });
  if (error || !secret) return null;

  return { subaccountSid: reg.twilio_subaccount_sid, apiKeySid: reg.twilio_api_key_sid, apiKeySecret: secret };
}

/**
 * The subaccount's own raw Auth Token, decrypted from Vault. ONLY for
 * verifying inbound webhook signatures — Twilio signs a subaccount's number's
 * webhooks with that subaccount's own token, not the parent's, so the API
 * Key/Secret above (which authenticates API *calls*, not signatures) can't
 * substitute here. Never used for outbound API requests.
 */
export async function getOrgTwilioAuthToken(supabase: AnyClient, orgId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_org_twilio_auth_token", { p_org_id: orgId });
  if (error || !data) return null;
  return data;
}
