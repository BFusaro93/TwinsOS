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
};

/** Parses the bearer token and looks up its api_keys row. No side effects (no rate-limit increment, no last_used_at update) — shared by resolveApiKey and peekApiKeyScopes below. */
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

  const { data: keyRow } = await db
    .from("api_keys")
    .select("id, org_id, scopes, rate_limit_per_min, revoked_at")
    .eq("key_hash", hashApiKey(key))
    .maybeSingle();

  if (!keyRow || keyRow.revoked_at) {
    return { ok: false, status: 401, error: "Invalid or revoked API key" };
  }

  return { ok: true, keyRow: keyRow as ApiKeyRow };
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
