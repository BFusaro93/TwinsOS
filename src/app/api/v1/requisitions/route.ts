import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, parsePagination } from "@/lib/api/route-helpers";
import { REQUISITION_SELECT, shapeRequisition } from "./shape";
import { createRequisitionSchema } from "./validation";

/** GET /api/v1/requisitions — list the org's requisitions. Requires scope "requisitions:read". */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "requisitions:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { limit, offset } = parsePagination(request.url);
  const { data, error } = await db
    .from("requisitions")
    .select(REQUISITION_SELECT)
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ data: (data ?? []).map(shapeRequisition), limit, offset });
}

/**
 * POST /api/v1/requisitions — creates a draft requisition with its line items.
 * Requires scope "requisitions:write:safe". Always created in "draft" status —
 * moving it to pending_approval and beyond goes through the app's approval
 * flow, not this API, so there's no PATCH endpoint for requisitions.
 */
export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "requisitions:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = createRequisitionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  let vendorName: string | null = null;
  if (body.vendorId) {
    const { data: vendor } = await db.from("vendors").select("org_id, name").eq("id", body.vendorId).maybeSingle();
    if (!vendor || vendor.org_id !== auth.orgId) return jsonError("Vendor not found", 404);
    vendorName = vendor.name as string;
  }
  if (body.workOrderId) {
    const { data: wo } = await db.from("work_orders").select("org_id").eq("id", body.workOrderId).maybeSingle();
    if (!wo || wo.org_id !== auth.orgId) return jsonError("Work order not found", 404);
  }

  const productIds = [...new Set(body.lineItems.map((li) => li.productItemId))];
  const { data: products } = await db
    .from("product_items")
    .select("id, org_id, name, part_number, unit_cost")
    .in("id", productIds);
  const productMap = new Map((products ?? []).map((p) => [p.id as string, p]));
  for (const id of productIds) {
    const product = productMap.get(id);
    if (!product || product.org_id !== auth.orgId) return jsonError(`Product item ${id} not found`, 404);
  }

  const lineItemRows = body.lineItems.map((li) => {
    const product = productMap.get(li.productItemId)!;
    const unitCost = li.unitCostCents ?? (product.unit_cost as number);
    return {
      org_id: auth.orgId,
      product_item_id: li.productItemId,
      product_item_name: product.name as string,
      part_number: (product.part_number as string) ?? "",
      quantity: li.quantity,
      unit_cost: unitCost,
      total_cost: unitCost * li.quantity,
      project_id: li.projectId ?? null,
      notes: li.notes ?? null,
    };
  });
  const subtotal = lineItemRows.reduce((sum, li) => sum + li.total_cost, 0);
  const taxRatePercent = body.taxRatePercent ?? 0;
  const salesTax = Math.round(subtotal * (taxRatePercent / 100));
  const shippingCost = body.shippingCostCents ?? 0;
  const grandTotal = subtotal + salesTax + shippingCost;

  const requisitionNumber = `REQ-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

  const { data: requisition, error } = await db
    .from("requisitions")
    .insert({
      org_id: auth.orgId,
      title: body.title,
      requisition_number: requisitionNumber,
      vendor_id: body.vendorId ?? null,
      vendor_name: vendorName,
      work_order_id: body.workOrderId ?? null,
      notes: body.notes ?? null,
      requested_by_name: "Public API",
      status: "draft",
      subtotal,
      tax_rate_percent: taxRatePercent,
      sales_tax: salesTax,
      shipping_cost: shippingCost,
      grand_total: grandTotal,
    })
    .select(REQUISITION_SELECT)
    .single();

  if (error || !requisition) return jsonError(error?.message ?? "create failed", 500);

  const { error: lineItemsError } = await db
    .from("requisition_line_items")
    .insert(lineItemRows.map((li) => ({ ...li, requisition_id: requisition.id })));

  if (lineItemsError) return jsonError(lineItemsError.message, 500);

  return NextResponse.json(shapeRequisition(requisition), { status: 201 });
}
