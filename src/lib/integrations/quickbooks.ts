import { randomBytes } from "crypto";
import { logger } from "@/lib/logger";

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

export function isQuickBooksConfigured(): boolean {
  return Boolean(process.env.QUICKBOOKS_CLIENT_ID && process.env.QUICKBOOKS_CLIENT_SECRET);
}

function apiBaseUrl(): string {
  return process.env.QUICKBOOKS_ENVIRONMENT === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

/** CSRF token for the OAuth redirect round trip — set in a cookie at /connect, verified at /callback. */
export function generateState(): string {
  return randomBytes(24).toString("hex");
}

export function getAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.QUICKBOOKS_CLIENT_ID!,
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

function basicAuthHeader(): string {
  const raw = `${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

async function requestTokens(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
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

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<TokenResponse> {
  return requestTokens(
    new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri })
  );
}

export async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  return requestTokens(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }));
}

/** Best-effort — a failed revoke just leaves a dead token that expires on its own; never block disconnect on it. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(),
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
}

/**
 * Loads the org's stored connection, refreshing the access token first if
 * it's within 5 minutes of expiring. Returns null if the org has never
 * connected QuickBooks or the integration was disabled. Accepts any
 * Supabase client (session-scoped or service-role) — RLS on `integrations`
 * already scopes session clients to their own org.
 */
export async function getValidConnection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string
): Promise<QuickBooksConnection | null> {
  const { data: row } = await db
    .from("integrations")
    .select("id, config, enabled")
    .eq("org_id", orgId)
    .eq("provider", "quickbooks")
    .maybeSingle();
  if (!row || !row.enabled) return null;

  const config = row.config as QuickBooksIntegrationConfig;

  if (new Date(config.expires_at).getTime() - Date.now() < 5 * 60 * 1000) {
    const tokens = await refreshTokens(config.refresh_token);
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
      return { accessToken: freshConfig.access_token, realmId: freshConfig.realm_id, baseUrl: apiBaseUrl() };
    }
    return { accessToken: tokens.access_token, realmId: config.realm_id, baseUrl: apiBaseUrl() };
  }

  return { accessToken: config.access_token, realmId: config.realm_id, baseUrl: apiBaseUrl() };
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
function escapeQboString(value: string): string {
  return value.replace(/'/g, "''");
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
export async function findOrCreateCustomer(
  conn: QuickBooksConnection,
  input: CreateCustomerInput
): Promise<FindOrCreateResult> {
  const escaped = escapeQboString(input.displayName);

  const exact = await qboQuery(conn, `SELECT Id, DisplayName FROM Customer WHERE DisplayName = '${escaped}'`, "Customer");
  if (exact.length === 1) {
    return { status: "matched", customerId: exact[0].Id };
  }

  const fuzzy = await qboQuery(conn, `SELECT Id, DisplayName FROM Customer WHERE DisplayName LIKE '%${escaped}%'`, "Customer");
  if (fuzzy.length === 0) {
    const customerId = await createCustomer(conn, input);
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

export interface QboInvoiceLineInput {
  description: string;
  qty: number;
  amountCents: number;
  itemId: string;
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
}

export async function createInvoice(conn: QuickBooksConnection, input: CreateInvoiceInput): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines: Record<string, unknown>[] = input.lines.map((l) => ({
    DetailType: "SalesItemLineDetail",
    Amount: centsToDollars(l.amountCents),
    Description: l.description,
    SalesItemLineDetail: { ItemRef: { value: l.itemId }, Qty: l.qty },
  }));
  if (input.discountCents && input.discountCents > 0) {
    lines.push({
      DetailType: "DiscountLineDetail",
      Amount: centsToDollars(input.discountCents),
      DiscountLineDetail: { PercentBased: false },
    });
  }

  const body: Record<string, unknown> = {
    CustomerRef: { value: input.customerId },
    TxnDate: input.invoiceDate,
    Line: lines,
  };
  if (input.dueDate) body.DueDate = input.dueDate;
  if (input.docNumber) body.DocNumber = input.docNumber;
  if (input.taxCents && input.taxCents > 0) {
    body.TxnTaxDetail = { TotalTax: centsToDollars(input.taxCents) };
  }

  const res = await fetch(`${conn.baseUrl}/v3/company/${conn.realmId}/invoice`, {
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
    throw new Error(`QuickBooks invoice creation failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.Invoice.Id as string;
}

export interface CreatePaymentInput {
  customerId: string;
  qboInvoiceId: string;
  amountCents: number;
  paymentDate: string;
}

export async function createPayment(conn: QuickBooksConnection, input: CreatePaymentInput): Promise<string> {
  const amount = centsToDollars(input.amountCents);
  const body = {
    CustomerRef: { value: input.customerId },
    TotalAmt: amount,
    TxnDate: input.paymentDate,
    Line: [{ Amount: amount, LinkedTxn: [{ TxnId: input.qboInvoiceId, TxnType: "Invoice" }] }],
  };
  const res = await fetch(`${conn.baseUrl}/v3/company/${conn.realmId}/payment`, {
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
    throw new Error(`QuickBooks payment creation failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.Payment.Id as string;
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
  client: any
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
  });
  if (match.status === "ambiguous") return { ambiguous: true };

  const customerId = match.customerId!;
  await db.from("clients").update({ qbo_customer_id: customerId }).eq("id", client.id);
  return { customerId };
}

export interface PushInvoiceResult {
  status: "pushed" | "already_synced" | "skipped" | "error";
  qboInvoiceId?: string;
  reason?: string;
}

/**
 * Pushes an invoice to QuickBooks as a new Invoice, resolving the client's
 * QBO customer lazily (same policy as Phase 2) if it isn't linked yet.
 * Idempotent — a no-op if this invoice already has a qbo_invoice_id. Never
 * throws: callers (the automatic "invoice sent" hook and a manual retry
 * route) must not fail their own action because QuickBooks is down or
 * unconfigured.
 */
export async function pushInvoiceToQuickBooks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  invoiceId: string
): Promise<PushInvoiceResult> {
  const { data: invoice } = await db
    .from("crm_invoices")
    .select(`
      id, client_id, invoice_number, invoice_date, due_date, description, qbo_invoice_id, discount_cents, tax_cents,
      clients (id, display_name, primary_email, primary_phone, billing_address, billing_city, billing_state, billing_zip, qbo_customer_id),
      crm_invoice_line_items (name, description, qty, total_cents, sort_order)
    `)
    .eq("id", invoiceId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!invoice) return { status: "error", reason: "invoice_not_found" };
  if (invoice.qbo_invoice_id) return { status: "already_synced", qboInvoiceId: invoice.qbo_invoice_id };

  const conn = await getValidConnection(db, orgId);
  if (!conn) return { status: "skipped", reason: "not_connected" };

  const client = invoice.clients;
  if (!client) return { status: "error", reason: "client_not_found" };

  const attemptedAt = new Date().toISOString();

  try {
    const resolved = await resolveCustomerId(db, conn, client);
    if ("ambiguous" in resolved) {
      await recordSyncResult(db, orgId, "error");
      await db
        .from("crm_invoices")
        .update({ qbo_sync_error: "Client match is ambiguous — resolve it from the client's QuickBooks section.", qbo_sync_attempted_at: attemptedAt })
        .eq("id", invoiceId);
      return { status: "error", reason: "ambiguous_client_match" };
    }

    const resolveItemId = await buildServiceItemResolver(db, conn, orgId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lineItems = (invoice.crm_invoice_line_items ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order);
    const lines: QboInvoiceLineInput[] = lineItems.length > 0
      ? await Promise.all(
          lineItems.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async (li: any) => ({
              description: li.name ? `${li.name}${li.description ? ` — ${li.description}` : ""}` : (li.description ?? "Service"),
              qty: Number(li.qty) || 1,
              amountCents: li.total_cents ?? 0,
              itemId: await resolveItemId(li.name),
            })
          )
        )
      : [{ description: invoice.description || "Service", qty: 1, amountCents: 0, itemId: await resolveItemId(null) }];

    const qboInvoiceId = await createInvoice(conn, {
      customerId: resolved.customerId,
      invoiceDate: invoice.invoice_date,
      dueDate: invoice.due_date,
      docNumber: invoice.invoice_number != null ? String(invoice.invoice_number) : null,
      lines,
      discountCents: invoice.discount_cents ?? 0,
      taxCents: invoice.tax_cents ?? 0,
    });

    await db
      .from("crm_invoices")
      .update({ qbo_invoice_id: qboInvoiceId, qbo_sync_error: null, qbo_sync_attempted_at: attemptedAt })
      .eq("id", invoiceId);
    await recordSyncResult(db, orgId, "ok");
    return { status: "pushed", qboInvoiceId };
  } catch (err) {
    log.error("QuickBooks invoice push failed", { err, invoiceId, orgId });
    await recordSyncResult(db, orgId, "error");
    await db
      .from("crm_invoices")
      .update({ qbo_sync_error: errorMessage(err), qbo_sync_attempted_at: attemptedAt })
      .eq("id", invoiceId);
    return { status: "error", reason: "quickbooks_api_error" };
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
      id, client_id, payment_date,
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
  let resolved: Awaited<ReturnType<typeof resolveCustomerId>>;
  try {
    resolved = await resolveCustomerId(db, conn, client);
  } catch (err) {
    log.error("QuickBooks payment push failed resolving customer", { err, paymentId, orgId });
    await recordSyncResult(db, orgId, "error");
    return { status: "error", reason: "quickbooks_api_error" };
  }
  if ("ambiguous" in resolved) {
    await recordSyncResult(db, orgId, "error");
    return { status: "error", reason: "ambiguous_client_match" };
  }

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
      const qboPaymentId = await createPayment(conn, {
        customerId: resolved.customerId,
        qboInvoiceId,
        amountCents: alloc.amount_cents,
        paymentDate: payment.payment_date,
      });
      await db
        .from("crm_payment_allocations")
        .update({ qbo_payment_id: qboPaymentId, qbo_sync_error: null, qbo_sync_attempted_at: attemptedAt })
        .eq("id", alloc.id);
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
