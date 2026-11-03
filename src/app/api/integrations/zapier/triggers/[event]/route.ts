import { NextResponse } from "next/server";
import { adminClient, authenticateZapierRequest, checkZapierRateLimit, isZapierTriggerType } from "@/lib/integrations/zapier";
import { POLLING_TRIGGERS } from "@/lib/integrations/zapier-triggers";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { logger } from "@/lib/logger";

const log = logger.child("zapier-trigger");

// Zapier dedupes on `id`, so a page only has to cover what changed since the
// last poll — 25 dropped events whenever a bulk change (an import) outran it.
const PAGE_SIZE = 100;

/**
 * GET /api/integrations/zapier/triggers/[event] — the polling-trigger
 * fallback every Zapier trigger needs (used by Zapier's "Test" step, and by
 * orgs that can't expose a public hook URL for REST Hooks). One route per
 * ZapierTriggerType, driven by the table/filter/mapping declared in
 * zapier-triggers.ts rather than a bespoke handler per event.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ event: string }> }
) {
  const { event } = await params;
  if (!isZapierTriggerType(event)) {
    return NextResponse.json({ error: "unsupported trigger event" }, { status: 404 });
  }

  const db = adminClient();
  const auth = await authenticateZapierRequest(request, db);
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }
  if (!(await checkZapierRateLimit(db, auth.integrationId))) {
    return NextResponse.json({ error: "Rate limit exceeded — slow down" }, { status: 429 });
  }

  const config = POLLING_TRIGGERS[event];
  let query = db.from(config.table).select(config.columns).eq("org_id", auth.orgId);

  if (config.hasSoftDelete) query = query.is("deleted_at", null);
  for (const [column, value] of Object.entries(config.filters ?? {})) {
    query = query.eq(column, value);
  }
  for (const column of config.requireNotNull ?? []) {
    query = query.not(column, "is", null);
  }

  const { data, error } = await query
    .order(config.orderBy, { ascending: false })
    .limit(config.postFilter ? 500 : PAGE_SIZE);

  if (error) {
    // Don't hand raw database errors (column/constraint names) to the caller.
    log.error("poll failed", { event, error: error.message });
    return NextResponse.json({ error: "poll failed" }, { status: 500 });
  }

  const searchParams = new URL(request.url).searchParams;
  const ctx = { orgToday: todayInZone(await getOrgTimeZone(db, auth.orgId)) };
  const rows = config.postFilter
    ? (data ?? []).filter((row) => config.postFilter!(row, searchParams, ctx)).slice(0, PAGE_SIZE)
    : (data ?? []);
  return NextResponse.json(rows.map(config.map));
}
