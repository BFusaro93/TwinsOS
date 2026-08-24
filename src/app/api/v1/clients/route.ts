import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, parsePagination } from "@/lib/api/route-helpers";
import { CLIENT_SELECT, shapeClient } from "./shape";
import { createClientSchema } from "./validation";

/** GET /api/v1/clients — list the org's clients. Requires scope "clients:read". */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "clients:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { limit, offset } = parsePagination(request.url);
  const { data, error } = await db
    .from("clients")
    .select(CLIENT_SELECT)
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ data: (data ?? []).map(shapeClient), limit, offset });
}

/** POST /api/v1/clients — creates a client. Requires scope "clients:write:safe". */
export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "clients:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = createClientSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  const { data, error } = await db
    .from("clients")
    .insert({
      org_id: auth.orgId,
      display_name: body.displayName,
      account_type: body.accountType ?? "residential",
      status: body.status ?? "lead",
      primary_phone: body.primaryPhone ?? null,
      primary_email: body.primaryEmail ?? null,
      billing_address: body.billingAddress ?? null,
      billing_city: body.billingCity ?? null,
      billing_state: body.billingState ?? null,
      billing_zip: body.billingZip ?? null,
      source: body.source ?? null,
      parent_client_id: body.parentClientId ?? null,
    })
    .select(CLIENT_SELECT)
    .single();

  if (error || !data) return jsonError(error?.message ?? "create failed", 500);
  return NextResponse.json(shapeClient(data), { status: 201 });
}
