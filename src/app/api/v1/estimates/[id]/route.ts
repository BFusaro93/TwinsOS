import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/route-helpers";
import { ESTIMATE_SELECT, ESTIMATE_LINE_ITEM_SELECT, shapeEstimate, shapeEstimateLineItem } from "../shape";

/** GET /api/v1/estimates/[id] — fetch one estimate with its line items. Requires scope "estimates:read". */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "estimates:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { data, error } = await db
    .from("estimates")
    .select(ESTIMATE_SELECT)
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Estimate not found", 404);

  const { data: lineItems, error: lineItemsError } = await db
    .from("estimate_line_items")
    .select(ESTIMATE_LINE_ITEM_SELECT)
    .eq("org_id", auth.orgId)
    .eq("estimate_id", id)
    .is("deleted_at", null);

  if (lineItemsError) return jsonError(lineItemsError.message, 500);

  return NextResponse.json({
    ...shapeEstimate(data),
    lineItems: (lineItems ?? []).map(shapeEstimateLineItem),
  });
}
