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

/**
 * Authenticates a public API request against api_keys.key_hash, checks the
 * required scope, and enforces the key's per-minute rate limit via the
 * increment_api_key_rate_limit RPC (one row per key per calendar minute —
 * see migration 20260903000000_api_keys.sql). A scope of "*" grants access
 * to every resource/tier, for admin-issued internal keys.
 */
export async function authenticateApiRequest(
  request: Request,
  requiredScope: string,
  db: AdminClient = adminClient()
): Promise<ApiAuthResult> {
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

  const scopes = (keyRow.scopes as string[]) ?? [];
  if (!scopes.includes("*") && !scopes.includes(requiredScope)) {
    return { ok: false, status: 403, error: `Missing required scope: ${requiredScope}` };
  }

  const windowStart = new Date();
  windowStart.setSeconds(0, 0);
  const { data: requestCount, error: rateLimitError } = await db.rpc("increment_api_key_rate_limit", {
    p_api_key_id: keyRow.id,
    p_window_start: windowStart.toISOString(),
  });

  if (rateLimitError) {
    log.error("rate limit check failed", { err: rateLimitError, keyId: keyRow.id });
  } else if (typeof requestCount === "number" && requestCount > (keyRow.rate_limit_per_min as number)) {
    return { ok: false, status: 429, error: "Rate limit exceeded" };
  }

  await db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id as string);

  return { ok: true, orgId: keyRow.org_id as string, keyId: keyRow.id as string, scopes };
}
