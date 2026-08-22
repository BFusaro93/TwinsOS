import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/route-helpers";
import { ASSET_SELECT, shapeAsset } from "../shape";
import { updateAssetSchema } from "../validation";

/** GET /api/v1/assets/[id] — fetch one asset. Requires scope "assets:read". */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "assets:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { data, error } = await db
    .from("assets")
    .select(ASSET_SELECT)
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Asset not found", 404);
  return NextResponse.json(shapeAsset(data));
}

/** PATCH /api/v1/assets/[id] — updates an asset. Requires scope "assets:write:safe". */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "assets:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = updateAssetSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  if (Object.keys(body).length === 0) return jsonError("No fields to update", 400);

  const { data, error } = await db
    .from("assets")
    .update({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.assetTag !== undefined && { asset_tag: body.assetTag }),
      ...(body.equipmentNumber !== undefined && { equipment_number: body.equipmentNumber }),
      ...(body.assetType !== undefined && { asset_type: body.assetType }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.make !== undefined && { make: body.make }),
      ...(body.model !== undefined && { model: body.model }),
      ...(body.year !== undefined && { year: body.year }),
      ...(body.serialNumber !== undefined && { serial_number: body.serialNumber }),
      ...(body.division !== undefined && { division: body.division }),
      ...(body.location !== undefined && { location: body.location }),
      ...(body.notes !== undefined && { notes: body.notes }),
    })
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .select(ASSET_SELECT)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Asset not found", 404);
  return NextResponse.json(shapeAsset(data));
}
