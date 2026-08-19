import { NextResponse } from "next/server";
import { adminClient, authenticateZapierRequest, isZapierTriggerType } from "@/lib/integrations/zapier";
import { POLLING_TRIGGERS } from "@/lib/integrations/zapier-triggers";

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
    .limit(config.postFilter ? 200 : 25);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = config.postFilter ? (data ?? []).filter(config.postFilter).slice(0, 25) : (data ?? []);
  return NextResponse.json(rows.map(config.map));
}
