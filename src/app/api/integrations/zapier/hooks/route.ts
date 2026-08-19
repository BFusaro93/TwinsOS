import { NextResponse } from "next/server";
import {
  adminClient,
  authenticateZapierRequest,
  isZapierTriggerType,
} from "@/lib/integrations/zapier";

/**
 * POST /api/integrations/zapier/hooks — Zapier's REST Hook "subscribe" call,
 * fired automatically when a user turns on a Zap using one of our triggers.
 * Body: { event: ZapierTriggerType, targetUrl: string }
 */
export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateZapierRequest(request, db);
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
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

  const { data, error } = await db
    .from("zapier_webhook_subscriptions")
    .insert({ org_id: auth.orgId, trigger_type: body.event, target_url: body.targetUrl })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "subscribe failed" }, { status: 500 });
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

  const { data, error } = await db
    .from("zapier_webhook_subscriptions")
    .select("id, trigger_type, target_url, created_at")
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ subscriptions: data ?? [] });
}
