import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, jsonServerError, parsePagination } from "@/lib/api/route-helpers";
import { PART_SELECT, shapePart } from "./shape";
import { createPartSchema } from "./validation";

/** GET /api/v1/parts — list the org's parts inventory. Requires scope "parts:read". */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "parts:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { limit, offset } = parsePagination(request.url);
  const { data, error } = await db
    .from("parts")
    .select(PART_SELECT)
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return jsonServerError("GET /api/v1/parts", error);
  return NextResponse.json({ data: (data ?? []).map(shapePart), limit, offset });
}

/** POST /api/v1/parts — creates a part. Requires scope "parts:write:safe". New parts start with quantityOnHand 0 — stock is only ever added via goods receipt. */
export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "parts:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = createPartSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  let vendorName: string | null = null;
  if (body.vendorId) {
    const { data: vendor } = await db
      .from("vendors")
      .select("org_id, name")
      .eq("id", body.vendorId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!vendor || vendor.org_id !== auth.orgId) return jsonError("Vendor not found", 404);
    vendorName = vendor.name as string;
  }

  const { data, error } = await db
    .from("parts")
    .insert({
      org_id: auth.orgId,
      name: body.name,
      part_number: body.partNumber ?? "",
      description: body.description ?? "",
      category: body.category ?? "",
      minimum_stock: body.minimumStock ?? 0,
      unit_cost: body.unitCostCents ?? 0,
      vendor_id: body.vendorId ?? null,
      vendor_name: vendorName,
    })
    .select(PART_SELECT)
    .single();

  if (error?.code === "23505") return jsonError("Another part already uses that partNumber", 409);
  if (error || !data) return jsonServerError("POST /api/v1/parts", error);

  // Every part has a shadow product_items row (the app's own useCreatePart
  // creates it): the Products catalog is the only thing a PO/requisition line
  // can reference, and goods receiving resolves the part through it. Without
  // one an API-created part could never be ordered or received. An existing
  // unlinked catalog item with the same part number is the same physical item
  // — adopt it rather than colliding on the unique index.
  let productId: string | null = null;
  if (body.partNumber) {
    const { data: existingProduct } = await db
      .from("product_items")
      .select("id")
      .eq("org_id", auth.orgId)
      .eq("part_number", body.partNumber)
      .eq("category", "maintenance_part")
      .is("deleted_at", null)
      .maybeSingle();
    if (existingProduct) {
      const { data: taken } = await db
        .from("parts")
        .select("id")
        .eq("product_item_id", existingProduct.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (!taken) productId = existingProduct.id as string;
    }
  }
  if (!productId) {
    const { data: product, error: productError } = await db
      .from("product_items")
      .insert({
        org_id: auth.orgId,
        name: body.name,
        part_number: body.partNumber ?? "",
        description: body.description ?? "",
        category: "maintenance_part",
        unit_cost: body.unitCostCents ?? 0,
        price: body.unitCostCents ?? 0,
        vendor_id: body.vendorId ?? null,
        vendor_name: vendorName ?? "",
        is_inventory: true,
        minimum_stock: body.minimumStock ?? 0,
        part_category: body.category || null,
      })
      .select("id")
      .single();
    if (productError || !product) {
      // Don't leave a part that can't be ordered or received: retire it.
      await db
        .from("parts")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", data.id)
        .eq("org_id", auth.orgId);
      return jsonServerError("POST /api/v1/parts (catalog mirror)", productError);
    }
    productId = product.id as string;
  }
  await db.from("parts").update({ product_item_id: productId }).eq("id", data.id).eq("org_id", auth.orgId);

  return NextResponse.json(shapePart(data), { status: 201 });
}
