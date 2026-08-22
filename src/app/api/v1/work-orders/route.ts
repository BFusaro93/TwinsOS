import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, parsePagination } from "@/lib/api/route-helpers";
import { WORK_ORDER_SELECT, shapeWorkOrder } from "./shape";
import { createWorkOrderSchema } from "./validation";

/** GET /api/v1/work-orders — list the org's work orders. Requires scope "work_orders:read". */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "work_orders:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { limit, offset } = parsePagination(request.url);
  const { data, error } = await db
    .from("work_orders")
    .select(WORK_ORDER_SELECT)
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ data: (data ?? []).map(shapeWorkOrder), limit, offset });
}

/** POST /api/v1/work-orders — creates a work order. Requires scope "work_orders:write:safe". */
export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "work_orders:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = createWorkOrderSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  let assetName: string | null = null;
  if (body.assetId) {
    const { data: asset } = await db.from("assets").select("org_id, name").eq("id", body.assetId).maybeSingle();
    if (!asset || asset.org_id !== auth.orgId) return jsonError("Asset not found", 404);
    assetName = asset.name as string;
  }

  const { data, error } = await db
    .from("work_orders")
    .insert({
      org_id: auth.orgId,
      title: body.title,
      asset_id: body.assetId ?? null,
      asset_name: assetName,
      linked_entity_type: body.assetId ? "asset" : null,
      description: body.description ?? null,
      priority: body.priority ?? "medium",
      wo_type: body.woType ?? null,
      due_date: body.dueDate ?? null,
      category: body.category ?? null,
      status: "open",
    })
    .select(WORK_ORDER_SELECT)
    .single();

  if (error || !data) return jsonError(error?.message ?? "create failed", 500);
  return NextResponse.json(shapeWorkOrder(data), { status: 201 });
}
