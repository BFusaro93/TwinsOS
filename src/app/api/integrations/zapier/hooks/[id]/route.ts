import { NextResponse } from "next/server";
import { adminClient, authenticateZapierRequest, checkZapierRateLimit } from "@/lib/integrations/zapier";

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

  const { error } = await db
    .from("zapier_webhook_subscriptions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", auth.orgId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
