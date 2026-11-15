import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import {
  fetchUptimeMonitors,
  runHealthChecks,
  type HealthCheckResult,
  type UptimeMonitor,
} from "@/lib/health/checks";

const log = logger.child("internal health");

// Several checks hit paid/rate-limited vendor APIs (Maps geocoding, Stripe,
// Twilio), so results are cached per server instance. `?refresh=1` bypasses
// the cache but no more than once every MIN_REFRESH_MS.
const CACHE_TTL_MS = 60_000;
const MIN_REFRESH_MS = 10_000;

interface Snapshot {
  checkedAt: string;
  checks: HealthCheckResult[];
  uptime: UptimeMonitor[] | null;
}

let cache: { at: number; snapshot: Snapshot } | null = null;

export const dynamic = "force-dynamic";

/** Staff-only. The public /api/health stays a minimal DB ping for uptime monitors. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: isStaff } = await supabase.rpc("is_staff", { uid: user.id });
  if (!isStaff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  const age = cache ? Date.now() - cache.at : Infinity;
  if (cache && age < (refresh ? MIN_REFRESH_MS : CACHE_TTL_MS)) {
    return NextResponse.json(cache.snapshot);
  }

  const [checks, uptime] = await Promise.all([
    runHealthChecks(),
    fetchUptimeMonitors().catch((err) => {
      log.warn("uptime robot feed unavailable", { error: err instanceof Error ? err.message : String(err) });
      return null;
    }),
  ]);

  const snapshot: Snapshot = { checkedAt: new Date().toISOString(), checks, uptime };
  cache = { at: Date.now(), snapshot };
  return NextResponse.json(snapshot);
}
