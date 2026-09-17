import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, jsonServerError, parsePagination } from "@/lib/api/route-helpers";
import { PRODUCT_SELECT, shapeProduct } from "./shape";
import { createProductSchema } from "./validation";

/** GET /api/v1/products — list the org's product catalog items. Requires scope "products:read". */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "products:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { limit, offset } = parsePagination(request.url);
  const { data, error } = await db
    .from("product_items")
    .select(PRODUCT_SELECT)
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return jsonServerError("GET /api/v1/products", error);
  return NextResponse.json({ data: (data ?? []).map(shapeProduct), limit, offset });
}

/** POST /api/v1/products — creates a product catalog entry. Requires scope "products:write:safe". */
export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "products:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = createProductSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  let vendorName = "";
  if (body.vendorId) {
    const { data: vendor } = await db.from("vendors").select("org_id, name").eq("id", body.vendorId).maybeSingle();
    if (!vendor || vendor.org_id !== auth.orgId) return jsonError("Vendor not found", 404);
    vendorName = vendor.name as string;
  }

  const { data, error } = await db
    .from("product_items")
    .insert({
      org_id: auth.orgId,
      name: body.name,
      description: body.description ?? "",
      part_number: body.partNumber ?? "",
      category: body.category,
      unit_cost: body.unitCostCents ?? 0,
      price: body.priceCents ?? 0,
      vendor_id: body.vendorId ?? null,
      vendor_name: vendorName,
      is_inventory: body.isInventory ?? false,
    })
    .select(PRODUCT_SELECT)
    .single();

  if (error || !data) return jsonServerError("POST /api/v1/products", error);

  // Mirror into the CMMS parts inventory, same as the app's own "New
  // Product" form (useCreateProduct in src/lib/hooks/use-products.ts) —
  // without this, a maintenance_part created here would be invisible on
  // the CMMS Parts tab and goods-receiving it would silently skip
  // incrementing parts.quantity_on_hand (receive_part_quantity requires an
  // existing linked row and never creates one).
  if (body.category === "maintenance_part") {
    const { error: partError } = await db.from("parts").insert({
      org_id: auth.orgId,
      name: body.name,
      part_number: body.partNumber ?? "",
      description: body.description ?? "",
      category: "maintenance_part",
      unit_cost: body.unitCostCents ?? 0,
      quantity_on_hand: body.quantityOnHand ?? 0,
      minimum_stock: body.minimumStock ?? 0,
      vendor_id: body.vendorId ?? null,
      vendor_name: vendorName,
      product_item_id: data.id,
      is_inventory: body.isInventory ?? false,
    });
    if (partError) return jsonServerError("POST /api/v1/products (parts mirror)", partError);
  }

  return NextResponse.json(shapeProduct(data), { status: 201 });
}
