import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, jsonServerError } from "@/lib/api/route-helpers";
import { PART_SELECT, shapePart } from "../shape";
import { updatePartSchema } from "../validation";

/** GET /api/v1/parts/[id] — fetch one part. Requires scope "parts:read". */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "parts:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { data, error } = await db
    .from("parts")
    .select(PART_SELECT)
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return jsonServerError("GET /api/v1/parts/[id]", error);
  if (!data) return jsonError("Part not found", 404);
  return NextResponse.json(shapePart(data));
}

/** PATCH /api/v1/parts/[id] — updates a part's catalog fields. Requires scope "parts:write:safe". quantityOnHand cannot be set here — it only changes via goods receipt. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "parts:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = updatePartSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  if (Object.keys(body).length === 0) return jsonError("No fields to update", 400);

  // Truthy, not `!== undefined`: an explicit null clears the vendor, and the
  // denormalised vendor_name has to be cleared with it.
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
    vendorName = null;
  }

  const { data, error } = await db
    .from("parts")
    .update({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.partNumber !== undefined && { part_number: body.partNumber }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.minimumStock !== undefined && { minimum_stock: body.minimumStock }),
      ...(body.unitCostCents !== undefined && { unit_cost: body.unitCostCents }),
      ...(body.vendorId !== undefined && { vendor_id: body.vendorId, vendor_name: vendorName }),
    })
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .select(PART_SELECT)
    .maybeSingle();

  if (error?.code === "23505") return jsonError("Another part already uses that partNumber", 409);
  if (error) return jsonServerError("PATCH /api/v1/parts/[id]", error);
  if (!data) return jsonError("Part not found", 404);

  // Keep the linked catalog product in step, as the app's useUpdatePart does —
  // otherwise POs (which default their unit cost, name and part number from
  // the catalog item) keep the old values.
  const { data: linked } = await db
    .from("parts")
    .select("product_item_id")
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .maybeSingle();
  if (linked?.product_item_id) {
    const productSync: Record<string, unknown> = {};
    if (body.name !== undefined) productSync.name = body.name;
    if (body.partNumber !== undefined) productSync.part_number = body.partNumber;
    if (body.description !== undefined) productSync.description = body.description;
    if (body.minimumStock !== undefined) productSync.minimum_stock = body.minimumStock;
    if (body.unitCostCents !== undefined) productSync.unit_cost = body.unitCostCents;
    if (body.vendorId !== undefined) {
      productSync.vendor_id = body.vendorId;
      productSync.vendor_name = vendorName ?? "";
    }
    if (Object.keys(productSync).length > 0) {
      const { error: syncError } = await db
        .from("product_items")
        .update(productSync)
        .eq("id", linked.product_item_id)
        .eq("org_id", auth.orgId);
      if (syncError?.code === "23505") return jsonError("Another product already uses that partNumber", 409);
      if (syncError) return jsonServerError("PATCH /api/v1/parts/[id] (catalog sync)", syncError);
    }
  }
  return NextResponse.json(shapePart(data));
}
