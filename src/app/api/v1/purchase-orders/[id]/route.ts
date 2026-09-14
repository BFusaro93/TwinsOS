import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, jsonServerError } from "@/lib/api/route-helpers";
import { PURCHASE_ORDER_SELECT, PO_LINE_ITEM_SELECT, shapePurchaseOrder, shapePoLineItem } from "../shape";

/** GET /api/v1/purchase-orders/[id] — fetch one PO with its line items. Requires scope "purchase_orders:read". */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "purchase_orders:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { data, error } = await db
    .from("purchase_orders")
    .select(PURCHASE_ORDER_SELECT)
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return jsonServerError("GET /api/v1/purchase-orders/[id]", error);
  if (!data) return jsonError("Purchase order not found", 404);

  const { data: lineItems, error: lineItemsError } = await db
    .from("po_line_items")
    .select(PO_LINE_ITEM_SELECT)
    .eq("org_id", auth.orgId)
    .eq("po_id", id);

  if (lineItemsError) return jsonServerError("GET /api/v1/purchase-orders/[id]", lineItemsError);

  return NextResponse.json({
    ...shapePurchaseOrder(data),
    lineItems: (lineItems ?? []).map(shapePoLineItem),
  });
}
