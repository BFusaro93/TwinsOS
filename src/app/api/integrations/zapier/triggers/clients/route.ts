import { NextResponse } from "next/server";
import { adminClient, authenticateZapierRequest } from "@/lib/integrations/zapier";

/**
 * GET /api/integrations/zapier/triggers/clients — Zapier polling trigger
 * ("New Client"). Returns the most recently created clients, newest first,
 * which is the shape Zapier's polling contract expects.
 */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateZapierRequest(request, db);
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }

  const { data, error } = await db
    .from("clients")
    .select(
      "id, display_name, first_name, last_name, primary_email, primary_phone, status, account_type, source, client_since, created_at"
    )
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const clients = (data ?? []).map((c) => ({
    id: c.id,
    displayName: c.display_name,
    firstName: c.first_name,
    lastName: c.last_name,
    email: c.primary_email,
    phone: c.primary_phone,
    status: c.status,
    accountType: c.account_type,
    source: c.source,
    clientSince: c.client_since,
    createdAt: c.created_at,
  }));

  return NextResponse.json(clients);
}
