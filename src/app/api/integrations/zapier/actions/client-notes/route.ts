import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient, authenticateZapierRequest, blankToUndefined, checkZapierRateLimit } from "@/lib/integrations/zapier";
import { firstIssueMessage } from "@/lib/utils/zod-message";
import { withIdempotency } from "@/lib/api/idempotency";
import { clientNotFoundResponse, jsonServerError } from "@/lib/api/route-helpers";

const createNoteSchema = z.object({
  clientId: z.string().uuid(),
  body: z.string().min(1),
  subject: blankToUndefined(z.string()),
});

/**
 * POST /api/integrations/zapier/actions/client-notes — Zapier action ("Add
 * Note to Client"). Logs an entry on the client's unified activity timeline
 * (client_activity, activity_type = 'note') — the common shape for "log this
 * external interaction (call, form, other tool) onto the CRM record" Zaps.
 */
export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateZapierRequest(request, db);
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }
  if (!(await checkZapierRateLimit(db, auth.integrationId))) {
    return NextResponse.json({ error: "Rate limit exceeded — slow down" }, { status: 429 });
  }
  // Idempotency-Key: a retried create returns the first result instead of a duplicate.
  return withIdempotency(db, auth.orgId, request, async () => {
    const parsed = createNoteSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: firstIssueMessage(parsed.error, "Invalid input") }, { status: 400 });
    }
    const body = parsed.data;

    const { data: client } = await db
      .from("clients")
      .select("org_id")
      .eq("id", body.clientId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!client || client.org_id !== auth.orgId) {
      return clientNotFoundResponse(db, auth.orgId, body.clientId);
    }

    const { data, error } = await db
      .from("client_activity")
      .insert({
        org_id: auth.orgId,
        client_id: body.clientId,
        activity_type: "note",
        subject: body.subject ?? "Note from Zapier",
        body: body.body,
      })
      .select("id, occurred_at")
      .single();

    if (error || !data) {
      // Don't hand raw database errors (constraint/column names) to the caller.
      return jsonServerError("zapier client-notes: create failed", error);
    }

    return NextResponse.json({ id: data.id, occurredAt: data.occurred_at });
  });
}
