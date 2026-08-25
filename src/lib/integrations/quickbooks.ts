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
    await db
      .from("integrations")
      .update({ config: nextConfig, last_sync_at: new Date().toISOString(), last_sync_status: "ok" })
      .eq("id", row.id);
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
