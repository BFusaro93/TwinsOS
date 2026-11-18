import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { syncSubscriberClient } from "@/lib/staff/subscriber-clients";
import { logger } from "@/lib/logger";

const log = logger.child("sync-subscriber-clients cron");

export const maxDuration = 300;

/**
 * GET /api/cron/sync-subscriber-clients — called daily by Vercel Cron.
 *
 * Safety net AND backfill for the staff org's mirror of subscriber orgs (clients in the staff org,
 * linked by organizations.staff_client_id). The signup route and billing webhook keep it current in
 * real time; this catches anything they missed. Idempotent — a re-run changes nothing and adds no
 * duplicate timeline rows. Backfill existing orgs with ?org=<uuid>&org=<uuid>.
 *
 * Security: Vercel passes Authorization: Bearer {CRON_SECRET}.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // ?org=<uuid> (repeatable) force-syncs exactly those orgs — the explicit backfill path, so old
  // abandoned signups are only tracked when someone chooses to.
  const forced = new URL(request.url).searchParams.getAll("org").filter((v) => UUID.test(v));

  let query = db
    .from("organizations")
    .select("id")
    .not("is_demo", "is", true)
    .not("is_platform_staff_org", "is", true)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (forced.length) {
    query = query.in("id", forced);
  } else {
    // Routine run: refresh orgs already tracked, plus anything created recently (a missed signup
    // sync) or paying. Old, never-linked trials stay out unless forced above.
    const recent = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    query = query.or(`staff_client_id.not.is.null,created_at.gte.${recent},stripe_subscription_id.not.is.null`);
  }
  const { data: orgs, error } = await query;
  if (error) {
    log.error("could not load orgs", { error: error.message });
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }

  let synced = 0;
  let skipped = 0;
  for (const org of (orgs ?? []) as { id: string }[]) {
    const clientId = await syncSubscriberClient(db, org.id, { reason: "Synced from the subscriber record." });
    if (clientId) synced++;
    else skipped++;
  }
  return NextResponse.json({ synced, skipped });
}
