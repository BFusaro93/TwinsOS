import { randomBytes } from "crypto";
import { logger } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/server";
import { computeDueDate, resolveInvoiceTerms } from "@/lib/invoices/due-date";
import { AR_WRITE_OFF_METHOD } from "@/lib/reports/helpers";

const log = logger.child("quickbooks");

/**
 * QuickBooks Online OAuth2 + API helpers. Server-only — never import from a
 * "use client" component. One row per org in the shared `integrations` table
 * (provider = "quickbooks"), matching the pattern that table's own migration
 * comment describes. This is Phase 1 (connection) only: token exchange,
 * refresh, revoke, and a CompanyInfo call for the "connected" status check.
 * No data sync yet — that's later phases.
 */

const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const SCOPE = "com.intuit.quickbooks.accounting";

export type QuickBooksEnvironment = "sandbox" | "production";

/**
 * Which Intuit environment an org talks to. Orgs listed in
 * QUICKBOOKS_SANDBOX_ORG_IDS (comma-separated) always use the sandbox keys, so a
 * test org keeps its sandbox connection while every other org uses the
 * deployment's default environment (QUICKBOOKS_ENVIRONMENT, sandbox when
 * unset). Same idea as Stripe's per-org livemode.
 */
export function resolveQuickBooksEnvironment(orgId: string): QuickBooksEnvironment {
  const sandboxOrgs = (process.env.QUICKBOOKS_SANDBOX_ORG_IDS ?? "")
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);
  if (sandboxOrgs.includes(orgId.toLowerCase())) return "sandbox";
  return process.env.QUICKBOOKS_ENVIRONMENT === "production" ? "production" : "sandbox";
}

/** Sandbox keys when set (QUICKBOOKS_CLIENT_ID_SANDBOX/_SECRET_SANDBOX), else the default pair — which is the sandbox pair on deployments that run entirely in sandbox. */
function credentialsFor(env: QuickBooksEnvironment): { clientId: string; clientSecret: string } | null {
  const sandboxId = process.env.QUICKBOOKS_CLIENT_ID_SANDBOX;
  const sandboxSecret = process.env.QUICKBOOKS_CLIENT_SECRET_SANDBOX;
  if (env === "sandbox" && sandboxId && sandboxSecret) return { clientId: sandboxId, clientSecret: sandboxSecret };
  // A sandbox org on a production deployment (QUICKBOOKS_SANDBOX_ORG_IDS) needs the sandbox pair:
  // Intuit's development and production keys differ, so falling back to the production pair
  // against the sandbox API only produced an opaque token error. Report it as not configured.
  if (env === "sandbox" && process.env.QUICKBOOKS_ENVIRONMENT === "production") return null;
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function isQuickBooksConfigured(orgId: string): boolean {
  return credentialsFor(resolveQuickBooksEnvironment(orgId)) !== null;
}

function requireCredentials(env: QuickBooksEnvironment): { clientId: string; clientSecret: string } {
  const creds = credentialsFor(env);
  if (!creds) throw new Error(`QuickBooks ${env} credentials are not configured`);
  return creds;
}

function apiBaseUrl(env: QuickBooksEnvironment): string {
  return env === "production" ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com";
}

/** CSRF token for the OAuth redirect round trip — set in a cookie at /connect, verified at /callback. */
export function generateState(): string {
  return randomBytes(24).toString("hex");
}

export function getAuthorizeUrl(redirectUri: string, state: string, env: QuickBooksEnvironment): string {
  const params = new URLSearchParams({
    client_id: requireCredentials(env).clientId,
    response_type: "code",
    scope: SCOPE,
    redirect_uri: redirectUri,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

function basicAuthHeader(env: QuickBooksEnvironment): string {
  const { clientId, clientSecret } = requireCredentials(env);
  const raw = `${clientId}:${clientSecret}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

async function requestTokens(body: URLSearchParams, env: QuickBooksEnvironment): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(env),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QuickBooks token request failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function exchangeCodeForTokens(code: string, redirectUri: string, env: QuickBooksEnvironment): Promise<TokenResponse> {
  return requestTokens(
    new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    env
  );
}

export async function refreshTokens(refreshToken: string, env: QuickBooksEnvironment): Promise<TokenResponse> {
  return requestTokens(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }), env);
}

/** Best-effort — a failed revoke just leaves a dead token that expires on its own; never block disconnect on it. */
export async function revokeToken(token: string, env: QuickBooksEnvironment): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(env),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    log.error("failed to revoke QuickBooks token", { err });
  }
}

export interface QuickBooksConnection {
  accessToken: string;
  realmId: string;
  baseUrl: string;
}

interface QuickBooksIntegrationConfig {
  access_token: string;
  refresh_token: string;
  realm_id: string;
  expires_at: string;
  /** Recorded at connect time so refreshes keep using the keys the tokens were issued under. Absent on older rows. */
  environment?: QuickBooksEnvironment;
}

/**
 * Loads the org's stored connection, refreshing the access token first if
 * it's within 5 minutes of expiring. Returns null if the org has never
 * connected QuickBooks or the integration was disabled.
 *
 * The integrations row holds the OAuth tokens, so RLS makes it admin-only;
 * invoice/payment sync is fired by whichever staff member sends or records
 * it. Callers authorize the user and pass the orgId from their session, and
 * the token read/refresh here always goes through the service role. The
 * `_db` parameter is kept for call-site compatibility.
 */
export async function getValidConnection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _db: any,
  orgId: string
): Promise<QuickBooksConnection | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;
  const { data: row } = await db
    .from("integrations")
    .select("id, config, enabled")
    .eq("org_id", orgId)
    .eq("provider", "quickbooks")
    .maybeSingle();
  if (!row || !row.enabled) return null;

  const config = row.config as QuickBooksIntegrationConfig;
  const env = config.environment ?? resolveQuickBooksEnvironment(orgId);

  if (new Date(config.expires_at).getTime() - Date.now() < 5 * 60 * 1000) {
    let tokens: Awaited<ReturnType<typeof refreshTokens>>;
    try {
      tokens = await refreshTokens(config.refresh_token, env);
    } catch (err) {
      // Intuit rotates the refresh token on use, so a request that lost the race can be refused
      // with invalid_grant even though the winner already stored a working pair — use that.
      const { data: fresh } = await db.from("integrations").select("config").eq("id", row.id).single();
      const freshConfig = fresh?.config as QuickBooksIntegrationConfig | undefined;
      if (freshConfig && freshConfig.refresh_token !== config.refresh_token) {
        return { accessToken: freshConfig.access_token, realmId: freshConfig.realm_id, baseUrl: apiBaseUrl(env) };
      }
      // Genuinely expired/revoked: say so (the callers promise never to throw, and the org needs
      // a "reconnect QuickBooks" signal instead of a stale "ok").
      log.error("QuickBooks token refresh failed", { err, orgId });
      await db
        .from("integrations")
        .update({ last_sync_at: new Date().toISOString(), last_sync_status: "error" })
        .eq("id", row.id);
      return null;
    }
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const nextConfig: QuickBooksIntegrationConfig = {
      ...config,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
    };
    // Optimistic write, conditioned on the refresh_token we just rotated
    // still being the one on record — invoice-sync and payment-sync fire as
    // separate requests, so two can land here near-simultaneously, both read
    // the same soon-to-expire refresh_token, and both call Intuit's
    // rotate-on-use refresh endpoint. Without this check, whichever write
    // lands last silently overwrites the other's freshly-issued token pair,
    // orphaning it. If our write doesn't match a row (we lost the race),
    // re-read the row the winner already wrote instead of returning our own
    // now-superseded tokens.
    const { data: updated } = await db
      .from("integrations")
      .update({ config: nextConfig, last_sync_at: new Date().toISOString(), last_sync_status: "ok" })
      .eq("id", row.id)
      .eq("config->>refresh_token", config.refresh_token)
      .select("config")
      .maybeSingle();
    if (!updated) {
      const { data: fresh } = await db.from("integrations").select("config").eq("id", row.id).single();
      const freshConfig = fresh.config as QuickBooksIntegrationConfig;
      return { accessToken: freshConfig.access_token, realmId: freshConfig.realm_id, baseUrl: apiBaseUrl(env) };
    }
    return { accessToken: tokens.access_token, realmId: config.realm_id, baseUrl: apiBaseUrl(env) };
  }

  return { accessToken: config.access_token, realmId: config.realm_id, baseUrl: apiBaseUrl(env) };
}

export async function fetchCompanyInfo(conn: QuickBooksConnection): Promise<{ companyName: string }> {
  const res = await fetch(`${conn.baseUrl}/v3/company/${conn.realmId}/companyinfo/${conn.realmId}`, {
    headers: { Authorization: `Bearer ${conn.accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`QuickBooks CompanyInfo request failed (${res.status})`);
  const data = await res.json();
  return { companyName: data.CompanyInfo?.CompanyName ?? "Connected company" };
}

// ── Phase 2: customer matching ──────────────────────────────────────────────

/** QBO's query language escapes a literal single quote by doubling it. */
// QuickBooks' query language escapes a quote (and a backslash) with a backslash,
// not by doubling it — "O''Brien" is a parse error, so a client like
// "Mike's Landscaping" could never be matched or created.
function escapeQboString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function qboQuery(conn: QuickBooksConnection, query: string, entity: string): Promise<any[]> {
  const url = `${conn.baseUrl}/v3/company/${conn.realmId}/query?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${conn.accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QuickBooks query failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.QueryResponse?.[entity] ?? [];
}

export interface QboCustomerCandidate {
  id: string;
  displayName: string;
}

export interface CreateCustomerInput {
  displayName: string;
  email?: string | null;
  phone?: string | null;
  billingAddressLine1?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingZip?: string | null;
}

/** Intuit 6240 "Duplicate Name Exists": QuickBooks names are unique across customers, vendors
 *  and employees, so a vendor or employee already has this client's name. Retrying can't fix
 *  it — the client must be renamed or linked to the existing record by hand. */
export const QBO_DUPLICATE_NAME_MESSAGE =
  "This client's name already exists as a vendor or employee in QuickBooks — rename the client or link it to a QuickBooks customer from the client's QuickBooks section.";

export class QboDuplicateNameError extends Error {
  constructor() {
    super(QBO_DUPLICATE_NAME_MESSAGE);
    this.name = "QboDuplicateNameError";
  }
}

/** The client's QuickBooks customer exists but was made inactive there — QuickBooks won't take
 *  new invoices or payments for it until it's active again. */
export const QBO_INACTIVE_CUSTOMER_MESSAGE =
  "This client's QuickBooks customer is inactive in QuickBooks — make it active again there, or link this client to a different QuickBooks customer from the client's QuickBooks section.";

export class QboInactiveCustomerError extends Error {
  constructor() {
    super(QBO_INACTIVE_CUSTOMER_MESSAGE);
    this.name = "QboInactiveCustomerError";
  }
}

/**
 * What customer matching needs to know about the Landscapt side, so two
 * different clients that happen to share a name never end up on ONE
 * QuickBooks customer (their invoices and payments would merge there).
 */
export interface CustomerMatchContext {
  /** True when a DIFFERENT (non-deleted) client in the org is already linked to this QuickBooks customer. */
  isLinkedToOtherClient: (customerId: string) => Promise<boolean>;
  /** The name to create this client's customer under when its plain name is taken: "<name> (acct #<number>)". */
  disambiguatedName: string;
}

/** "<name> (acct #123)", or "<name> (ref 1a2b3c4d)" for a client with no account number. */
export function disambiguatedCustomerName(displayName: string, accountNumber: string | number | null | undefined, clientId: string): string {
  const acct = accountNumber == null ? "" : String(accountNumber).trim();
  const suffix = acct ? `acct #${acct}` : `ref ${clientId.replace(/-/g, "").slice(0, 8)}`;
  return `${displayName.trim()} (${suffix})`;
}

/**
 * Builds the matching context for one client. `db` only needs read access to
 * the org's clients (a signed-in user's client works).
 */
export function customerMatchContextFor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  client: { id: string; display_name: string; account_number?: string | number | null }
): CustomerMatchContext {
  return {
    disambiguatedName: disambiguatedCustomerName(client.display_name, client.account_number, client.id),
    isLinkedToOtherClient: async (customerId: string) => {
      const { data, error } = await db
        .from("clients")
        .select("id")
        .eq("org_id", orgId)
        .eq("qbo_customer_id", customerId)
        .neq("id", client.id)
        .is("deleted_at", null)
        .limit(1);
      if (error) throw new Error(`Could not check existing QuickBooks links: ${error.message}`);
      return (data ?? []).length > 0;
    },
  };
}

/** Customers with exactly this DisplayName — INCLUDING inactive ones (a plain query only returns active). */
async function findCustomersByExactName(conn: QuickBooksConnection, displayName: string): Promise<{ Id: string; Active?: boolean }[]> {
  return qboQuery(
    conn,
    `SELECT Id, DisplayName, Active FROM Customer WHERE DisplayName = '${escapeQboString(displayName)}' AND Active IN (true, false)`,
    "Customer"
  );
}

/**
 * Creates the client's customer under its disambiguated name — or reuses a
 * customer already carrying that exact name and linked to no other client
 * (created by an earlier attempt whose link didn't save).
 */
async function createDisambiguatedCustomer(
  conn: QuickBooksConnection,
  input: CreateCustomerInput,
  ctx: CustomerMatchContext
): Promise<string> {
  const existing = await findCustomersByExactName(conn, ctx.disambiguatedName);
  if (existing.length === 1 && !(await ctx.isLinkedToOtherClient(existing[0].Id))) {
    if (existing[0].Active === false) throw new QboInactiveCustomerError();
    return existing[0].Id;
  }
  return createCustomer(conn, { ...input, displayName: ctx.disambiguatedName });
}

/**
 * Creates a customer under the client's plain name; when QuickBooks already
 * has that name (code 6240 — a vendor, an employee, or an inactive customer),
 * retries once under the disambiguated name instead of failing.
 */
export async function createCustomerWithFallback(
  conn: QuickBooksConnection,
  input: CreateCustomerInput,
  ctx: CustomerMatchContext
): Promise<string> {
  try {
    return await createCustomer(conn, input);
  } catch (err) {
    if (!(err instanceof QboDuplicateNameError)) throw err;
    return createDisambiguatedCustomer(conn, input, ctx);
  }
}

export async function createCustomer(conn: QuickBooksConnection, input: CreateCustomerInput): Promise<string> {
  const body: Record<string, unknown> = { DisplayName: input.displayName };
  if (input.email) body.PrimaryEmailAddr = { Address: input.email };
  if (input.phone) body.PrimaryPhone = { FreeFormNumber: input.phone };
  if (input.billingAddressLine1 || input.billingCity) {
    body.BillAddr = {
      ...(input.billingAddressLine1 && { Line1: input.billingAddressLine1 }),
      ...(input.billingCity && { City: input.billingCity }),
      ...(input.billingState && { CountrySubDivisionCode: input.billingState }),
      ...(input.billingZip && { PostalCode: input.billingZip }),
    };
  }

  const res = await fetch(`${conn.baseUrl}/v3/company/${conn.realmId}/customer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (/"code"\s*:\s*"6240"|Duplicate Name Exists/i.test(text)) throw new QboDuplicateNameError();
    throw new Error(`QuickBooks customer creation failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.Customer.Id as string;
}

export interface FindOrCreateResult {
  status: "matched" | "created" | "ambiguous";
  customerId?: string;
  candidates?: QboCustomerCandidate[];
}

/**
 * Matching policy (see TASKS.md for the fuller reasoning): QuickBooks
 * enforces DisplayName uniqueness across all customers/vendors/employees,
 * so an exact DisplayName match can only ever return 0 or 1 row — when it
 * returns exactly 1, that's a safe auto-link. Otherwise falls back to a
 * fuzzy LIKE search: zero results auto-creates a new customer, but ANY
 * fuzzy-only result (even a single one — e.g. "John Smith" vs. "John Smith
 * Jr.") is surfaced for a human to confirm rather than guessed. Silently
 * linking the wrong customer is worse than one extra click.
 */
/**
 * Confirms a customer id actually exists in this org's own QBO company
 * before it's trusted — used when force-linking a client to a specific
 * customer id supplied by the request body, so a bad/unrelated id can't get
 * silently written to clients.qbo_customer_id (it would otherwise only
 * surface later as an opaque 400 on the next invoice push).
 */
export async function customerExists(conn: QuickBooksConnection, customerId: string): Promise<boolean> {
  const rows = await qboQuery(conn, `SELECT Id FROM Customer WHERE Id = '${escapeQboString(customerId)}'`, "Customer");
  return rows.length === 1;
}

export async function findOrCreateCustomer(
  conn: QuickBooksConnection,
  input: CreateCustomerInput,
  ctx: CustomerMatchContext
): Promise<FindOrCreateResult> {
  const escaped = escapeQboString(input.displayName);

  // Inactive customers included: QuickBooks still reserves their names, so a
  // client whose customer was made inactive used to miss here and then fail
  // the create with 6240, reported as "a vendor or employee has this name".
  const exact = await findCustomersByExactName(conn, input.displayName);
  if (exact.length === 1) {
    const match = exact[0];
    // Same name, but ANOTHER client already owns that customer (two "John
    // Smith" accounts): linking this one too would merge their invoices and
    // payments in QuickBooks. Give this client its own customer instead.
    if (await ctx.isLinkedToOtherClient(match.Id)) {
      return { status: "created", customerId: await createDisambiguatedCustomer(conn, input, ctx) };
    }
    if (match.Active === false) throw new QboInactiveCustomerError();
    return { status: "matched", customerId: match.Id };
  }

  // `%` is the QuickBooks query wildcard: a name containing one ("100% Lawn") must not widen
  // the search to unrelated customers. Strip it (and `_`, for safety) from the fuzzy term.
  const fuzzyTerm = escaped.replace(/[%_]/g, " ").trim();
  const fuzzy = fuzzyTerm
    ? await qboQuery(conn, `SELECT Id, DisplayName FROM Customer WHERE DisplayName LIKE '%${fuzzyTerm}%'`, "Customer")
    : [];
  if (fuzzy.length === 0) {
    const customerId = await createCustomerWithFallback(conn, input, ctx);
    return { status: "created", customerId };
  }

  return {
    status: "ambiguous",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    candidates: fuzzy.map((c: any) => ({ id: c.Id, displayName: c.DisplayName })),
  };
}

// ── Phase 3: invoice + payment push ─────────────────────────────────────────

function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * A line whose name doesn't match any of the org's crm_services falls back
 * to this catchall QBO Service item, so ad-hoc/free-text lines never block
 * a push. Created once per org on first use; QBO enforces Item name
 * uniqueness the same way it does DisplayName, so this query can only ever
 * return 0 or 1 row.
 */
const DEFAULT_ITEM_NAME = "Services";

async function getIncomeAccountId(conn: QuickBooksConnection): Promise<string> {
  const accounts = await qboQuery(conn, "SELECT Id FROM Account WHERE AccountType = 'Income' MAXRESULTS 1", "Account");
  if (accounts.length === 0) {
    throw new Error("No QuickBooks Income account found — cannot create a Service item");
  }
  return accounts[0].Id;
}

async function createServiceItem(conn: QuickBooksConnection, name: string): Promise<string> {
  const incomeAccountId = await getIncomeAccountId(conn);
  const res = await fetch(`${conn.baseUrl}/v3/company/${conn.realmId}/item`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ Name: name, Type: "Service", IncomeAccountRef: { value: incomeAccountId } }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QuickBooks item creation failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.Item.Id as string;
}

async function getOrCreateItemByName(conn: QuickBooksConnection, name: string): Promise<string> {
  const existing = await qboQuery(conn, `SELECT Id FROM Item WHERE Name = '${escapeQboString(name)}'`, "Item");
  if (existing.length > 0) return existing[0].Id;
  return createServiceItem(conn, name);
}

export async function getOrCreateDefaultServiceItem(conn: QuickBooksConnection): Promise<string> {
  return getOrCreateItemByName(conn, DEFAULT_ITEM_NAME);
}

/**
 * Resolves each invoice line to its own QBO Item: a line whose name
 * exactly matches (case-insensitive) one of the org's crm_services gets
 * that service's dedicated QBO item — created and cached on
 * crm_services.qbo_item_id on first use — so QuickBooks-side reporting can
 * break down by service type. A line with no matching service (ad-hoc or
 * free-text) falls back to the shared catchall item. Loads the org's
 * services once and reuses it across all lines in one push.
 */
async function buildServiceItemResolver(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  conn: QuickBooksConnection,
  orgId: string
): Promise<(lineName: string | null | undefined) => Promise<string>> {
  const { data: services } = await db
    .from("crm_services")
    .select("id, name, qbo_item_id")
    .eq("org_id", orgId)
    .is("deleted_at", null);

  const byName = new Map<string, { id: string; qbo_item_id: string | null }>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (services ?? []).map((s: any) => [String(s.name).toLowerCase().trim(), s])
  );
  let defaultItemId: string | null = null;

  return async (lineName: string | null | undefined): Promise<string> => {
    const key = lineName?.toLowerCase().trim();
    const service = key ? byName.get(key) : undefined;
    if (service) {
      if (service.qbo_item_id) return service.qbo_item_id;
      const itemId = await getOrCreateItemByName(conn, lineName!);
      await db.from("crm_services").update({ qbo_item_id: itemId }).eq("id", service.id);
      service.qbo_item_id = itemId;
      return itemId;
    }
    if (!defaultItemId) defaultItemId = await getOrCreateDefaultServiceItem(conn);
    return defaultItemId;
  };
}

/**
 * Resolves a QuickBooks payment Term by days-to-due so the invoice's terms
 * pass through instead of QuickBooks applying the customer's default (Net 30).
 * Matches an existing STANDARD term with the same DueDays (preferring an exact
 * name match), else creates one named like Landscapt's own labels. Returns
 * null on any failure — the invoice still pushes with its DueDate, which
 * beats blocking a sync over a terms lookup.
 */
async function getTermIdForDays(conn: QuickBooksConnection, days: number): Promise<string | null> {
  try {
    const name = days === 0 ? "Due on receipt" : `Net ${days}`;
    const terms = (await qboQuery(conn, "SELECT Id, Name, DueDays, Type FROM Term WHERE Active = true", "Term")) as {
      Id: string;
      Name: string;
      DueDays?: number | string;
      Type?: string;
    }[];
    // QBO omits DueDays on a 0-day term (its built-in "Due on receipt"), so a
    // missing value means 0 — reading it as NaN made that term never match.
    const sameDays = terms.filter((t) => (t.Type ?? "STANDARD") === "STANDARD" && Number(t.DueDays ?? 0) === days);
    const isNamed = (t: { Name: string }) => String(t.Name).toLowerCase() === name.toLowerCase();
    const match = sameDays.find(isNamed) ?? sameDays[0] ?? terms.find(isNamed);
    if (match) return match.Id as string;

    const res = await fetch(`${conn.baseUrl}/v3/company/${conn.realmId}/term`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ Name: name, DueDays: days }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log.error("QuickBooks term creation failed — pushing with DueDate only", { status: res.status, text, days });
      return null;
    }
    const data = await res.json();
    return data.Term.Id as string;
  } catch (err) {
    log.error("QuickBooks term lookup failed — pushing with DueDate only", { err, days });
    return null;
  }
}

/** Whole days from invoice date to due date (both YYYY-MM-DD), or null if either is missing/invalid. */
function daysBetween(invoiceDate: string | null | undefined, dueDate: string | null | undefined): number | null {
  if (!invoiceDate || !dueDate) return null;
  const a = Date.parse(`${invoiceDate.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${dueDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000);
}

export interface QboInvoiceLineInput {
  description: string;
  qty: number;
  /** Gross line amount (rate × qty) — QBO rejects a line whose Amount isn't UnitPrice × Qty. */
  amountCents: number;
  /** Per-unit price in dollars; sent so QBO doesn't fall back to the Item's own price. */
  unitPrice?: number;
  itemId: string;
  /** Only meaningful with salesTaxCodeId (Automated Sales Tax): marks the line TAX vs NON. */
  taxable?: boolean;
}

export interface CreateInvoiceInput {
  customerId: string;
  invoiceDate: string;
  dueDate?: string | null;
  docNumber?: string | null;
  lines: QboInvoiceLineInput[];
  /** Pushed as a single DiscountLineDetail line — QBO applies it against the default discount account. */
  discountCents?: number;
  /**
   * Pushed as a manual TxnTaxDetail.TotalTax. NOTE: a QBO company with
   * Automated Sales Tax enabled computes tax itself from each line's
   * TaxCodeRef and typically rejects a manually-set total — unverified
   * against a real QuickBooks company (see TASKS.md). A rejection here
   * isn't silent: it surfaces through the normal error path into the
   * Phase 4 reconciliation panel with QuickBooks' own error text.
   */
  taxCents?: number;
  /** QuickBooks Term id (SalesTermRef) so terms pass through instead of the customer's default. */
  termId?: string | null;
  /**
   * A company with Automated Sales Tax computes tax itself from this tax code
   * and each line's TAX/NON flag, and silently ignores a manual TotalTax (the
   * invoice just comes out untaxed). When set, this replaces the taxCents path.
   */
  salesTaxCodeId?: string | null;
  /** Landscapt's total, used to flag any drift after QuickBooks computes its own. */
  expectedTotalCents?: number;
}

/** True for a company that uses Automated Sales Tax (every US QuickBooks Online company today). */
async function usesAutomatedSalesTax(conn: QuickBooksConnection): Promise<boolean> {
  try {
    const res = await fetch(`${conn.baseUrl}/v3/company/${conn.realmId}/preferences`, {
      headers: { Authorization: `Bearer ${conn.accessToken}`, Accept: "application/json" },
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.Preferences?.TaxPrefs?.UsingSalesTax === true;
  } catch {
    return false;
  }
}

/**
 * The QuickBooks sales tax code carrying exactly one rate equal to the
 * invoice's rate, creating it (and its rate) when the company doesn't have one
 * yet. Returns null if it can't be resolved — the caller then falls back to
 * an explicit tax line so the total still matches.
 */
async function getOrCreateSalesTaxCodeId(conn: QuickBooksConnection, rateBps: number): Promise<string | null> {
  try {
    const rate = rateBps / 100;
    const rates = await qboQuery(conn, "SELECT Id, Name, RateValue FROM TaxRate WHERE Active = true", "TaxRate");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchingRateIds = new Set(rates.filter((r: any) => Math.abs(Number(r.RateValue) - rate) < 0.00001).map((r: any) => String(r.Id)));
    if (matchingRateIds.size > 0) {
      const codes = await qboQuery(conn, "SELECT * FROM TaxCode WHERE Active = true", "TaxCode");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const code = codes.find((c: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const details: any[] = c.SalesTaxRateList?.TaxRateDetail ?? [];
        return details.length === 1 && matchingRateIds.has(String(details[0].TaxRateRef?.value));
      });
      if (code) return String(code.Id);
    }

    const agencies = await qboQuery(conn, "SELECT Id FROM TaxAgency", "TaxAgency");
    if (agencies.length === 0) return null;
    const name = `Landscapt ${rate}%`;
    const res = await fetch(`${conn.baseUrl}/v3/company/${conn.realmId}/taxservice/taxcode`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        TaxCode: name,
        TaxRateDetails: [{ TaxRateName: name, RateValue: String(rate), TaxAgencyId: String(agencies[0].Id), TaxApplicableOn: "Sales" }],
      }),
    });
    if (!res.ok) {
      log.error("QuickBooks tax code creation failed — falling back to a tax line", { status: res.status, text: await res.text().catch(() => ""), rateBps });
      return null;
    }
    const data = await res.json();
    return data.TaxCodeId ? String(data.TaxCodeId) : null;
  } catch (err) {
    log.error("QuickBooks tax code lookup failed — falling back to a tax line", { err, rateBps });
    return null;
  }
}

function buildInvoiceBody(input: CreateInvoiceInput, forUpdate = false): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines: Record<string, unknown>[] = input.lines.map((l) => ({
    DetailType: "SalesItemLineDetail",
    Amount: centsToDollars(l.amountCents),
    Description: l.description,
    SalesItemLineDetail: {
      ItemRef: { value: l.itemId },
      Qty: l.qty,
      ...(l.unitPrice != null ? { UnitPrice: l.unitPrice } : {}),
      ...(input.salesTaxCodeId ? { TaxCodeRef: { value: l.taxable ? "TAX" : "NON" } } : {}),
    },
  }));
  if (input.discountCents && input.discountCents > 0) {
    lines.push({
      DetailType: "DiscountLineDetail",
      Amount: centsToDollars(input.discountCents),
      DiscountLineDetail: {
        PercentBased: false,
        // Landscapt takes the discount off the taxable base before taxing it.
        ...(input.salesTaxCodeId ? { TaxCodeRef: { value: input.lines.some((l) => l.taxable) ? "TAX" : "NON" } } : {}),
      },
    });
  }

  const body: Record<string, unknown> = {
    CustomerRef: { value: input.customerId },
    TxnDate: input.invoiceDate,
    Line: lines,
  };
  if (input.dueDate) body.DueDate = input.dueDate;
  if (input.termId) body.SalesTermRef = { value: input.termId };
  if (input.docNumber) body.DocNumber = input.docNumber;
  if (input.salesTaxCodeId) {
    body.TxnTaxDetail = { TxnTaxCodeRef: { value: input.salesTaxCodeId } };
  } else if (input.taxCents && input.taxCents > 0) {
    body.TxnTaxDetail = { TotalTax: centsToDollars(input.taxCents) };
  } else if (forUpdate) {
    // An update that omits TxnTaxDetail leaves the old tax in place, so a
    // now-untaxed invoice must say so explicitly.
    body.TxnTaxDetail = { TotalTax: 0 };
  }
  return body;
}

async function qboInvoiceRequest(
  conn: QuickBooksConnection,
  body: Record<string, unknown>,
  operation?: "void",
  requestId?: string
): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams();
  if (operation) qs.set("operation", operation);
  if (requestId) qs.set("requestid", requestId.slice(0, 50));
  const q = qs.toString();
  const url = `${conn.baseUrl}/v3/company/${conn.realmId}/invoice${q ? `?${q}` : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QuickBooks invoice ${operation ?? (body.Id ? "update" : "creation")} failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.Invoice as Record<string, unknown>;
}

export interface QboWriteResult {
  id: string;
  /** What QuickBooks says the invoice totals, in cents — compared against Landscapt's to catch tax drift. */
  totalCents: number;
}

function toWriteResult(invoice: Record<string, unknown>): QboWriteResult {
  return { id: String(invoice.Id), totalCents: Math.round(Number(invoice.TotalAmt ?? 0) * 100) };
}

/**
 * requestId makes the create idempotent at Intuit: a retry after a lost response (or a second
 * sender racing the first) gets the original invoice back instead of creating a duplicate.
 */
export async function createInvoice(conn: QuickBooksConnection, input: CreateInvoiceInput, requestId?: string): Promise<QboWriteResult> {
  return toWriteResult(await qboInvoiceRequest(conn, buildInvoiceBody(input), undefined, requestId));
}

/** The invoice as QuickBooks currently holds it — its SyncToken is required for any update or void. */
async function getQboInvoice(conn: QuickBooksConnection, qboInvoiceId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${conn.baseUrl}/v3/company/${conn.realmId}/invoice/${encodeURIComponent(qboInvoiceId)}`, {
    headers: { Authorization: `Bearer ${conn.accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QuickBooks invoice lookup failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.Invoice as Record<string, unknown>;
}

/** QuickBooks keeps a voided invoice but zeroes it and notes "Voided"; it can never be edited again. */
function isQboInvoiceVoided(inv: Record<string, unknown>): boolean {
  return Number(inv.TotalAmt ?? 0) === 0 && /void/i.test(String(inv.PrivateNote ?? ""));
}

/**
 * An invoice QuickBooks already has under this number for this customer (not voided). QuickBooks
 * doesn't force unique invoice numbers, and a number shared with ANOTHER customer is an unrelated
 * invoice, so only a same-customer match counts.
 */
async function findQboInvoiceByNumber(
  conn: QuickBooksConnection,
  docNumber: string,
  customerId: string
): Promise<{ status: "none" } | { status: "ambiguous" } | { status: "match"; id: string; totalCents: number }> {
  const rows = (await qboQuery(
    conn,
    `SELECT Id, CustomerRef, TotalAmt, PrivateNote FROM Invoice WHERE DocNumber = '${escapeQboString(docNumber)}'`,
    "Invoice"
  )) as Record<string, unknown>[];
  const same = rows.filter(
    (r) => String((r.CustomerRef as { value?: string } | undefined)?.value ?? "") === customerId && !isQboInvoiceVoided(r)
  );
  if (same.length === 0) return { status: "none" };
  if (same.length > 1) return { status: "ambiguous" };
  return { status: "match", id: String(same[0].Id), totalCents: Math.round(Number(same[0].TotalAmt ?? 0) * 100) };
}

/** A stale SyncToken (another edit landed between our read and write) is QBO error 5010. */
function isStaleSyncToken(err: unknown): boolean {
  return err instanceof Error && /\b5010\b|stale object/i.test(err.message);
}

async function withFreshSyncToken(
  get: () => Promise<Record<string, unknown>>,
  write: (current: Record<string, unknown>) => Promise<Record<string, unknown>>
): Promise<Record<string, unknown>> {
  try {
    return await write(await get());
  } catch (err) {
    if (!isStaleSyncToken(err)) throw err;
    return write(await get());
  }
}

export async function updateInvoice(conn: QuickBooksConnection, qboInvoiceId: string, input: CreateInvoiceInput): Promise<QboWriteResult> {
  return toWriteResult(
    await withFreshSyncToken(() => getQboInvoice(conn, qboInvoiceId), (current) =>
      qboInvoiceRequest(conn, { ...buildInvoiceBody(input, true), Id: qboInvoiceId, SyncToken: current.SyncToken, sparse: true })
    )
  );
}

export async function voidInvoice(conn: QuickBooksConnection, qboInvoiceId: string): Promise<void> {
  await withFreshSyncToken(() => getQboInvoice(conn, qboInvoiceId), (current) =>
    qboInvoiceRequest(conn, { Id: qboInvoiceId, SyncToken: current.SyncToken }, "void")
  );
}

export interface CreatePaymentInput {
  customerId: string;
  qboInvoiceId: string;
  amountCents: number;
  paymentDate: string;
  /** Check number / reference — QuickBooks' PaymentRefNum, which caps at 21 characters. */
  referenceNumber?: string | null;
  /**
   * QuickBooks `requestid`: a retry or a concurrent second caller with the same
   * id gets the original response back instead of a duplicate Payment. Pass the
   * allocation id so the Stripe-webhook path and the manual/cron push can race
   * safely.
   */
  requestId?: string;
}

/** Marks a qbo_payment_id as a credit memo (+ its applying Payment) rather than a cash Payment. */
const CREDIT_MEMO_LINK_PREFIX = "cm:";

export function isCreditMemoLink(qboPaymentId: string): boolean {
  return qboPaymentId.startsWith(CREDIT_MEMO_LINK_PREFIX);
}

/** "cm:<creditMemoId>:<applyingPaymentId>" -> ids. */
function parseCreditMemoLink(link: string): { creditMemoId: string; applyPaymentId: string | null } {
  const [, creditMemoId, applyPaymentId] = link.split(":");
  return { creditMemoId, applyPaymentId: applyPaymentId || null };
}

async function qboPost(
  conn: QuickBooksConnection,
  entity: "creditmemo" | "payment",
  body: Record<string, unknown>,
  opts: { requestId?: string; operation?: "void" } = {}
): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams();
  if (opts.operation) qs.set("operation", opts.operation);
  if (opts.requestId) qs.set("requestid", opts.requestId.slice(0, 50));
  const q = qs.toString();
  const res = await fetch(`${conn.baseUrl}/v3/company/${conn.realmId}/${entity}${q ? `?${q}` : ""}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QuickBooks ${entity} ${opts.operation ?? "creation"} failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return (entity === "creditmemo" ? data.CreditMemo : data.Payment) as Record<string, unknown>;
}

export interface CreateCreditMemoInput {
  customerId: string;
  qboInvoiceId: string;
  amountCents: number;
  txnDate: string;
  note: string;
  requestId: string;
}

/**
 * Records an AR write-off / account credit as a QuickBooks CREDIT MEMO applied
 * to the invoice, never as a cash Payment, so it doesn't inflate cash
 * received. Two steps, both keyed by `requestid` so a retry after a partial
 * failure resumes instead of duplicating: create the credit memo, then a
 * zero-total Payment that links the credit memo to the invoice (QuickBooks'
 * way of applying a credit). Returns the combined link string stored in
 * qbo_payment_id.
 */
export async function createCreditMemoApplied(conn: QuickBooksConnection, input: CreateCreditMemoInput): Promise<string> {
  const amount = centsToDollars(input.amountCents);
  const itemId = await getOrCreateDefaultServiceItem(conn);
  const memo = await qboPost(
    conn,
    "creditmemo",
    {
      CustomerRef: { value: input.customerId },
      TxnDate: input.txnDate,
      PrivateNote: input.note,
      Line: [
        {
          Amount: amount,
          DetailType: "SalesItemLineDetail",
          Description: input.note,
          SalesItemLineDetail: { ItemRef: { value: itemId }, Qty: 1, UnitPrice: amount },
        },
      ],
    },
    { requestId: `cm-${input.requestId}` }
  );
  const creditMemoId = String(memo.Id);
  const applied = await qboPost(
    conn,
    "payment",
    {
      CustomerRef: { value: input.customerId },
      TotalAmt: 0,
      TxnDate: input.txnDate,
      Line: [
        {
          Amount: amount,
          LinkedTxn: [
            { TxnId: input.qboInvoiceId, TxnType: "Invoice" },
            { TxnId: creditMemoId, TxnType: "CreditMemo" },
          ],
        },
      ],
    },
    { requestId: `cma-${input.requestId}` }
  );
  return `${CREDIT_MEMO_LINK_PREFIX}${creditMemoId}:${String(applied.Id)}`;
}

export async function createPayment(conn: QuickBooksConnection, input: CreatePaymentInput): Promise<string> {
  const amount = centsToDollars(input.amountCents);
  const body = {
    CustomerRef: { value: input.customerId },
    TotalAmt: amount,
    TxnDate: input.paymentDate,
    ...(input.referenceNumber?.trim() ? { PaymentRefNum: input.referenceNumber.trim().slice(0, 21) } : {}),
    Line: [{ Amount: amount, LinkedTxn: [{ TxnId: input.qboInvoiceId, TxnType: "Invoice" }] }],
  };
  const created = await qboPost(conn, "payment", body, { requestId: input.requestId });
  return String(created.Id);
}

async function recordSyncResult(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  status: "ok" | "error"
): Promise<void> {
  await db
    .from("integrations")
    .update({ last_sync_status: status, last_sync_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("provider", "quickbooks");
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function resolveCustomerId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  conn: QuickBooksConnection,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  orgId: string
): Promise<{ customerId: string } | { ambiguous: true }> {
  if (client.qbo_customer_id) return { customerId: client.qbo_customer_id };

  const match = await findOrCreateCustomer(conn, {
    displayName: client.display_name,
    email: client.primary_email,
    phone: client.primary_phone,
    billingAddressLine1: client.billing_address,
    billingCity: client.billing_city,
    billingState: client.billing_state,
    billingZip: client.billing_zip,
  }, customerMatchContextFor(db, orgId, client));
  if (match.status === "ambiguous") return { ambiguous: true };

  const customerId = match.customerId!;
  // One client per QuickBooks customer is also a unique index; losing a race
  // for the same customer surfaces as this error rather than a silent double link.
  const { error } = await db.from("clients").update({ qbo_customer_id: customerId }).eq("id", client.id);
  if (error) throw new Error(`Matched QuickBooks customer #${customerId} but the link could not be saved: ${error.message}`);
  return { customerId };
}

export interface PushInvoiceResult {
  status: "pushed" | "updated" | "voided" | "already_synced" | "skipped" | "error";
  qboInvoiceId?: string;
  reason?: string;
}

/** Everything QuickBooks needs for an invoice, built from the persisted invoice row and its lines. */
async function buildInvoicePushInput(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  conn: QuickBooksConnection,
  orgId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoice: any,
  customerId: string
): Promise<CreateInvoiceInput> {
  const client = invoice.clients;
  const resolveItemId = await buildServiceItemResolver(db, conn, orgId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineItems = (invoice.crm_invoice_line_items ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order);
  const lines: QboInvoiceLineInput[] = lineItems.length > 0
    ? await Promise.all(
        lineItems.map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async (li: any) => {
            const qty = Number(li.qty) || 1;
            const amountCents: number = li.total_cents ?? 0;
            // UnitPrice must satisfy Amount = UnitPrice × Qty. The stored
            // rate does whenever total_cents is round(rate × qty) (every
            // invoicing path writes it that way); otherwise derive it.
            const rateCents = li.rate_cents as number | null;
            const unitPrice = rateCents != null && Math.round(rateCents * qty) === amountCents
              ? centsToDollars(rateCents)
              : Math.round((amountCents / qty) * 1e5) / 1e7;
            return {
              description: li.name ? `${li.name}${li.description ? ` — ${li.description}` : ""}` : (li.description ?? "Service"),
              qty,
              amountCents,
              unitPrice,
              itemId: await resolveItemId(li.name),
              taxable: !!li.is_taxable,
            };
          }
        )
      )
    : [{ description: invoice.description || "Service", qty: 1, amountCents: 0, itemId: await resolveItemId(null) }];

  // Line-level discounts (crm_invoice_line_items.discount_cents) used to be
  // dropped, so QuickBooks showed the pre-discount total. Lines stay gross
  // (keeps Amount = UnitPrice × Qty exact, which QBO validates), and every
  // line discount is folded into the single invoice DiscountLineDetail
  // together with the document-level discount — same net total as
  // Σ(total_cents − discount_cents) − invoice discount.
  const lineDiscountCents: number = lineItems.reduce(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s: number, li: any) => s + (li.discount_cents ?? 0),
    0
  );

  // The header's terms/due_date are only written by Save Invoice; an invoice
  // sent straight from the status menu has neither, and the UI just displays
  // the client default (else Due on Receipt). Resolve it the same way here, or
  // QuickBooks falls back to the customer's own default (Net 30).
  const dueDate: string | null =
    invoice.due_date ??
    (invoice.invoice_date
      ? computeDueDate(invoice.invoice_date, resolveInvoiceTerms(invoice.terms ?? client.default_terms, null))
      : null);
  const termDays = daysBetween(invoice.invoice_date, dueDate);
  const termId = termDays != null ? await getTermIdForDays(conn, termDays) : null;

  // Tax. An Automated Sales Tax company ignores a hand-set total, so give it a
  // tax code at this invoice's rate and let it compute (any difference is
  // flagged after the write). If a code can't be resolved, add the tax as its
  // own untaxed line so the invoice total still matches Landscapt's.
  const taxCents: number = invoice.tax_cents ?? 0;
  let salesTaxCodeId: string | null = null;
  let manualTaxCents = taxCents;
  if (taxCents > 0 && (invoice.tax_rate_bps ?? 0) > 0 && (await usesAutomatedSalesTax(conn))) {
    salesTaxCodeId = await getOrCreateSalesTaxCodeId(conn, invoice.tax_rate_bps);
    manualTaxCents = 0;
    if (!salesTaxCodeId) {
      lines.push({
        description: `Sales tax (${(invoice.tax_rate_bps / 100).toString()}%)`,
        qty: 1,
        amountCents: taxCents,
        unitPrice: centsToDollars(taxCents),
        itemId: await resolveItemId(null),
        taxable: false,
      });
    }
  } else if (taxCents > 0) {
    manualTaxCents = taxCents;
  }

  return {
    customerId,
    invoiceDate: invoice.invoice_date,
    dueDate,
    termId,
    docNumber: invoice.invoice_number != null ? String(invoice.invoice_number) : null,
    lines,
    discountCents: (invoice.discount_cents ?? 0) + lineDiscountCents,
    taxCents: manualTaxCents,
    salesTaxCodeId,
    expectedTotalCents: invoice.total_cents ?? undefined,
  };
}

/**
 * Keeps an invoice in QuickBooks in step with Landscapt. A new invoice is
 * created; one that already has a qbo_invoice_id is updated in place with its
 * current lines/amounts/terms, or voided there when it is void here. Voiding a
 * paid invoice is blocked upstream (see assertVoidable), which is also what
 * QuickBooks requires. A QuickBooks invoice that was voided can never be
 * edited, so un-voiding in Landscapt surfaces an error instead. With
 * `onlyIfSynced`, an invoice that was never pushed is left alone — edit
 * triggers use this so saving a draft can't create it in QuickBooks early.
 * Never throws: callers (the automatic hooks and the manual retry route) must
 * not fail their own action because QuickBooks is down or unconfigured.
 */
/**
 * Forget every QuickBooks link for an org. QuickBooks ids are per company, so after a disconnect
 * (or a reconnect to a different company) the stored ids point at unrelated records there —
 * an invoice push would overwrite somebody else's invoice.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function clearQuickBooksLinks(db: any, orgId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  await db.from("clients").update({ qbo_customer_id: null }).eq("org_id", orgId).not("qbo_customer_id", "is", null);
  await db.from("crm_invoices").update({ qbo_invoice_id: null, qbo_sync_error: null, qbo_sync_attempted_at: null }).eq("org_id", orgId).not("qbo_invoice_id", "is", null);
  await db.from("crm_services").update({ qbo_item_id: null }).eq("org_id", orgId).not("qbo_item_id", "is", null);
  await db
    .from("crm_payment_allocations")
    .update({ qbo_payment_id: null, qbo_sync_error: null, qbo_sync_attempted_at: null })
    .eq("org_id", orgId)
    .not("qbo_payment_id", "is", null);
  await db.from("crm_qbo_pending_voids").update({ resolved_at: nowIso }).eq("org_id", orgId).is("resolved_at", null);
}

export async function pushInvoiceToQuickBooks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  invoiceId: string,
  opts: { onlyIfSynced?: boolean } = {}
): Promise<PushInvoiceResult> {
  const { data: invoice } = await db
    .from("crm_invoices")
    .select(`
      id, client_id, status, invoice_number, invoice_date, due_date, terms, description, qbo_invoice_id, discount_cents, tax_cents, tax_rate_bps, total_cents,
      clients (id, display_name, account_number, primary_email, primary_phone, billing_address, billing_city, billing_state, billing_zip, qbo_customer_id, default_terms),
      crm_invoice_line_items (name, description, qty, rate_cents, total_cents, discount_cents, is_taxable, sort_order)
    `)
    .eq("id", invoiceId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!invoice) return { status: "error", reason: "invoice_not_found" };
  if (!invoice.qbo_invoice_id && (opts.onlyIfSynced || invoice.status === "void")) {
    return { status: "skipped", reason: "not_synced" };
  }

  const conn = await getValidConnection(db, orgId);
  if (!conn) return { status: "skipped", reason: "not_connected" };

  const client = invoice.clients;
  if (!client) return { status: "error", reason: "client_not_found" };

  const attemptedAt = new Date().toISOString();

  try {
    /**
     * QuickBooks accepted the write, but if it computed a different total (tax
     * rounding, a rate it treats differently) the two books disagree — record
     * that as a sync error so it shows in the Sync Status panel instead of
     * drifting silently.
     */
    const driftMessage = (input: CreateInvoiceInput, written: QboWriteResult): string | null => {
      const expected = input.expectedTotalCents;
      if (expected == null || Math.abs(written.totalCents - expected) <= 1) return null;
      return `QuickBooks totals $${(written.totalCents / 100).toFixed(2)} but this invoice is $${(expected / 100).toFixed(2)} — usually sales tax calculated differently in QuickBooks. Check the tax setup there.`;
    };
    const markOk = async (drift: string | null = null) => {
      await db
        .from("crm_invoices")
        .update({ qbo_sync_error: drift, qbo_sync_attempted_at: attemptedAt })
        .eq("id", invoiceId);
      await recordSyncResult(db, orgId, drift ? "error" : "ok");
    };

    // ── already in QuickBooks: update or void it ──
    if (invoice.qbo_invoice_id) {
      const qboInvoiceId: string = invoice.qbo_invoice_id;
      const current = await getQboInvoice(conn, qboInvoiceId);
      const voidedInQbo = isQboInvoiceVoided(current);

      if (invoice.status === "void") {
        if (voidedInQbo) return { status: "already_synced", qboInvoiceId };
        await voidInvoice(conn, qboInvoiceId);
        await markOk();
        return { status: "voided", qboInvoiceId };
      }
      if (voidedInQbo) {
        // QuickBooks can't reopen a voided invoice, so the two have diverged for good.
        const message = "This invoice was voided in QuickBooks and can't be reopened there — create a new invoice to sync it again.";
        await recordSyncResult(db, orgId, "error");
        await db.from("crm_invoices").update({ qbo_sync_error: message, qbo_sync_attempted_at: attemptedAt }).eq("id", invoiceId);
        return { status: "error", reason: "voided_in_quickbooks", qboInvoiceId };
      }
      // Keep the customer QuickBooks already has on this invoice. After Merge
      // Clients the invoice belongs to the surviving client here, whose
      // QuickBooks customer can differ — and QuickBooks rejects changing the
      // customer of an invoice that has payments, so every later push failed.
      const currentCustomerId = String((current.CustomerRef as { value?: string } | undefined)?.value ?? "");
      let updateCustomerId = currentCustomerId;
      if (!updateCustomerId) {
        const resolvedForUpdate = await resolveCustomerId(db, conn, client, orgId);
        if ("ambiguous" in resolvedForUpdate) throw new Error("Client match is ambiguous — resolve it from the client's QuickBooks section.");
        updateCustomerId = resolvedForUpdate.customerId;
      }
      const updateInput = await buildInvoicePushInput(db, conn, orgId, invoice, updateCustomerId);
      // A lowered total moved payments off this invoice: shrink/void those in QuickBooks first.
      await reconcileInvoicePaymentLinks(db, orgId, invoiceId);
      const updated = await updateInvoice(conn, qboInvoiceId, updateInput);
      await markOk(driftMessage(updateInput, updated));
      return { status: "updated", qboInvoiceId };
    }

    // ── not yet in QuickBooks: find (or create) the client's customer first ──
    const resolved = await resolveCustomerId(db, conn, client, orgId);
    if ("ambiguous" in resolved) {
      await recordSyncResult(db, orgId, "error");
      await db
        .from("crm_invoices")
        .update({ qbo_sync_error: "Client match is ambiguous — resolve it from the client's QuickBooks section.", qbo_sync_attempted_at: attemptedAt })
        .eq("id", invoiceId);
      return { status: "error", reason: "ambiguous_client_match" };
    }

    // ── not yet linked: QuickBooks may already have it (sent before a disconnect/reconnect, or
    //    entered there by hand) — match by invoice number + customer before creating a copy ──
    if (invoice.invoice_number != null) {
      const docNumber = String(invoice.invoice_number);
      const existing = await findQboInvoiceByNumber(conn, docNumber, resolved.customerId);
      if (existing.status === "ambiguous") {
        const message = `QuickBooks has more than one open invoice #${docNumber} for this customer — void the extra one there, then Retry.`;
        await recordSyncResult(db, orgId, "error");
        await db.from("crm_invoices").update({ qbo_sync_error: message, qbo_sync_attempted_at: attemptedAt }).eq("id", invoiceId);
        return { status: "error", reason: "ambiguous_invoice_match" };
      }
      if (existing.status === "match") {
        const service = createServiceClient();
        const { data: taken } = await service
          .from("crm_invoices")
          .select("id")
          .eq("org_id", orgId)
          .eq("qbo_invoice_id", existing.id)
          .neq("id", invoiceId)
          .limit(1);
        if (!taken || taken.length === 0) {
          const { error: linkErr } = await service
            .from("crm_invoices")
            .update({ qbo_invoice_id: existing.id, qbo_sync_error: null, qbo_sync_attempted_at: attemptedAt })
            .eq("id", invoiceId)
            .eq("org_id", orgId);
          if (linkErr) throw new Error(`Matched QuickBooks invoice #${docNumber} but the link could not be saved: ${linkErr.message}`);
          const expected = invoice.total_cents as number | null;
          if (expected != null && Math.abs(existing.totalCents - expected) > 1) {
            // Landscapt is the source of truth (one-way sync): bring the matched invoice in line,
            // exactly as an edit here would.
            const matchInput = await buildInvoicePushInput(db, conn, orgId, invoice, resolved.customerId);
            const updated = await updateInvoice(conn, existing.id, matchInput);
            await markOk(driftMessage(matchInput, updated));
            return { status: "updated", qboInvoiceId: existing.id, reason: "matched_existing" };
          }
          await recordSyncResult(db, orgId, "ok");
          return { status: "pushed", qboInvoiceId: existing.id, reason: "matched_existing" };
        }
      }
    }

    // ── not in QuickBooks: create it ──
    const createInput = await buildInvoicePushInput(db, conn, orgId, invoice, resolved.customerId);
    const created = await createInvoice(conn, createInput, `inv-${invoiceId}`);
    const qboInvoiceId = created.id;
    const drift = driftMessage(createInput, created);
    // The link is written as the service role: a user session may only touch
    // qbo_sync_error / qbo_sync_attempted_at (DB guard), so no CRM seat can
    // repoint an invoice at another QuickBooks invoice and have the next sync
    // overwrite or void it there. The invoice was read above through `db`, so
    // the caller could see it.
    const { error: linkErr } = await createServiceClient()
      .from("crm_invoices")
      .update({ qbo_invoice_id: qboInvoiceId, qbo_sync_error: drift, qbo_sync_attempted_at: attemptedAt })
      .eq("id", invoiceId)
      .eq("org_id", orgId);
    if (linkErr) {
      // The invoice exists in QuickBooks but we failed to remember its id: record the attempt so
      // the cron doesn't create it again every run, and surface the error on the invoice.
      log.error("QuickBooks invoice created but the link could not be stored", { err: linkErr, invoiceId, orgId, qboInvoiceId });
      await db
        .from("crm_invoices")
        .update({ qbo_sync_error: `Created in QuickBooks as #${qboInvoiceId} but the link could not be saved: ${linkErr.message}`, qbo_sync_attempted_at: attemptedAt })
        .eq("id", invoiceId);
      await recordSyncResult(db, orgId, "error");
      return { status: "error", reason: linkErr.message };
    }
    await recordSyncResult(db, orgId, drift ? "error" : "ok");
    return { status: "pushed", qboInvoiceId };
  } catch (err) {
    log.error("QuickBooks invoice push failed", { err, invoiceId, orgId });
    await recordSyncResult(db, orgId, "error");
    await db
      .from("crm_invoices")
      .update({ qbo_sync_error: errorMessage(err), qbo_sync_attempted_at: attemptedAt })
      .eq("id", invoiceId);
    // The cron skips a duplicate-name failure until the invoice or its client is edited.
    return { status: "error", reason: err instanceof QboDuplicateNameError ? "duplicate_name" : "quickbooks_api_error" };
  }
}

export interface PushPaymentResult {
  status: "pushed" | "skipped" | "error";
  pushedAllocations?: number;
  skippedAllocations?: number;
  reason?: string;
}

/**
 * Pushes each of a payment's invoice allocations to QuickBooks as its own
 * Payment linked to that allocation's QBO invoice (decided with the user —
 * a split payment becomes multiple QBO Payments, one per invoice it's
 * applied to). An allocation whose invoice hasn't been pushed to
 * QuickBooks yet is skipped rather than force-pushing that invoice too —
 * Phase 4's reconciliation UI is where that gets surfaced and retried.
 * Idempotent per allocation. Prepayments/credits with no invoice
 * allocation are out of scope for this phase.
 */
export async function pushPaymentToQuickBooks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  paymentId: string
): Promise<PushPaymentResult> {
  const { data: payment } = await db
    .from("crm_payments")
    .select(`
      id, client_id, payment_date, reference, method, is_credit,
      clients (id, display_name, primary_email, primary_phone, billing_address, billing_city, billing_state, billing_zip, qbo_customer_id),
      crm_payment_allocations (id, amount_cents, qbo_payment_id, crm_invoices (id, qbo_invoice_id))
    `)
    .eq("id", paymentId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!payment) return { status: "error", reason: "payment_not_found" };

  const allocations = payment.crm_payment_allocations ?? [];
  if (allocations.length === 0) return { status: "skipped", reason: "no_allocations" };

  const conn = await getValidConnection(db, orgId);
  if (!conn) return { status: "skipped", reason: "not_connected" };

  const client = payment.clients;
  if (!client) return { status: "error", reason: "client_not_found" };

  const attemptedAt = new Date().toISOString();

  // A payment is applied to an invoice QuickBooks already has, so it goes to
  // THAT invoice's customer — not whatever the paying client resolves to now.
  // After Merge Clients the two can differ (the duplicate's invoices keep the
  // duplicate's QuickBooks customer), and QuickBooks rejects a payment whose
  // customer doesn't own the invoice it is applied to, forever.
  const invoiceCustomers = new Map<string, string>();
  const customerForInvoice = async (qboInvoiceId: string): Promise<string> => {
    const cached = invoiceCustomers.get(qboInvoiceId);
    if (cached) return cached;
    const qboInvoice = await getQboInvoice(conn, qboInvoiceId);
    const customerId = String((qboInvoice.CustomerRef as { value?: string } | undefined)?.value ?? "");
    if (!customerId) throw new Error(`QuickBooks invoice #${qboInvoiceId} has no customer`);
    invoiceCustomers.set(qboInvoiceId, customerId);
    return customerId;
  };

  // Neither an AR write-off nor a staff-issued account credit is money received: both go to
  // QuickBooks as a credit memo applied to the invoice, never as a cash Payment. (Applying an
  // existing prepayment doesn't create an is_credit row — it allocates the ORIGINAL payment,
  // which is pushed as a Payment like any other.) Credits used to be skipped entirely, so the
  // QuickBooks invoice stayed open while Landscapt showed it paid.
  const isWriteOff = payment.method === AR_WRITE_OFF_METHOD;
  const asCreditMemo = isWriteOff || payment.is_credit === true;

  let pushed = 0;
  let skipped = 0;
  let anyError = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const alloc of allocations as any[]) {
    if (alloc.qbo_payment_id) continue;
    const qboInvoiceId = alloc.crm_invoices?.qbo_invoice_id;
    if (!qboInvoiceId) {
      skipped++;
      await db
        .from("crm_payment_allocations")
        .update({ qbo_sync_error: "This payment's invoice hasn't been pushed to QuickBooks yet.", qbo_sync_attempted_at: attemptedAt })
        .eq("id", alloc.id);
      continue;
    }

    try {
      // Re-check right before writing: the Stripe-webhook path and a manual /
      // cron push can overlap, and the loop's snapshot may be stale.
      const { data: fresh } = await db.from("crm_payment_allocations").select("qbo_payment_id").eq("id", alloc.id).maybeSingle();
      if (fresh?.qbo_payment_id) continue;

      // The allocation id is the QuickBooks requestid, so two racing callers that
      // both reach this point still get ONE QBO transaction back. A credit memo's
      // id also carries the amount: when an applied credit's amount changes, the
      // old memo is voided and a new one created for the same allocation, and
      // reusing the old requestid would hand back the voided memo.
      const invoiceCustomerId = await customerForInvoice(qboInvoiceId);
      const qboPaymentId = asCreditMemo
        ? await createCreditMemoApplied(conn, {
            customerId: invoiceCustomerId,
            qboInvoiceId,
            amountCents: alloc.amount_cents,
            txnDate: payment.payment_date,
            note: isWriteOff ? "AR write-off" : "Account credit",
            requestId: `${String(alloc.id).replace(/-/g, "")}-${alloc.amount_cents}`,
          })
        : await createPayment(conn, {
            customerId: invoiceCustomerId,
            qboInvoiceId,
            amountCents: alloc.amount_cents,
            paymentDate: payment.payment_date,
            referenceNumber: payment.reference,
            requestId: alloc.id,
          });
      // Only the first writer's id lands; a concurrent writer gets the same QBO id back via requestid.
      // The link is written as the service role: a user session may only record the sync outcome
      // (qbo_sync_error / qbo_sync_attempted_at — DB guard 20261224000310).
      const { error: linkErr } = await createServiceClient()
        .from("crm_payment_allocations")
        .update({ qbo_payment_id: qboPaymentId, qbo_sync_error: null, qbo_sync_attempted_at: attemptedAt })
        .eq("id", alloc.id)
        .eq("org_id", orgId)
        .is("qbo_payment_id", null);
      if (linkErr) {
        // It exists in QuickBooks but we failed to remember its id. Say so on the allocation
        // (the requestid makes the next attempt return the same QuickBooks payment, not a new one).
        log.error("QuickBooks payment created but the link could not be stored", { err: linkErr, paymentId, allocationId: alloc.id, orgId, qboPaymentId });
        anyError = true;
        await db
          .from("crm_payment_allocations")
          .update({ qbo_sync_error: `Created in QuickBooks as #${qboPaymentId} but the link could not be saved: ${linkErr.message}`, qbo_sync_attempted_at: attemptedAt })
          .eq("id", alloc.id);
        continue;
      }
      pushed++;
    } catch (err) {
      log.error("QuickBooks payment push failed", { err, paymentId, allocationId: alloc.id, orgId });
      anyError = true;
      await db
        .from("crm_payment_allocations")
        .update({ qbo_sync_error: errorMessage(err), qbo_sync_attempted_at: attemptedAt })
        .eq("id", alloc.id);
    }
  }

  await recordSyncResult(db, orgId, anyError ? "error" : "ok");
  return {
    status: anyError ? "error" : pushed > 0 ? "pushed" : "skipped",
    pushedAllocations: pushed,
    skippedAllocations: skipped,
  };
}

/**
 * Server-side entry point for payments that don't go through a browser —
 * Stripe webhooks, autopay, the public pay link. Pushes any of the payment's
 * invoices that aren't in QuickBooks yet first (an auto-generated invoice may
 * never have been "sent" from the UI), since a payment can't be linked to an
 * invoice QuickBooks doesn't have, then the payment itself. Safe to fire after
 * the money is already recorded: it never throws, and QuickBooks being down or
 * unconfigured leaves the usual error row for the Sync Status panel to retry.
 */
export async function syncStripePaymentToQuickBooks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  paymentId: string
): Promise<void> {
  try {
    const { data: allocations } = await db
      .from("crm_payment_allocations")
      .select("invoice_id, crm_invoices (id, status, qbo_invoice_id)")
      .eq("payment_id", paymentId);
    for (const alloc of (allocations ?? []) as { crm_invoices: { id: string; status: string; qbo_invoice_id: string | null } | null }[]) {
      const inv = alloc.crm_invoices;
      if (inv && !inv.qbo_invoice_id && inv.status !== "draft" && inv.status !== "void") {
        await pushInvoiceToQuickBooks(db, orgId, inv.id);
      }
    }
    await pushPaymentToQuickBooks(db, orgId, paymentId);
  } catch (err) {
    log.error("QuickBooks sync after Stripe payment failed", { err, paymentId, orgId });
  }
}

// ── payment reversals (refunds, chargebacks) ────────────────────────────────

export interface QuickBooksPaymentLink {
  allocationId: string;
  qboPaymentId: string;
}

/**
 * Captures which allocations of a payment are already in QuickBooks BEFORE a
 * reversal runs: refund_payment() deletes an allocation row that is refunded in
 * full, and that row is the only place its qbo_payment_id lives.
 */
export async function snapshotQuickBooksPaymentLinks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  paymentId: string
): Promise<QuickBooksPaymentLink[]> {
  try {
    const { data } = await db
      .from("crm_payment_allocations")
      .select("id, qbo_payment_id")
      .eq("payment_id", paymentId)
      .not("qbo_payment_id", "is", null);
    return ((data ?? []) as { id: string; qbo_payment_id: string }[]).map((a) => ({ allocationId: a.id, qboPaymentId: a.qbo_payment_id }));
  } catch {
    return [];
  }
}

async function qboPaymentRequest(
  conn: QuickBooksConnection,
  body: Record<string, unknown>,
  operation?: "void"
): Promise<Record<string, unknown>> {
  const res = await fetch(`${conn.baseUrl}/v3/company/${conn.realmId}/payment${operation ? `?operation=${operation}` : ""}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QuickBooks payment ${operation ?? "update"} failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.Payment as Record<string, unknown>;
}

async function getQboPayment(conn: QuickBooksConnection, qboPaymentId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${conn.baseUrl}/v3/company/${conn.realmId}/payment/${encodeURIComponent(qboPaymentId)}`, {
    headers: { Authorization: `Bearer ${conn.accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QuickBooks payment lookup failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.Payment as Record<string, unknown>;
}

/** Unlinks (voids the applying Payment) then voids the credit memo. */
async function voidCreditMemoLink(conn: QuickBooksConnection, link: string): Promise<void> {
  const { creditMemoId, applyPaymentId } = parseCreditMemoLink(link);
  if (applyPaymentId) {
    await withFreshSyncToken(
      () => getQboPayment(conn, applyPaymentId),
      (cur) => qboPaymentRequest(conn, { Id: applyPaymentId, SyncToken: cur.SyncToken }, "void")
    );
  }
  const res = await fetch(`${conn.baseUrl}/v3/company/${conn.realmId}/creditmemo/${encodeURIComponent(creditMemoId)}`, {
    headers: { Authorization: `Bearer ${conn.accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`QuickBooks credit memo lookup failed (${res.status})`);
  const cur = (await res.json()).CreditMemo as Record<string, unknown>;
  await qboPost(conn, "creditmemo", { Id: creditMemoId, SyncToken: cur.SyncToken }, { operation: "void" });
}

/** What a credit-memo link's memo totals in QuickBooks, in cents. */
async function getQboCreditMemoCents(conn: QuickBooksConnection, link: string): Promise<number> {
  const { creditMemoId } = parseCreditMemoLink(link);
  const res = await fetch(`${conn.baseUrl}/v3/company/${conn.realmId}/creditmemo/${encodeURIComponent(creditMemoId)}`, {
    headers: { Authorization: `Bearer ${conn.accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`QuickBooks credit memo lookup failed (${res.status})`);
  const memo = (await res.json()).CreditMemo as Record<string, unknown>;
  return Math.round(Number(memo.TotalAmt ?? 0) * 100);
}

/** Voids the QuickBooks side of an allocation that no longer exists (a credit memo or a cash Payment). */
async function voidRemovedQboPayment(conn: QuickBooksConnection, qboPaymentId: string): Promise<void> {
  if (isCreditMemoLink(qboPaymentId)) {
    await voidCreditMemoLink(conn, qboPaymentId);
    return;
  }
  const current = await getQboPayment(conn, qboPaymentId);
  if (Math.round(Number(current.TotalAmt ?? 0) * 100) <= 0) return; // already voided
  await withFreshSyncToken(
    () => getQboPayment(conn, qboPaymentId),
    (cur) => qboPaymentRequest(conn, { Id: qboPaymentId, SyncToken: cur.SyncToken }, "void")
  );
}

/**
 * Voids QuickBooks payments whose allocation no longer exists (see crm_qbo_pending_voids): a
 * refund in full whose void failed, a payment edit that removed an invoice from the split, or a
 * lowered invoice total that moved the payment off it. Pass `paymentId` to do just one payment's.
 * The queue is service-role only, so this always reads and writes it as the service role.
 * Never throws.
 */
export async function retryPendingQuickBooksVoids(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _db: any,
  orgId: string,
  limit = 10,
  paymentId?: string
): Promise<{ ok: number; failed: number }> {
  const outcome = { ok: 0, failed: 0 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;
  try {
    let query = db
      .from("crm_qbo_pending_voids")
      .select("id, qbo_payment_id")
      .eq("org_id", orgId)
      .is("resolved_at", null);
    if (paymentId) query = query.eq("payment_id", paymentId);
    const { data: pending } = await query.order("created_at", { ascending: true }).limit(limit);
    const rows = (pending ?? []) as { id: string; qbo_payment_id: string }[];
    if (rows.length === 0) return outcome;
    const conn = await getValidConnection(db, orgId);
    if (!conn) return outcome;
    for (const row of rows) {
      const attemptedAt = new Date().toISOString();
      try {
        await voidRemovedQboPayment(conn, row.qbo_payment_id);
        await db.from("crm_qbo_pending_voids").update({ resolved_at: attemptedAt, attempted_at: attemptedAt, last_error: null, updated_at: attemptedAt }).eq("id", row.id);
        outcome.ok++;
      } catch (err) {
        outcome.failed++;
        log.error("QuickBooks pending void retry failed", { err, orgId, qboPaymentId: row.qbo_payment_id });
        await db.from("crm_qbo_pending_voids").update({ last_error: errorMessage(err), attempted_at: attemptedAt, updated_at: attemptedAt }).eq("id", row.id);
      }
    }
  } catch (err) {
    log.error("QuickBooks pending void sweep failed", { err, orgId });
  }
  return outcome;
}

/**
 * Brings the QuickBooks Payments behind a payment in line with its allocations
 * after a refund or chargeback has been applied: an allocation that was
 * refunded in full is gone, so its QuickBooks Payment is voided (reopening the
 * invoice there, as it reopened here); one that shrank has its amount reduced.
 * Pass the snapshot taken before the reversal ran. Never throws.
 */
export async function mirrorPaymentReversalToQuickBooks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  paymentId: string,
  links: QuickBooksPaymentLink[]
): Promise<{ ok: number; failed: number }> {
  const outcome = { ok: 0, failed: 0 };
  if (links.length === 0) return outcome;
  try {
    const conn = await getValidConnection(db, orgId);
    if (!conn) return outcome;
    const { data: remaining } = await db
      .from("crm_payment_allocations")
      .select("id, amount_cents, crm_invoices (qbo_invoice_id)")
      .eq("payment_id", paymentId);
    const byId = new Map<string, { amount_cents: number; crm_invoices: { qbo_invoice_id: string | null } | null }>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((remaining ?? []) as any[]).map((r) => [r.id, r])
    );
    // Date and reference too, so an edited payment matches in QuickBooks.
    const { data: header } = await db
      .from("crm_payments")
      .select("payment_date, reference")
      .eq("id", paymentId)
      .maybeSingle();
    const paymentDate: string | null = header?.payment_date ?? null;
    const refNum: string | null = header?.reference?.trim() ? String(header.reference).trim().slice(0, 21) : null;
    // Pending-void rows and links are service-role-only (RLS / DB guard).
    const service = createServiceClient();
    const resolvePendingVoid = async (qboPaymentId: string) => {
      await service
        .from("crm_qbo_pending_voids")
        .update({ resolved_at: new Date().toISOString() })
        .eq("org_id", orgId)
        .eq("qbo_payment_id", qboPaymentId)
        .is("resolved_at", null);
    };

    for (const link of links) {
      try {
        if (isCreditMemoLink(link.qboPaymentId)) {
          // A credit memo is not cash: a refund/chargeback shouldn't touch it. If the
          // allocation is gone (reversed in full), unwind the credit.
          const row = byId.get(link.allocationId);
          if (!row) {
            await voidRemovedQboPayment(conn, link.qboPaymentId);
            await resolvePendingVoid(link.qboPaymentId);
          } else if (row.amount_cents !== (await getQboCreditMemoCents(conn, link.qboPaymentId))) {
            // The applied credit's amount was edited (or the invoice total lowered): a credit
            // memo can't simply be resized while applied, so unwind it and forget the link —
            // the payment push that follows creates one for the new amount.
            await voidCreditMemoLink(conn, link.qboPaymentId);
            await service
              .from("crm_payment_allocations")
              .update({ qbo_payment_id: null, qbo_sync_error: null, qbo_sync_attempted_at: new Date().toISOString() })
              .eq("id", link.allocationId)
              .eq("qbo_payment_id", link.qboPaymentId);
            outcome.ok++;
            continue;
          }
          await db
            .from("crm_payment_allocations")
            .update({ qbo_sync_error: null, qbo_sync_attempted_at: new Date().toISOString() })
            .eq("id", link.allocationId)
            .not("qbo_sync_error", "is", null);
          outcome.ok++;
          continue;
        }
        const row = byId.get(link.allocationId);
        if (!row) {
          await voidRemovedQboPayment(conn, link.qboPaymentId);
          await resolvePendingVoid(link.qboPaymentId);
          outcome.ok++;
          continue;
        }
        const current = await getQboPayment(conn, link.qboPaymentId);
        const qboCents = Math.round(Number(current.TotalAmt ?? 0) * 100);
        const invoiceId = row.crm_invoices?.qbo_invoice_id;
        const dateChanged = !!paymentDate && String(current.TxnDate ?? "") !== paymentDate;
        const refChanged = (current.PaymentRefNum ? String(current.PaymentRefNum) : null) !== refNum;
        if ((row.amount_cents !== qboCents || dateChanged || refChanged) && invoiceId) {
          const amount = centsToDollars(row.amount_cents);
          await withFreshSyncToken(
            () => getQboPayment(conn, link.qboPaymentId),
            (cur) =>
              qboPaymentRequest(conn, {
                Id: link.qboPaymentId,
                SyncToken: cur.SyncToken,
                sparse: true,
                // QuickBooks rejects a payment update without the customer, even a sparse one.
                CustomerRef: cur.CustomerRef,
                TotalAmt: amount,
                ...(paymentDate ? { TxnDate: paymentDate } : {}),
                ...(refNum != null || current.PaymentRefNum ? { PaymentRefNum: refNum ?? "" } : {}),
                Line: [{ Amount: amount, LinkedTxn: [{ TxnId: invoiceId, TxnType: "Invoice" }] }],
              })
          );
        }
        // Reconciled (or already matching): drop an error left by an earlier failed attempt.
        await db
          .from("crm_payment_allocations")
          .update({ qbo_sync_error: null, qbo_sync_attempted_at: new Date().toISOString() })
          .eq("id", link.allocationId)
          .not("qbo_sync_error", "is", null);
        outcome.ok++;
      } catch (err) {
        outcome.failed++;
        log.error("QuickBooks payment reversal failed", { err, paymentId, qboPaymentId: link.qboPaymentId, orgId });
        const attemptedAt = new Date().toISOString();
        await db
          .from("crm_payment_allocations")
          .update({ qbo_sync_error: errorMessage(err), qbo_sync_attempted_at: attemptedAt })
          .eq("id", link.allocationId);
        // An allocation refunded in full is gone, so the row above matched nothing: keep the
        // QuickBooks id where the cron can retry the void.
        if (!byId.has(link.allocationId)) {
          await service
            .from("crm_qbo_pending_voids")
            .upsert(
              { org_id: orgId, payment_id: paymentId, qbo_payment_id: link.qboPaymentId, last_error: errorMessage(err), attempted_at: attemptedAt, resolved_at: null },
              // QuickBooks ids repeat across companies; the unique key is per org.
              { onConflict: "org_id,qbo_payment_id" }
            );
        }
        await recordSyncResult(db, orgId, "error");
      }
    }
  } catch (err) {
    log.error("QuickBooks payment reversal mirror failed", { err, paymentId, orgId });
  }
  return outcome;
}

/**
 * Brings everything QuickBooks holds for one payment in line with Landscapt, in the order
 * QuickBooks needs: (1) payments already linked are updated to their current amount, date and
 * reference (an edit, a lowered invoice total, a refund) — or voided when their allocation is
 * gone; (2) links queued for voiding when an edit removed an invoice from the split are voided;
 * (3) allocations not in QuickBooks yet are pushed. Used by the payment sync route (after a
 * payment is recorded, edited or has credit applied) and by the cron. Never throws.
 */
export async function syncPaymentToQuickBooks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  paymentId: string
): Promise<PushPaymentResult> {
  let reconciled = { ok: 0, failed: 0 };
  try {
    const links = await snapshotQuickBooksPaymentLinks(db, paymentId);
    if (links.length > 0) reconciled = await mirrorPaymentReversalToQuickBooks(db, orgId, paymentId, links);
    const voided = await retryPendingQuickBooksVoids(db, orgId, 25, paymentId);
    reconciled = { ok: reconciled.ok + voided.ok, failed: reconciled.failed + voided.failed };
  } catch (err) {
    log.error("QuickBooks payment reconcile failed", { err, paymentId, orgId });
  }
  const result = await pushPaymentToQuickBooks(db, orgId, paymentId);
  if (reconciled.failed > 0) return { ...result, status: "error" };
  if (result.status === "skipped" && reconciled.ok > 0) return { ...result, status: "pushed", pushedAllocations: reconciled.ok };
  return result;
}

/**
 * Before a QuickBooks invoice is updated: payments that Landscapt moved off it (a lowered total
 * shrinks or removes their allocations — crm_reconcile_invoice_payments flags or queues them)
 * must shrink or be voided in QuickBooks first, or QuickBooks keeps more applied than the
 * invoice now totals. Best-effort; never throws.
 */
async function reconcileInvoicePaymentLinks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  invoiceId: string
): Promise<void> {
  try {
    await retryPendingQuickBooksVoids(db, orgId, 25);
    const { data: flagged } = await db
      .from("crm_payment_allocations")
      .select("payment_id")
      .eq("invoice_id", invoiceId)
      .not("qbo_payment_id", "is", null)
      .not("qbo_sync_error", "is", null);
    const paymentIds = [...new Set(((flagged ?? []) as { payment_id: string }[]).map((r) => r.payment_id))];
    for (const pid of paymentIds) {
      const links = await snapshotQuickBooksPaymentLinks(db, pid);
      await mirrorPaymentReversalToQuickBooks(db, orgId, pid, links);
    }
  } catch (err) {
    log.error("QuickBooks invoice payment reconcile failed", { err, invoiceId, orgId });
  }
}
