import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/route-helpers";
import { REQUISITION_SELECT, REQ_LINE_ITEM_SELECT, shapeRequisition, shapeRequisitionLineItem } from "../shape";

/** GET /api/v1/requisitions/[id] — fetch one requisition with its line items. Requires scope "requisitions:read". */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "requisitions:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { data, error } = await db
    .from("requisitions")
    .select(REQUISITION_SELECT)
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Requisition not found", 404);

  const { data: lineItems, error: lineItemsError } = await db
    .from("requisition_line_items")
    .select(REQ_LINE_ITEM_SELECT)
    .eq("org_id", auth.orgId)
    .eq("requisition_id", id);

  if (lineItemsError) return jsonError(lineItemsError.message, 500);

  return NextResponse.json({
    ...shapeRequisition(data),
    lineItems: (lineItems ?? []).map(shapeRequisitionLineItem),
  });
}
