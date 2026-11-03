import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient, authenticateZapierRequest, checkZapierRateLimit } from "@/lib/integrations/zapier";
import { logger } from "@/lib/logger";

const log = logger.child("zapier-hooks");

/**
 * DELETE /api/integrations/zapier/hooks/[id] — Zapier's REST Hook
 * "unsubscribe" call, fired automatically when a user turns off a Zap.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateZapierRequest(request, db);
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }
  if (!(await checkZapierRateLimit(db, auth.integrationId))) {
    return NextResponse.json({ error: "Rate limit exceeded — slow down" }, { status: 429 });
  }

  // A non-uuid id reached Postgres and came back as its raw cast error.
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  const { error } = await db
    .from("zapier_webhook_subscriptions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", auth.orgId);

  if (error) {
    log.error("unsubscribe failed", { error: error.message });
    return NextResponse.json({ error: "unsubscribe failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
