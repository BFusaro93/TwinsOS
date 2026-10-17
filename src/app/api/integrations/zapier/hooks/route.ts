import { NextResponse } from "next/server";
import {
  adminClient,
  authenticateZapierRequest,
  checkZapierRateLimit,
  isZapierTriggerType,
} from "@/lib/integrations/zapier";
import { assertPublicHttpsUrl } from "@/lib/net/ssrf-guard";

/**
 * POST /api/integrations/zapier/hooks — Zapier's REST Hook "subscribe" call,
 * fired automatically when a user turns on a Zap using one of our triggers.
 * Body: { event: ZapierTriggerType, targetUrl: string }
 */
const MAX_ACTIVE_SUBSCRIPTIONS = 100;

export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateZapierRequest(request, db);
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }
  if (!(await checkZapierRateLimit(db, auth.integrationId))) {
    return NextResponse.json({ error: "Rate limit exceeded — slow down" }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    event?: string;
    targetUrl?: string;
  };

  if (!body.event || !isZapierTriggerType(body.event)) {
    return NextResponse.json({ error: "unsupported event" }, { status: 400 });
  }
  if (!body.targetUrl || typeof body.targetUrl !== "string") {
    return NextResponse.json({ error: "targetUrl is required" }, { status: 400 });
  }
  const urlSafety = await assertPublicHttpsUrl(body.targetUrl);
  if (!urlSafety.ok) {
    return NextResponse.json({ error: urlSafety.error }, { status: 400 });
  }

  // Every active subscription fans out an outbound request on each matching
  // event, so an uncapped key could register unlimited targets.
  const { count: activeCount } = await db
    .from("zapier_webhook_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("org_id", auth.orgId)
    .is("deleted_at", null);
  if ((activeCount ?? 0) >= MAX_ACTIVE_SUBSCRIPTIONS) {
    return NextResponse.json({ error: "Too many active webhook subscriptions — remove unused Zaps first" }, { status: 429 });
  }

  const { data, error } = await db
    .from("zapier_webhook_subscriptions")
    .insert({ org_id: auth.orgId, trigger_type: body.event, target_url: body.targetUrl })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[zapier hooks] subscribe failed:", error?.message);
    return NextResponse.json({ error: "subscribe failed" }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}

/** GET /api/integrations/zapier/hooks — lists this org's active subscriptions. */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateZapierRequest(request, db);
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }
  if (!(await checkZapierRateLimit(db, auth.integrationId))) {
    return NextResponse.json({ error: "Rate limit exceeded — slow down" }, { status: 429 });
  }

  const { data, error } = await db
    .from("zapier_webhook_subscriptions")
    .select("id, trigger_type, target_url, created_at")
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[zapier hooks] list failed:", error.message);
    return NextResponse.json({ error: "list failed" }, { status: 500 });
  }

  return NextResponse.json({ subscriptions: data ?? [] });
}
