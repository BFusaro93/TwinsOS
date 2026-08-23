import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, parsePagination } from "@/lib/api/route-helpers";
import { PURCHASE_ORDER_SELECT, shapePurchaseOrder } from "./shape";

/**
 * GET /api/v1/purchase-orders — list the org's purchase orders. Requires
 * scope "purchase_orders:read". Read-only: POs are created by approving a
 * requisition through the app's approval flow, not via this API.
 */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "purchase_orders:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { limit, offset } = parsePagination(request.url);
  const { data, error } = await db
    .from("purchase_orders")
    .select(PURCHASE_ORDER_SELECT)
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ data: (data ?? []).map(shapePurchaseOrder), limit, offset });
}
