import { createHash, randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = ReturnType<typeof createClient<any>>;

const log = logger.child("public-api-auth");

export const API_KEY_PREFIX = "tos_";

export function adminClient(): AdminClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Generates a new plaintext API key plus the prefix/hash to persist. The plaintext is only ever returned once, at creation time. */
export function generateApiKey(): { key: string; keyPrefix: string; keyHash: string } {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString("hex")}`;
  return { key, keyPrefix: key.slice(0, API_KEY_PREFIX.length + 8), keyHash: hashApiKey(key) };
}

export type ApiAuthResult =
  | { ok: true; orgId: string; keyId: string; scopes: string[] }
  | { ok: false; status: 401 | 403 | 429; error: string };

type ApiKeyRow = {
  id: string;
  org_id: string;
  scopes: string[] | null;
  rate_limit_per_min: number;
  revoked_at: string | null;
  /** Which table this row came from -- api_keys (long-lived, admin-issued)
   * or oauth_tokens (short-lived, issued via the OAuth 2.1 + PKCE flow in
   * src/app/api/mcp/oauth/*). resolveApiKey() below uses this to decide how
   * to charge the rate limit and record last_used_at, since the two tables
   * don't share a schema -- everything past lookupApiKey() otherwise treats
   * both the same. */
  source: "api_key" | "oauth_token";
};

/** Default per-minute rate limit for an OAuth-issued access token, since
 * oauth_tokens has no rate_limit_per_min column of its own (unlike
 * api_keys, an org can't configure this per OAuth connection today). */
const OAUTH_TOKEN_RATE_LIMIT_PER_MIN = 60;

/** Parses the bearer token and looks up its api_keys row, falling back to
 * oauth_tokens (access tokens only) if it's not a known API key. No side
 * effects (no rate-limit increment, no last_used_at update) — shared by
 * resolveApiKey and peekApiKeyScopes below. */
async function lookupApiKey(
  request: Request,
  db: AdminClient
): Promise<{ ok: true; keyRow: ApiKeyRow } | { ok: false; status: 401; error: string }> {
  const authHeader = request.headers.get("Authorization") ?? "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    return { ok: false, status: 401, error: "Missing or malformed Authorization header" };
  }
  const key = match[1].trim();
  if (!key) {
    return { ok: false, status: 401, error: "Missing API key" };
  }
  const keyHash = hashApiKey(key);

  const { data: keyRow } = await db
    .from("api_keys")
    .select("id, org_id, scopes, rate_limit_per_min, revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (keyRow) {
    if (keyRow.revoked_at) {
      return { ok: false, status: 401, error: "Invalid or revoked API key" };
    }
    return { ok: true, keyRow: { ...(keyRow as Omit<ApiKeyRow, "source">), source: "api_key" } };
  }

  // hashApiKey is a plain sha256, same as oauth.ts's hashToken -- the same
  // hash works to look up either table, so no need to re-hash.
  const { data: tokenRow } = await db
    .from("oauth_tokens")
    .select("id, org_id, scopes, revoked_at, expires_at, token_type")
    .eq("token_hash", keyHash)
    .eq("token_type", "access")
    .maybeSingle();

  if (!tokenRow || tokenRow.revoked_at || new Date(tokenRow.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 401, error: "Invalid or revoked API key" };
  }

  return {
    ok: true,
    keyRow: {
      id: tokenRow.id,
      org_id: tokenRow.org_id,
      scopes: tokenRow.scopes,
      rate_limit_per_min: OAUTH_TOKEN_RATE_LIMIT_PER_MIN,
      revoked_at: tokenRow.revoked_at,
      source: "oauth_token",
    },
  };
}

/**
 * Resolves the bearer token on a request to its api_keys row and enforces
 * the key's per-minute rate limit via the increment_api_key_rate_limit RPC
 * (one row per key per calendar minute — see migration
 * 20260903000000_api_keys.sql), without checking any particular scope.
 * authenticateApiRequest() below is the REST-route wrapper that also checks
 * a required scope. This is also what a reused REST handler ends up calling
 * when invoked from an MCP tool (see src/app/api/mcp/tools.ts) — the actual
 * rate-limit charge for an MCP tool call happens here, exactly once.
 */
export async function resolveApiKey(request: Request, db: AdminClient = adminClient()): Promise<ApiAuthResult> {
  const looked = await lookupApiKey(request, db);
  if (!looked.ok) return looked;
  const { keyRow } = looked;

  const scopes = keyRow.scopes ?? [];

  // api_key_rate_limits.api_key_id is a FK into api_keys(id), so the
  // increment_api_key_rate_limit RPC only applies to that source -- an
  // OAuth-issued access token's id lives in oauth_tokens instead. OAuth
  // tokens are short-lived (1 hour, see src/lib/api/oauth.ts) by design,
  // which bounds the blast radius of not rate-limiting them yet; a
  // dedicated oauth_token_rate_limits table is the natural follow-up if
  // that turns out not to be enough.
  if (keyRow.source === "api_key") {
    const windowStart = new Date();
    windowStart.setSeconds(0, 0);
    const { data: requestCount, error: rateLimitError } = await db.rpc("increment_api_key_rate_limit", {
      p_api_key_id: keyRow.id,
      p_window_start: windowStart.toISOString(),
    });

    if (rateLimitError) {
      log.error("rate limit check failed", { err: rateLimitError, keyId: keyRow.id });
    } else if (typeof requestCount === "number" && requestCount > keyRow.rate_limit_per_min) {
      return { ok: false, status: 429, error: "Rate limit exceeded" };
    }

    await db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
  } else {
    await db.from("oauth_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
  }

  return { ok: true, orgId: keyRow.org_id, keyId: keyRow.id, scopes };
}

/**
 * Checks a bearer token's validity and scopes with no side effects — no
 * rate-limit increment, no last_used_at update. Used by the MCP server to
 * gate a connection and decide which tools to expose from the key's scopes.
 * The actual REST handler an MCP tool call delegates to (see
 * src/app/api/mcp/tools.ts) still runs the real authenticateApiRequest()
 * itself, so every MCP tool call is charged against the rate limit exactly
 * once — the same as a direct REST call — rather than twice (once here,
 * once in the handler) or not at all.
 */
export async function peekApiKeyScopes(request: Request, db: AdminClient = adminClient()): Promise<ApiAuthResult> {
  const looked = await lookupApiKey(request, db);
  if (!looked.ok) return looked;
  return { ok: true, orgId: looked.keyRow.org_id, keyId: looked.keyRow.id, scopes: looked.keyRow.scopes ?? [] };
}

/**
 * Authenticates a public API request against api_keys.key_hash and checks
 * the required scope. A scope of "*" grants access to every resource/tier,
 * for admin-issued internal keys.
 */
export async function authenticateApiRequest(
  request: Request,
  requiredScope: string,
  db: AdminClient = adminClient()
): Promise<ApiAuthResult> {
  const result = await resolveApiKey(request, db);
  if (!result.ok) return result;

  if (!result.scopes.includes("*") && !result.scopes.includes(requiredScope)) {
    return { ok: false, status: 403, error: `Missing required scope: ${requiredScope}` };
  }

  return result;
}
