import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, jsonServerError } from "@/lib/api/route-helpers";
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

  if (error) return jsonServerError("GET /api/v1/products/[id]", error);
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

  let vendorName: string | null | undefined;
  if (body.vendorId) {
    const { data: vendor } = await db
      .from("vendors")
      .select("org_id, name")
      .eq("id", body.vendorId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!vendor || vendor.org_id !== auth.orgId) return jsonError("Vendor not found", 404);
    vendorName = vendor.name as string;
  } else if (body.vendorId === null) {
    // Explicit null clears the vendor — the denormalised name must go with it.
    vendorName = null;
  }

  // The category change is the interesting case (see the mirror block
  // below), so capture what the row looks like BEFORE the update.
  const { data: before } = await db
    .from("product_items")
    .select("category, name, part_number, description, unit_cost, is_inventory, vendor_id, vendor_name")
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!before) return jsonError("Product not found", 404);

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

  if (error) return jsonServerError("PATCH /api/v1/products/[id]", error);
  if (!data) return jsonError("Product not found", 404);

  // ── keep the CMMS `parts` mirror in step ─────────────────────────────────
  // Editing a maintenance_part via the API (rename, re-vendor, re-price) has
  // to reach the linked parts row, same as the app's own useUpdateProduct —
  // otherwise the CMMS Parts tab silently desyncs from the catalog.
  //
  // The case this used to miss entirely is a CATEGORY change. The old code
  // only ever UPDATEd an already-linked row, so:
  //   • switching a product TO maintenance_part created no parts row at all —
  //     invisible in CMMS, and goods-receiving skipped its stock increment;
  //   • switching a product AWAY from maintenance_part left a live parts row
  //     behind, still holding stock, with no catalog counterpart of that
  //     category.
  const wasMaintenancePart = before.category === "maintenance_part";
  const isMaintenancePart = (body.category ?? before.category) === "maintenance_part";

  const { data: linkedPart } = await db
    .from("parts")
    .select("id")
    .eq("org_id", auth.orgId)
    .eq("product_item_id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (isMaintenancePart && !linkedPart) {
    // Newly a maintenance part (or an older row that never got mirrored):
    // create the parts counterpart from the post-update values.
    const partNumber = body.partNumber ?? (before.part_number as string) ?? "";
    // Same unique-index asymmetry POST /products guards against: parts
    // enforces uniqueness on a blank part number, product_items doesn't.
    const { data: clash } = await db
      .from("parts")
      .select("id, product_item_id")
      .eq("org_id", auth.orgId)
      .eq("part_number", partNumber)
      .is("deleted_at", null)
      .maybeSingle();
    if (clash?.product_item_id) {
      return jsonError(`Part number "${partNumber}" is already linked to a different product`, 409);
    }

    const partFields = {
      name: body.name ?? (before.name as string),
      part_number: partNumber,
      description: body.description ?? (before.description as string) ?? "",
      unit_cost: body.unitCostCents ?? (before.unit_cost as number) ?? 0,
      vendor_id: body.vendorId !== undefined ? body.vendorId : (before.vendor_id as string | null),
      vendor_name: vendorName !== undefined ? vendorName : (before.vendor_name as string | null),
      is_inventory: body.isInventory ?? (before.is_inventory as boolean) ?? false,
    };

    // An unlinked parts row with the same part number is the same physical
    // part — adopt it instead of colliding on uq_parts_org_part_number.
    const { error: mirrorError } = clash
      ? await db.from("parts").update({ ...partFields, product_item_id: id }).eq("id", clash.id)
      : await db.from("parts").insert({
          ...partFields,
          org_id: auth.orgId,
          category: "maintenance_part",
          // quantity_on_hand deliberately omitted: a category change is a
          // reclassification, not a receipt. Stock only ever increases from
          // purchasing via GoodsReceipt (CLAUDE.md).
          product_item_id: id,
        });
    if (mirrorError) return jsonServerError("PATCH /api/v1/products/[id] (parts mirror)", mirrorError);
  } else if (!isMaintenancePart && wasMaintenancePart && linkedPart) {
    // No longer a maintenance part: retire the parts row rather than leaving
    // an orphan carrying stock. Soft delete (CLAUDE.md) so its history and
    // any asset_parts links stay auditable, and unlink it so a future
    // re-classification of this product starts clean.
    const { error: retireError } = await db
      .from("parts")
      .update({ deleted_at: new Date().toISOString(), product_item_id: null })
      .eq("id", linkedPart.id);
    if (retireError) return jsonServerError("PATCH /api/v1/products/[id] (parts retire)", retireError);
  } else if (linkedPart) {
    const partSyncFields: Record<string, unknown> = {};
    if (body.name !== undefined) partSyncFields.name = body.name;
    if (body.partNumber !== undefined) partSyncFields.part_number = body.partNumber;
    if (body.description !== undefined) partSyncFields.description = body.description;
    if (body.unitCostCents !== undefined) partSyncFields.unit_cost = body.unitCostCents;
    if (body.vendorId !== undefined) {
      partSyncFields.vendor_id = body.vendorId;
      partSyncFields.vendor_name = vendorName;
    }
    if (body.isInventory !== undefined) partSyncFields.is_inventory = body.isInventory;

    if (Object.keys(partSyncFields).length > 0) {
      const { error: partSyncError } = await db
        .from("parts")
        .update(partSyncFields)
        .eq("id", linkedPart.id);
      if (partSyncError) return jsonServerError("PATCH /api/v1/products/[id] (parts sync)", partSyncError);
    }
  }

  return NextResponse.json(shapeProduct(data));
}
