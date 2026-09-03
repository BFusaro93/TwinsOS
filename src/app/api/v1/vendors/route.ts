import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, jsonServerError, parsePagination } from "@/lib/api/route-helpers";
import { VENDOR_SELECT, shapeVendor } from "./shape";
import { createVendorSchema } from "./validation";

/** GET /api/v1/vendors — list the org's vendors. Requires scope "vendors:read". */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "vendors:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { limit, offset } = parsePagination(request.url);
  const { data, error } = await db
    .from("vendors")
    .select(VENDOR_SELECT)
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return jsonServerError("GET /api/v1/vendors", error);
  return NextResponse.json({ data: (data ?? []).map(shapeVendor), limit, offset });
}

/** POST /api/v1/vendors — creates a vendor. Requires scope "vendors:write:safe". */
export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "vendors:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = createVendorSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  const { data, error } = await db
    .from("vendors")
    .insert({
      org_id: auth.orgId,
      name: body.name,
      contact_name: body.contactName ?? "",
      email: body.email ?? "",
      phone: body.phone ?? "",
      address: body.address ?? "",
      website: body.website ?? null,
      notes: body.notes ?? null,
      vendor_type: body.vendorType ?? null,
    })
    .select(VENDOR_SELECT)
    .single();

  if (error || !data) return jsonServerError("POST /api/v1/vendors", error);
  return NextResponse.json(shapeVendor(data), { status: 201 });
}
