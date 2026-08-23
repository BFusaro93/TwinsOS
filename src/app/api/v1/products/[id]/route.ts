import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/route-helpers";
import { PRODUCT_SELECT, shapeProduct } from "../shape";
import { updateProductSchema } from "../validation";

/** GET /api/v1/products/[id] — fetch one product catalog entry. Requires scope "products:read". */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "products:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { data, error } = await db
    .from("product_items")
    .select(PRODUCT_SELECT)
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Product not found", 404);
  return NextResponse.json(shapeProduct(data));
}

/** PATCH /api/v1/products/[id] — updates a product catalog entry. Requires scope "products:write:safe". */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "products:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = updateProductSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  if (Object.keys(body).length === 0) return jsonError("No fields to update", 400);

  let vendorName: string | undefined;
  if (body.vendorId !== undefined) {
    const { data: vendor } = await db.from("vendors").select("org_id, name").eq("id", body.vendorId).maybeSingle();
    if (!vendor || vendor.org_id !== auth.orgId) return jsonError("Vendor not found", 404);
    vendorName = vendor.name as string;
  }

  const { data, error } = await db
    .from("product_items")
    .update({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.partNumber !== undefined && { part_number: body.partNumber }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.unitCostCents !== undefined && { unit_cost: body.unitCostCents }),
      ...(body.priceCents !== undefined && { price: body.priceCents }),
      ...(body.vendorId !== undefined && { vendor_id: body.vendorId, vendor_name: vendorName }),
      ...(body.isInventory !== undefined && { is_inventory: body.isInventory }),
    })
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .select(PRODUCT_SELECT)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Product not found", 404);
  return NextResponse.json(shapeProduct(data));
}
