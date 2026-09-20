import { coerceTimeZone, DEFAULT_TIME_ZONE } from "@/lib/time/zone";

// A process-local cache. Org timezone changes roughly never, and the
// alternative is an extra round trip on every date derivation in a request
// that already knows its org. The TTL exists so a tenant that does change it
// doesn't have to wait for a cold lambda.
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { tz: string; at: number }>();

/**
 * The operating timezone for `orgId`.
 *
 * Falls back to DEFAULT_TIME_ZONE when the org can't be read rather than
 * throwing: a transient lookup failure must not be able to stop an invoice
 * from being written, and landing on the historical default is the safe
 * failure. Mirrors org_timezone() in SQL, which coalesces the same way.
 */
export async function getOrgTimeZone(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string | null | undefined
): Promise<string> {
  if (!orgId) return DEFAULT_TIME_ZONE;

  const hit = cache.get(orgId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.tz;

  try {
    const { data } = await db
      .from("organizations")
      .select("timezone")
      .eq("id", orgId)
      .single();
    const tz = coerceTimeZone(data?.timezone as string | null | undefined);
    cache.set(orgId, { tz, at: Date.now() });
    return tz;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** Drops a cached entry — call after an org updates its timezone. */
export function forgetOrgTimeZone(orgId: string): void {
  cache.delete(orgId);
}

/**
 * The operating timezone of the CALLER's org, resolved server-side from the
 * session rather than from a passed-in id.
 *
 * Uses the my_timezone() RPC, which derives the org from my_org_id() — the
 * same function RLS uses — so this cannot be pointed at another tenant's org
 * by a caller, and it honours staff impersonation the way every other
 * my_org_id()-based check does. Falls back to the platform default rather
 * than throwing, for the same reason getOrgTimeZone does.
 */
export async function getMyTimeZone(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<string> {
  try {
    const { data, error } = await supabase.rpc("my_timezone");
    if (error) return DEFAULT_TIME_ZONE;
    return coerceTimeZone(data as string | null);
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}
