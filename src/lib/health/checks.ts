import { createServiceClient } from "@/lib/supabase/server";
import Stripe from "stripe";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { getOrgTwilioCreds } from "@/lib/twilio/client";
import { orgHasAddon } from "@/lib/stripe/addon-access";

export type HealthStatus = "ok" | "degraded" | "down" | "not_configured";

export interface HealthCheckResult {
  id: string;
  name: string;
  status: HealthStatus;
  latencyMs: number | null;
  detail: string;
  /** Per-org problems behind a degraded/down row (staff-only data). */
  failures?: { label: string; detail: string }[];
}

export interface UptimeMonitor {
  name: string;
  status: "up" | "down" | "paused" | "unknown";
  ratio30d: number | null;
  /** Oldest → newest, last 30 days. ratio is 0–100, null = no data. */
  days: { date: string; ratio: number | null }[];
}

const TIMEOUT_MS = 6000;
const SLOW_MS = 2500;

/** Runs one check, timing it and converting any throw into a "down" row. Never echoes raw errors beyond a short message. */
async function timed(
  id: string,
  name: string,
  run: (signal: AbortSignal) => Promise<{ status?: HealthStatus; detail: string; failures?: HealthCheckResult["failures"] }>
): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const out = await run(AbortSignal.timeout(TIMEOUT_MS));
    const latencyMs = Date.now() - start;
    let status = out.status ?? "ok";
    if (status === "ok" && latencyMs > SLOW_MS) status = "degraded";
    return { id, name, status, latencyMs, detail: out.detail, failures: out.failures };
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return {
      id,
      name,
      status: "down",
      latencyMs: Date.now() - start,
      detail: timedOut ? `Timed out after ${TIMEOUT_MS / 1000}s` : err instanceof Error ? err.message.slice(0, 160) : "Unknown error",
    };
  }
}

function notConfigured(id: string, name: string, envVar: string): HealthCheckResult {
  return { id, name, status: "not_configured", latencyMs: null, detail: `${envVar} is not set` };
}

async function checkSupabaseDb(): Promise<HealthCheckResult> {
  return timed("supabase_db", "Supabase — database", async () => {
    const { error } = await createServiceClient()
      .from("organizations")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    if (error) throw new Error(error.message);
    return { detail: "Service-role query succeeded" };
  });
}

async function checkSupabaseAuth(): Promise<HealthCheckResult> {
  return timed("supabase_auth", "Supabase — auth", async () => {
    const { error } = await createServiceClient().auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) throw new Error(error.message);
    return { detail: "Admin API reachable" };
  });
}

async function checkSupabaseStorage(): Promise<HealthCheckResult> {
  return timed("supabase_storage", "Supabase — storage", async () => {
    const { error } = await createServiceClient().storage.listBuckets();
    if (error) throw new Error(error.message);
    return { detail: "Buckets listed" };
  });
}

async function checkStripe(): Promise<HealthCheckResult> {
  if (!isStripeConfigured()) return notConfigured("stripe", "Stripe", "STRIPE_SECRET_KEY");
  return timed("stripe", "Stripe", async () => {
    await getStripe().balance.retrieve();
    return { detail: "Platform key authenticated" };
  });
}

// One list call per 100 connected accounts per mode, so cache longer than the route's 60s.
const STRIPE_CONNECT_TTL_MS = 10 * 60 * 1000;
const STRIPE_CONNECT_MAX_ACCOUNTS = 1000;
let stripeConnectCache: { at: number; result: HealthCheckResult } | null = null;

async function listConnectedAccounts(stripe: Stripe): Promise<Map<string, Stripe.Account>> {
  const accounts = new Map<string, Stripe.Account>();
  for await (const account of stripe.accounts.list({ limit: 100 })) {
    accounts.set(account.id, account);
    if (accounts.size >= STRIPE_CONNECT_MAX_ACCOUNTS) break;
  }
  return accounts;
}

/**
 * Each org has its own Stripe Connect account. Reads them live from Stripe
 * (the cached status on `organizations` is webhook-driven and can go stale)
 * and flags any that are restricted, can't charge or pay out, have
 * past-due requirements, or no longer exist on the platform.
 */
async function checkStripeConnect(): Promise<HealthCheckResult> {
  if (!isStripeConfigured()) return notConfigured("stripe_connect", "Stripe — org accounts", "STRIPE_SECRET_KEY");
  if (stripeConnectCache && Date.now() - stripeConnectCache.at < STRIPE_CONNECT_TTL_MS) return stripeConnectCache.result;
  const result = await runStripeConnectCheck();
  stripeConnectCache = { at: Date.now(), result };
  return result;
}

async function runStripeConnectCheck(): Promise<HealthCheckResult> {
  return timed("stripe_connect", "Stripe — org accounts", async () => {
    const db = createServiceClient();
    const { data, error } = await db
      .from("organizations")
      .select("id, name, stripe_connect_account_id, stripe_connect_livemode")
      .not("stripe_connect_account_id", "is", null);
    if (error) throw new Error(error.message);
    const orgs = data ?? [];
    if (orgs.length === 0) return { detail: "No orgs have connected Stripe" };

    // Orgs connected in Stripe test mode (rare) live under the separate test key.
    const liveAccounts = await listConnectedAccounts(getStripe());
    const testKey = process.env.STRIPE_SECRET_KEY_TEST;
    const needsTest = orgs.some((o) => o.stripe_connect_livemode === false);
    const testAccounts = needsTest && testKey ? await listConnectedAccounts(new Stripe(testKey)) : new Map<string, Stripe.Account>();

    const problems: { label: string; detail: string }[] = [];
    for (const org of orgs) {
      const accountId = org.stripe_connect_account_id as string;
      const isTest = org.stripe_connect_livemode === false;
      if (isTest && !testKey) {
        problems.push({ label: org.name, detail: "Test-mode account but STRIPE_SECRET_KEY_TEST is not set" });
        continue;
      }
      const account = (isTest ? testAccounts : liveAccounts).get(accountId);
      if (!account) {
        problems.push({ label: org.name, detail: "Connected account not found in Stripe (disconnected or deauthorized)" });
        continue;
      }
      const reasons: string[] = [];
      if (account.requirements?.disabled_reason) reasons.push(`Restricted: ${account.requirements.disabled_reason.replace(/[._]/g, " ")}`);
      if (!account.charges_enabled) reasons.push("charges disabled");
      if (!account.payouts_enabled) reasons.push("payouts disabled");
      const pastDue = account.requirements?.past_due?.length ?? 0;
      if (pastDue > 0) reasons.push(`${pastDue} past-due requirement(s)`);
      if (reasons.length > 0) problems.push({ label: org.name, detail: reasons.join(" · ") });
    }

    if (problems.length === 0) return { detail: `${orgs.length} connected account(s), all able to charge and pay out` };
    return {
      status: problems.length === orgs.length ? "down" : "degraded",
      detail: `${problems.length} of ${orgs.length} connected account(s) have a problem`,
      failures: problems,
    };
  });
}

async function checkResend(): Promise<HealthCheckResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return notConfigured("resend", "Resend (email)", "RESEND_API_KEY");
  return timed("resend", "Resend (email)", async (signal) => {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
      signal,
    });
    if (res.ok) return { detail: "API key valid" };
    // A send-only key can't list domains: Resend answers 401 restricted_api_key.
    // That still proves the key is real, which is all this check is for.
    if (res.status === 401) {
      const body = (await res.json().catch(() => null)) as { name?: string } | null;
      if (body?.name === "restricted_api_key") return { detail: "Send-only key valid" };
      throw new Error("API key rejected (401)");
    }
    throw new Error(`Unexpected response (${res.status})`);
  });
}

async function checkTwilioAccount(
  id: string,
  name: string,
  sidVar: string,
  tokenVar: string
): Promise<HealthCheckResult> {
  const sid = process.env[sidVar];
  const token = process.env[tokenVar];
  if (!sid || !token) return notConfigured(id, name, `${sidVar} / ${tokenVar}`);
  return timed(id, name, async (signal) => {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
      signal,
    });
    if (!res.ok) throw new Error(`Account lookup failed (${res.status})`);
    const body = (await res.json()) as { status?: string };
    if (body.status && body.status !== "active") {
      return { status: "degraded", detail: `Account status: ${body.status}` };
    }
    return { detail: "Account active" };
  });
}

/** Twins' own account (SMS fallback + inbound webhook) and the Landscapt ISV account that owns every org's subaccount are separate. */
const checkTwilioTwins = () => checkTwilioAccount("twilio_twins", "Twilio — Twins account", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN");
const checkTwilioPlatform = () =>
  checkTwilioAccount("twilio_platform", "Twilio — platform account", "TWILIO_PLATFORM_ACCOUNT_SID", "TWILIO_PLATFORM_AUTH_TOKEN");

/**
 * Twilio is per-org: each org gets its own subaccount and A2P registration
 * (profile → brand → campaign), and Twilio can reject any step. The platform
 * check above only proves the parent account works; this one surfaces orgs
 * whose registration was rejected, with Twilio's reason.
 */
async function checkTwilioRegistrations(): Promise<HealthCheckResult> {
  return timed("twilio_orgs", "Twilio — org registrations", async () => {
    const db = createServiceClient();
    const { data, error } = await db
      .from("org_sms_registrations")
      .select("org_id, status, twilio_brand_failure_reason, twilio_campaign_failure_reason")
      .is("deleted_at", null)
      .is("released_at", null);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length === 0) return { detail: "No orgs registered" };

    const rejected = rows.filter((r) => r.status.endsWith("_rejected"));
    if (rejected.length === 0) return { detail: `${rows.length} org registration(s), none rejected` };

    const { data: orgs } = await db.from("organizations").select("id, name").in("id", rejected.map((r) => r.org_id));
    const names = new Map((orgs ?? []).map((o) => [o.id, o.name]));
    return {
      status: "degraded",
      detail: `${rejected.length} of ${rows.length} org registration(s) rejected`,
      failures: rejected.map((r) => ({
        label: names.get(r.org_id) ?? "Unknown org",
        detail: `${r.status.replace(/_/g, " ")}${
          r.status === "campaign_rejected" ? (r.twilio_campaign_failure_reason ? `: ${r.twilio_campaign_failure_reason}` : "") : r.twilio_brand_failure_reason ? `: ${r.twilio_brand_failure_reason}` : ""
        }`.slice(0, 400),
      })),
    };
  });
}

// One vault read + one Twilio call per org, so cache longer than the route's 60s.
const SUBACCOUNT_TTL_MS = 10 * 60 * 1000;
const SUBACCOUNT_CONCURRENCY = 5;
let subaccountCache: { at: number; result: HealthCheckResult } | null = null;

/**
 * Authenticates as each org's own Twilio subaccount using its stored API
 * key/secret (the same credentials sends use) and confirms the subaccount is
 * active. Catches a revoked key, a missing Vault secret, or a suspended
 * subaccount before an org's texts start failing.
 */
async function checkTwilioSubaccounts(): Promise<HealthCheckResult> {
  if (subaccountCache && Date.now() - subaccountCache.at < SUBACCOUNT_TTL_MS) return subaccountCache.result;
  const result = await runTwilioSubaccountCheck();
  subaccountCache = { at: Date.now(), result };
  return result;
}

async function runTwilioSubaccountCheck(): Promise<HealthCheckResult> {
  return timed("twilio_subaccounts", "Twilio — org subaccounts", async () => {
    const db = createServiceClient();
    const { data, error } = await db
      .from("org_sms_registrations")
      .select("org_id")
      .not("twilio_subaccount_sid", "is", null)
      .not("twilio_api_key_sid", "is", null)
      .is("deleted_at", null)
      .is("released_at", null);
    if (error) throw new Error(error.message);
    const orgIds = (data ?? []).map((r) => r.org_id);
    if (orgIds.length === 0) return { detail: "No org subaccounts" };

    const problems: { orgId: string; detail: string }[] = [];
    let next = 0;
    const worker = async () => {
      while (next < orgIds.length) {
        const orgId = orgIds[next++];
        const problem = await probeOrgSubaccount(db, orgId);
        if (problem) problems.push({ orgId, detail: problem });
      }
    };
    await Promise.all(Array.from({ length: Math.min(SUBACCOUNT_CONCURRENCY, orgIds.length) }, worker));

    if (problems.length === 0) return { detail: `${orgIds.length} subaccount(s) authenticated and active` };

    const { data: orgs } = await db.from("organizations").select("id, name").in("id", problems.map((p) => p.orgId));
    const names = new Map((orgs ?? []).map((o) => [o.id, o.name]));
    return {
      status: problems.length === orgIds.length ? "down" : "degraded",
      detail: `${problems.length} of ${orgIds.length} org subaccount(s) have a problem`,
      failures: problems.map((p) => ({ label: names.get(p.orgId) ?? "Unknown org", detail: p.detail })),
    };
  });
}

/** Returns a short problem description, or null when the subaccount is healthy. */
async function probeOrgSubaccount(db: ReturnType<typeof createServiceClient>, orgId: string): Promise<string | null> {
  try {
    const creds = await getOrgTwilioCreds(db, orgId);
    if (!creds) return "Credentials unavailable (API secret missing from Vault)";
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${creds.subaccountSid}.json`, {
      headers: { Authorization: `Basic ${Buffer.from(`${creds.apiKeySid}:${creds.apiKeySecret}`).toString("base64")}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 401 || res.status === 403) return `API key rejected (${res.status}) — revoked or secret out of sync`;
    if (!res.ok) return `Twilio returned ${res.status}`;
    const body = (await res.json()) as { status?: string };
    if (body.status && body.status !== "active") return `Subaccount ${body.status}`;
    return null;
  } catch (err) {
    return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError") ? "Timed out" : "Check failed";
  }
}

// Geocoding is a billed call, so it gets its own long cache instead of the
// route's 60s one, and the Re-check button doesn't bypass it. ~4 calls/day
// per server instance at most.
const MAPS_TTL_MS = 6 * 60 * 60 * 1000;
let mapsCache: { at: number; result: HealthCheckResult } | null = null;

async function checkGoogleMaps(): Promise<HealthCheckResult> {
  if (mapsCache && Date.now() - mapsCache.at < MAPS_TTL_MS) {
    const checked = new Date(mapsCache.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return { ...mapsCache.result, detail: `${mapsCache.result.detail} · checked ${checked}` };
  }
  const result = await runGoogleMapsCheck();
  // Don't cache a missing key — fixing the env var should show up immediately.
  if (result.status !== "not_configured") mapsCache = { at: Date.now(), result };
  return result;
}

async function runGoogleMapsCheck(): Promise<HealthCheckResult> {
  const key = process.env.GOOGLE_MAPS_PLATFORM_API_KEY;
  if (!key) return notConfigured("google_maps", "Google Maps Platform", "GOOGLE_MAPS_PLATFORM_API_KEY");
  return timed("google_maps", "Google Maps Platform", async (signal) => {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=Boston%2C%20MA&key=${encodeURIComponent(key)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { status?: string; error_message?: string };
    if (body.status === "OK" || body.status === "ZERO_RESULTS") return { detail: "Geocoding API responding" };
    throw new Error(`Geocoding ${body.status ?? "error"}${body.error_message ? `: ${body.error_message}` : ""}`.slice(0, 160));
  });
}

// Each probe is a billed Geocoding call on the ORG's own Google account, so cache for hours.
const ORG_MAPS_TTL_MS = 6 * 60 * 60 * 1000;
const ORG_MAPS_CONCURRENCY = 5;
let orgMapsCache: { at: number; result: HealthCheckResult } | null = null;

async function checkOrgGoogleMapsKeys(): Promise<HealthCheckResult> {
  if (orgMapsCache && Date.now() - orgMapsCache.at < ORG_MAPS_TTL_MS) {
    const checked = new Date(orgMapsCache.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return { ...orgMapsCache.result, detail: `${orgMapsCache.result.detail} · checked ${checked}` };
  }
  const result = await runOrgGoogleMapsCheck();
  orgMapsCache = { at: Date.now(), result };
  return result;
}

/**
 * Orgs without Route Optimization (not Enterprise, no add-on) run on a Google
 * Maps key they saved under Settings → Integrations. Those keys are used
 * server-side (geocoding, address check, route optimization), so a key that is
 * invalid, lacks the Geocoding API, or is referrer-restricted breaks the
 * feature for that org. Entitled orgs use the platform key, so their saved key
 * (if any) is skipped. Keys never leave the server or appear in the result.
 */
async function runOrgGoogleMapsCheck(): Promise<HealthCheckResult> {
  return timed("org_google_maps", "Google Maps — org keys", async () => {
    const db = createServiceClient();
    const { data, error } = await db
      .from("organizations")
      .select("id, name, customizations")
      .not("customizations->>google_maps_api_key", "is", null);
    if (error) throw new Error(error.message);

    const candidates = (data ?? [])
      .map((o) => ({
        id: o.id,
        name: o.name,
        key: ((o.customizations as Record<string, unknown> | null)?.google_maps_api_key as string | undefined)?.trim() ?? "",
      }))
      .filter((o) => o.key);

    const targets: typeof candidates = [];
    for (const org of candidates) {
      if (!(await orgHasAddon(db, org.id, "route_optimization"))) targets.push(org);
    }
    if (targets.length === 0) return { detail: "No orgs rely on their own Google Maps key" };

    const problems: { label: string; detail: string }[] = [];
    let next = 0;
    const worker = async () => {
      while (next < targets.length) {
        const org = targets[next++];
        const problem = await probeGoogleMapsKey(org.key);
        if (problem) problems.push({ label: org.name, detail: problem });
      }
    };
    await Promise.all(Array.from({ length: Math.min(ORG_MAPS_CONCURRENCY, targets.length) }, worker));

    if (problems.length === 0) return { detail: `${targets.length} org key(s) working` };
    return {
      status: problems.length === targets.length ? "down" : "degraded",
      detail: `${problems.length} of ${targets.length} org Google Maps key(s) rejected`,
      failures: problems,
    };
  });
}

/** Short problem description, or null when the key can geocode. Never echoes the key. */
async function probeGoogleMapsKey(key: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=Boston%2C%20MA&key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) }
    );
    if (!res.ok) return `Google returned HTTP ${res.status}`;
    const body = (await res.json()) as { status?: string; error_message?: string };
    if (body.status === "OK" || body.status === "ZERO_RESULTS") return null;
    const message = (body.error_message ?? "").replace(key, "[key]");
    return `${body.status ?? "Error"}${message ? `: ${message}` : ""}`.slice(0, 240);
  } catch (err) {
    return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError") ? "Timed out" : "Check failed";
  }
}

async function checkAnthropic(): Promise<HealthCheckResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return notConfigured("anthropic", "Anthropic (Ask AI)", "ANTHROPIC_API_KEY");
  return timed("anthropic", "Anthropic (Ask AI)", async (signal) => {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      signal,
    });
    if (!res.ok) throw new Error(`API key check failed (${res.status})`);
    return { detail: "API key valid" };
  });
}

/**
 * Per-org OAuth/token integrations (QuickBooks, Samsara) have no platform call
 * to make. Report how many connected orgs failed their last sync, which, and why.
 */
async function checkOrgIntegration(
  provider: string,
  id: string,
  name: string
): Promise<HealthCheckResult> {
  return timed(id, name, async () => {
    const db = createServiceClient();
    const base = () => db.from("integrations").select("org_id, last_sync_status, last_sync_at, last_sync_error").eq("provider", provider).eq("enabled", true);
    const first = await base();
    let data = first.data;
    if (first.error) {
      // last_sync_error is newer than the rest of the table — tolerate an env that hasn't migrated yet.
      const fallback = await db
        .from("integrations")
        .select("org_id, last_sync_status, last_sync_at")
        .eq("provider", provider)
        .eq("enabled", true);
      if (fallback.error) throw new Error(fallback.error.message);
      data = (fallback.data ?? []).map((r) => ({ ...r, last_sync_error: null }));
    }
    const rows = data ?? [];
    const total = rows.length;
    if (total === 0) return { detail: "No orgs connected" };

    const failing = rows.filter((r) => r.last_sync_status === "error" || r.last_sync_status === "partial");
    if (failing.length === 0) return { detail: `${total} connected org(s), all syncing` };

    const { data: orgs } = await db
      .from("organizations")
      .select("id, name")
      .in("id", failing.map((r) => r.org_id));
    const names = new Map((orgs ?? []).map((o) => [o.id, o.name]));
    const hardFailures = failing.filter((r) => r.last_sync_status === "error").length;
    return {
      status: hardFailures === total ? "down" : "degraded",
      detail: `${failing.length} of ${total} connected org(s) failing to sync`,
      failures: failing.map((r) => ({
        label: names.get(r.org_id) ?? "Unknown org",
        detail: `${r.last_sync_error ?? (r.last_sync_status === "partial" ? "Partial sync" : "Sync failed (no reason recorded)")}${
          r.last_sync_at ? ` · ${new Date(r.last_sync_at).toLocaleString("en-US")}` : ""
        }`,
      })),
    };
  });
}

async function checkQuickBooks(): Promise<HealthCheckResult> {
  if (!process.env.QUICKBOOKS_CLIENT_ID || !process.env.QUICKBOOKS_CLIENT_SECRET) {
    return notConfigured("quickbooks", "QuickBooks", "QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET");
  }
  return checkOrgIntegration("quickbooks", "quickbooks", "QuickBooks");
}

function checkEnvConfig(): HealthCheckResult {
  const required = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "CRON_SECRET",
    "RESEND_WEBHOOK_SECRET",
    "STRIPE_WEBHOOK_SECRET",
  ];
  const missing = required.filter((k) => !process.env[k]);
  return {
    id: "env",
    name: "Required environment variables",
    status: missing.length === 0 ? "ok" : "degraded",
    latencyMs: null,
    detail: missing.length === 0 ? `${required.length} of ${required.length} set` : `Missing: ${missing.join(", ")}`,
  };
}

/** Samsara's own outages are covered by the UptimeRobot monitor, not here. */
function checkSamsara(): Promise<HealthCheckResult> {
  return checkOrgIntegration("samsara", "samsara", "Samsara (telematics)");
}

export async function runHealthChecks(): Promise<HealthCheckResult[]> {
  const results = await Promise.all([
    checkSupabaseDb(),
    checkSupabaseAuth(),
    checkSupabaseStorage(),
    checkStripe(),
    checkStripeConnect(),
    checkResend(),
    checkTwilioTwins(),
    checkTwilioPlatform(),
    checkTwilioRegistrations(),
    checkTwilioSubaccounts(),
    checkGoogleMaps(),
    checkOrgGoogleMapsKeys(),
    checkAnthropic(),
    checkQuickBooks(),
    checkSamsara(),
  ]);
  return [...results, checkEnvConfig()];
}

const UPTIME_ROBOT_STATUS_PAGE = "taTmWtuTlT";

interface UptimeRobotMonitor {
  name: string;
  statusClass: string;
  "30dRatio"?: { ratio: string };
  dailyRatios?: { date: string; ratio: string; label: string }[];
}

/**
 * UptimeRobot's public status page sends X-Frame-Options: DENY, so it can't be
 * iframed. Its page loads from a public JSON feed instead; read the same feed
 * server-side and render it natively.
 */
export async function fetchUptimeMonitors(): Promise<UptimeMonitor[]> {
  const res = await fetch(`https://stats.uptimerobot.com/api/getMonitorList/${UPTIME_ROBOT_STATUS_PAGE}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`UptimeRobot responded ${res.status}`);
  const body = (await res.json()) as { data?: UptimeRobotMonitor[] };
  return (body.data ?? []).map((m) => ({
    name: m.name,
    status: m.statusClass === "success" ? "up" : m.statusClass === "danger" ? "down" : m.statusClass === "paused" ? "paused" : "unknown",
    ratio30d: m["30dRatio"] ? Number(m["30dRatio"].ratio) : null,
    days: (m.dailyRatios ?? []).slice(-30).map((d) => ({
      date: d.date,
      // "black"/grey days predate the monitor — no data, not an outage.
      ratio: d.label === "black" ? null : Number(d.ratio),
    })),
  }));
}
