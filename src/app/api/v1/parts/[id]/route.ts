import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/route-helpers";
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

  if (error) return jsonError(error.message, 500);
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

  let vendorName: string | undefined;
  if (body.vendorId !== undefined) {
    const { data: vendor } = await db.from("vendors").select("org_id, name").eq("id", body.vendorId).maybeSingle();
    if (!vendor || vendor.org_id !== auth.orgId) return jsonError("Vendor not found", 404);
    vendorName = vendor.name as string;
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

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Part not found", 404);
  return NextResponse.json(shapePart(data));
}
