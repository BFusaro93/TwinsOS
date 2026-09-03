import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

const log = logger.child("auth-rate-limit");

/**
 * Fixed-window rate limiter backed by `auth_rate_limit_counters` (see
 * migration 20260902150000_auth_rate_limit.sql). `key` should already
 * identify the bucket being limited, e.g. "login:ip:1.2.3.4" or
 * "reset:email:foo@bar.com" — the same key/window pair is atomically
 * incremented via UPSERT so concurrent requests can't race past the limit.
 *
 * Fails open (returns true) if the check itself errors, so a DB hiccup
 * degrades to "no rate limiting" rather than locking everyone out.
 */
export async function checkAuthRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString();

  const db = createServiceClient();
  const { data, error } = await db.rpc("auth_rate_limit_hit", {
    p_key: key,
    p_window_start: windowStart,
    p_limit: limit,
  });

  if (error) {
    log.error("rate limit check failed — failing open", { error, key });
    return true;
  }

  return data === true;
}

/** Best-effort client IP from standard proxy headers (Vercel sets x-forwarded-for). */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
