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
    const { data: vendor } = await db
      .from("vendors")
      .select("org_id, name")
      .eq("id", body.vendorId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!vendor || vendor.org_id !== auth.orgId) return jsonError("Vendor not found", 404);
    vendorName = vendor.name as string;
  }

  // ── pre-flight the parts mirror BEFORE committing the catalog row ─────────
  // The two unique indexes are NOT equivalent:
  //   uq_product_items_org_part_number ... WHERE part_number <> '' AND deleted_at IS NULL
  //   uq_parts_org_part_number         ... WHERE                      deleted_at IS NULL
  // so a blank part number is unlimited on product_items but collides on the
  // SECOND parts row. Inserting the catalog row first and discovering that
  // afterwards left a committed, orphaned product_items row with no parts
  // counterpart — the exact state the mirror exists to prevent, and one
  // goods-receiving then silently skips (receive_part_quantity needs an
  // existing linked row and never creates one).
  //
  // Resolving the target parts row up front makes the pair effectively
  // atomic: either we know which parts row this product will own before the
  // catalog row exists, or we fail cleanly having written nothing.
  let linkExistingPartId: string | null = null;
  if (body.category === "maintenance_part") {
    if (body.partNumber) {
      const { data: existingPart, error: lookupError } = await db
        .from("parts")
        .select("id, product_item_id")
        .eq("org_id", auth.orgId)
        .eq("part_number", body.partNumber)
        .is("deleted_at", null)
        .maybeSingle();
      if (lookupError) return jsonServerError("POST /api/v1/products (parts lookup)", lookupError);

      if (existingPart?.product_item_id) {
        return jsonError(`Part number "${body.partNumber}" is already linked to a different product`, 409);
      }
      // An unlinked parts row with this exact part number (earlier CSV
      // import or manual CMMS entry) is the same physical part — adopt it
      // rather than failing on the unique index.
      if (existingPart) linkExistingPartId = existingPart.id as string;
    } else {
      // No part number to match on: an empty string can't identify "the same
      // physical part", so adoption isn't possible. Refuse up front if the
      // org already holds a blank-part-number parts row, since the insert
      // below would violate uq_parts_org_part_number.
      const { data: blankPart, error: blankError } = await db
        .from("parts")
        .select("id")
        .eq("org_id", auth.orgId)
        .eq("part_number", "")
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (blankError) return jsonServerError("POST /api/v1/products (parts lookup)", blankError);
      if (blankPart) {
        return jsonError(
          "partNumber is required for a maintenance_part: this organization already has a part with a blank part number, and CMMS parts must have unique part numbers",
          409
        );
      }
    }
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
      // Opening balance, written to BOTH tables — same as the app's own
      // useCreateProduct (src/lib/hooks/use-products.ts). It used to land on
      // `parts` only, so create_products {quantityOnHand: 50} showed 50 in
      // CMMS Parts and 0 in the catalog, permanently offset. This is a
      // starting count at catalog-entry time, NOT a purchasing increment —
      // GoodsReceipt remains the only path that increases stock from a PO.
      quantity_on_hand: body.quantityOnHand ?? 0,
      minimum_stock: body.minimumStock ?? 0,
    })
    .select(PRODUCT_SELECT)
    .single();

  if (error || !data) return jsonServerError("POST /api/v1/products", error);

  // Mirror into the CMMS parts inventory, same as the app's own "New
  // Product" form (useCreateProduct in src/lib/hooks/use-products.ts) —
  // without this, a maintenance_part created here would be invisible on
  // the CMMS Parts tab and goods-receiving it would silently skip
  // incrementing parts.quantity_on_hand.
  if (body.category === "maintenance_part") {
    const { error: partError } = linkExistingPartId
      ? await db
          .from("parts")
          .update({
            product_item_id: data.id,
            vendor_id: body.vendorId ?? null,
            vendor_name: vendorName,
          })
          .eq("id", linkExistingPartId)
      : await db.from("parts").insert({
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

    if (partError) {
      // The pre-flight above resolved every collision we can anticipate, so
      // reaching here means something raced us (a concurrent create with the
      // same part number) or failed for an unrelated reason. Roll the
      // catalog row back rather than leaving it orphaned with no parts
      // counterpart — the caller is being told the request failed, so it
      // must not survive.
      //
      // Soft delete, per CLAUDE.md's soft-deletes-only rule — and it's
      // sufficient: uq_product_items_org_part_number is partial on
      // `deleted_at IS NULL`, so stamping deleted_at frees the part number
      // for a retry immediately.
      await db
        .from("product_items")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", data.id)
        .eq("org_id", auth.orgId);
      return jsonServerError("POST /api/v1/products (parts mirror)", partError);
    }
  }

  return NextResponse.json(shapeProduct(data), { status: 201 });
}
