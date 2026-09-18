import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, jsonServerError, parsePagination } from "@/lib/api/route-helpers";
import { PURCHASE_ORDER_SELECT, PO_LINE_ITEM_SELECT, shapePurchaseOrder, shapePoLineItem } from "./shape";
import { createPurchaseOrderSchema } from "./validation";

/** GET /api/v1/purchase-orders — list the org's purchase orders. Requires scope "purchase_orders:read". */
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

  if (error) return jsonServerError("GET /api/v1/purchase-orders", error);
  return NextResponse.json({ data: (data ?? []).map(shapePurchaseOrder), limit, offset });
}

/**
 * POST /api/v1/purchase-orders — creates a PO with its line items. Requires
 * scope "purchase_orders:write:safe". Always lands at status "requested" —
 * the same starting point as the app's own "New PO" dialog. Nothing about
 * this endpoint (or any other) can move it to "approved"/"ordered" — that
 * requires submitting it into the org's approval_flows chain from the app,
 * which guard_procurement_approval_status() enforces at the DB level.
 */
export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "purchase_orders:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = createPurchaseOrderSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  const { data: vendor } = await db.from("vendors").select("org_id, name").eq("id", body.vendorId).maybeSingle();
  if (!vendor || vendor.org_id !== auth.orgId) return jsonError("Vendor not found", 404);

  if (body.requisitionId) {
    const { data: req } = await db.from("requisitions").select("org_id").eq("id", body.requisitionId).maybeSingle();
    if (!req || req.org_id !== auth.orgId) return jsonError("Requisition not found", 404);
  }

  const productIds = [...new Set(body.lineItems.map((li) => li.productItemId))];
  const { data: products } = await db
    .from("product_items")
    .select("id, org_id, name, part_number, unit_cost, category")
    .in("id", productIds);
  const productMap = new Map((products ?? []).map((p) => [p.id as string, p]));
  for (const id of productIds) {
    const product = productMap.get(id);
    if (!product || product.org_id !== auth.orgId) return jsonError(`Product item ${id} not found`, 404);
  }

  // Same rule as requisitions (see CLAUDE.md "Project cost tracking"): only
  // project_material/stocked_material may carry a project_id.
  const projectIds = [...new Set(body.lineItems.map((li) => li.projectId).filter((id): id is string => !!id))];
  const projectMap = new Map<string, { org_id: string }>();
  if (projectIds.length > 0) {
    const { data: projects } = await db.from("projects").select("id, org_id").in("id", projectIds);
    for (const p of projects ?? []) projectMap.set(p.id as string, p as { org_id: string });
  }
  for (const li of body.lineItems) {
    if (!li.projectId) continue;
    const product = productMap.get(li.productItemId)!;
    if (product.category === "maintenance_part") {
      return jsonError(`Product item ${li.productItemId} is a maintenance_part and cannot carry a projectId`, 400);
    }
    const project = projectMap.get(li.projectId);
    if (!project || project.org_id !== auth.orgId) return jsonError(`Project ${li.projectId} not found`, 404);
  }

  const lineItemRows = body.lineItems.map((li) => {
    const product = productMap.get(li.productItemId)!;
    const unitCost = li.unitCostCents ?? (product.unit_cost as number);
    return {
      product_item_id: li.productItemId,
      product_item_name: product.name as string,
      part_number: (product.part_number as string | null) ?? "",
      quantity: li.quantity,
      unit_cost: unitCost,
      total_cost: Math.round(unitCost * li.quantity),
      project_id: li.projectId ?? null,
      notes: li.notes ?? null,
      taxable: li.taxable ?? true,
    };
  });

  const subtotal = lineItemRows.reduce((sum, li) => sum + li.total_cost, 0);
  // Only taxable line items form the tax base — NewPODialog.tsx does the
  // same taxableSubtotalDollars filter. The `taxable` field was already
  // accepted per line item but never actually affected the tax calculation.
  const taxableSubtotal = lineItemRows.filter((li) => li.taxable).reduce((sum, li) => sum + li.total_cost, 0);
  const taxRatePercent = body.taxRatePercent ?? 0;
  const discountCost = body.discountCostCents ?? 0;
  const discountReducesTax = body.discountReducesTax ?? false;
  const taxableBase = discountReducesTax ? Math.max(0, taxableSubtotal - discountCost) : taxableSubtotal;
  const salesTax = Math.round(taxableBase * (taxRatePercent / 100));
  const shippingCost = body.shippingCostCents ?? 0;
  const grandTotal = subtotal - discountCost + salesTax + shippingCost;

  // Atomic per-org/year counter, not Date.now() — same as work orders/requisitions.
  const { data: poNumber, error: numErr } = await db.rpc("next_po_number", { p_org_id_override: auth.orgId });
  if (numErr || !poNumber) return jsonServerError("POST /api/v1/purchase-orders (next_po_number)", numErr);

  const { data: po, error: poErr } = await db
    .from("purchase_orders")
    .insert({
      org_id: auth.orgId,
      po_number: poNumber,
      po_date: body.poDate ?? new Date().toISOString().slice(0, 10),
      invoice_number: body.invoiceNumber ?? null,
      status: "requested",
      vendor_id: body.vendorId,
      vendor_name: vendor.name,
      subtotal,
      tax_rate_percent: taxRatePercent,
      sales_tax: salesTax,
      shipping_cost: shippingCost,
      discount_cost: discountCost,
      discount_reduces_tax: discountReducesTax,
      grand_total: grandTotal,
      requisition_id: body.requisitionId ?? null,
      notes: body.notes ?? null,
    })
    .select(PURCHASE_ORDER_SELECT)
    .single();

  if (poErr || !po) return jsonServerError("POST /api/v1/purchase-orders", poErr);

  const { data: lineItems, error: lineItemsError } = await db
    .from("po_line_items")
    .insert(lineItemRows.map((li) => ({ ...li, org_id: auth.orgId, po_id: po.id })))
    .select(PO_LINE_ITEM_SELECT);

  if (lineItemsError) {
    // Line items failed after the header committed — delete the just-created
    // header (fresh row, no dependents yet) so it doesn't leak a po_number.
    await db.from("purchase_orders").delete().eq("id", po.id);
    return jsonServerError("POST /api/v1/purchase-orders (line items)", lineItemsError);
  }

  return NextResponse.json(
    { ...shapePurchaseOrder(po), lineItems: (lineItems ?? []).map(shapePoLineItem) },
    { status: 201 }
  );
}
