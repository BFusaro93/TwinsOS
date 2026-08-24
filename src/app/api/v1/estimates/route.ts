import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, parsePagination } from "@/lib/api/route-helpers";
import { ESTIMATE_SELECT, shapeEstimate } from "./shape";

/**
 * GET /api/v1/estimates — list the org's estimates. Requires scope
 * "estimates:read". Read-only: an estimate's totals come from the
 * Aspire-style budget engine (production rates, labor burden, overhead
 * markup, margin sliders) run client-side — a direct-create endpoint here
 * would let a caller write inconsistent subtotal/total figures that bypass
 * that calculation entirely.
 */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "estimates:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { limit, offset } = parsePagination(request.url);
  const { data, error } = await db
    .from("estimates")
    .select(ESTIMATE_SELECT)
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ data: (data ?? []).map(shapeEstimate), limit, offset });
}
