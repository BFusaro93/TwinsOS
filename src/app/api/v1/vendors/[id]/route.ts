import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, jsonServerError } from "@/lib/api/route-helpers";
import { VENDOR_SELECT, shapeVendor } from "../shape";
import { updateVendorSchema } from "../validation";

/** GET /api/v1/vendors/[id] — fetch one vendor. Requires scope "vendors:read". */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "vendors:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { data, error } = await db
    .from("vendors")
    .select(VENDOR_SELECT)
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return jsonServerError("GET /api/v1/vendors/[id]", error);
  if (!data) return jsonError("Vendor not found", 404);
  return NextResponse.json(shapeVendor(data));
}

/** PATCH /api/v1/vendors/[id] — updates a vendor. Requires scope "vendors:write:safe". */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "vendors:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = updateVendorSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  if (Object.keys(body).length === 0) return jsonError("No fields to update", 400);

  const { data, error } = await db
    .from("vendors")
    .update({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.contactName !== undefined && { contact_name: body.contactName }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.phone !== undefined && { phone: body.phone }),
      ...(body.address !== undefined && { address: body.address }),
      ...(body.website !== undefined && { website: body.website }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.vendorType !== undefined && { vendor_type: body.vendorType }),
      ...(body.isActive !== undefined && { is_active: body.isActive }),
    })
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .select(VENDOR_SELECT)
    .maybeSingle();

  if (error) return jsonServerError("PATCH /api/v1/vendors/[id]", error);
  if (!data) return jsonError("Vendor not found", 404);
  return NextResponse.json(shapeVendor(data));
}
