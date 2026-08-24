import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, parsePagination } from "@/lib/api/route-helpers";
import { CONTRACT_SELECT, shapeContract } from "./shape";

/**
 * GET /api/v1/contracts — list the org's contracts. Requires scope
 * "contracts:read". Read-only: a contract is a signed agreement
 * (signed_at/signed_by), created through the app's own e-signature flow —
 * not something a direct-create endpoint should be able to fabricate.
 */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "contracts:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { limit, offset } = parsePagination(request.url);
  const { data, error } = await db
    .from("crm_contracts")
    .select(CONTRACT_SELECT)
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ data: (data ?? []).map(shapeContract), limit, offset });
}
