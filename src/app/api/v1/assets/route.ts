import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, jsonServerError, parsePagination } from "@/lib/api/route-helpers";
import { ASSET_SELECT, shapeAsset } from "./shape";
import { createAssetSchema } from "./validation";

/** GET /api/v1/assets — list the org's assets. Requires scope "assets:read". */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "assets:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { limit, offset } = parsePagination(request.url);
  const { data, error } = await db
    .from("assets")
    .select(ASSET_SELECT)
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return jsonServerError("GET /api/v1/assets", error);
  return NextResponse.json({ data: (data ?? []).map(shapeAsset), limit, offset });
}

/** POST /api/v1/assets — creates an asset. Requires scope "assets:write:safe". */
export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "assets:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = createAssetSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  const { data, error } = await db
    .from("assets")
    .insert({
      org_id: auth.orgId,
      name: body.name,
      asset_tag: body.assetTag ?? "",
      equipment_number: body.equipmentNumber ?? null,
      asset_type: body.assetType ?? "",
      status: body.status ?? "active",
      make: body.make ?? null,
      model: body.model ?? null,
      year: body.year ?? null,
      serial_number: body.serialNumber ?? null,
      division: body.division ?? null,
      location: body.location ?? null,
      notes: body.notes ?? null,
    })
    .select(ASSET_SELECT)
    .single();

  if (error || !data) return jsonServerError("POST /api/v1/assets", error);
  return NextResponse.json(shapeAsset(data), { status: 201 });
}
