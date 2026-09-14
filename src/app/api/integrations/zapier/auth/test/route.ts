import { NextResponse } from "next/server";
import { adminClient, authenticateZapierRequest, checkZapierRateLimit } from "@/lib/integrations/zapier";

/**
 * GET /api/integrations/zapier/auth/test — the "Test" step every Zapier app
 * calls right after the user pastes in their API key, to confirm it's valid
 * and to show which account is connected.
 */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateZapierRequest(request, db);
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }
  if (!(await checkZapierRateLimit(db, auth.integrationId))) {
    return NextResponse.json({ error: "Rate limit exceeded — slow down" }, { status: 429 });
  }

  const { data: org } = await db
    .from("organizations")
    .select("id, name")
    .eq("id", auth.orgId)
    .single();

  return NextResponse.json({
    connected: true,
    orgId: auth.orgId,
    orgName: (org?.name as string | undefined) ?? null,
  });
}
