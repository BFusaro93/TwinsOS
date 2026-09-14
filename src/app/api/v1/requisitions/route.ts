import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, jsonServerError, parsePagination } from "@/lib/api/route-helpers";
import { createRequisitionRecord } from "@/lib/requisitions/create-requisition";
import { REQUISITION_SELECT, shapeRequisition } from "./shape";
import { createRequisitionSchema } from "./validation";

/** GET /api/v1/requisitions — list the org's requisitions. Requires scope "requisitions:read". */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "requisitions:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { limit, offset } = parsePagination(request.url);
  const { data, error } = await db
    .from("requisitions")
    .select(REQUISITION_SELECT)
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return jsonServerError("GET /api/v1/requisitions", error);
  return NextResponse.json({ data: (data ?? []).map(shapeRequisition), limit, offset });
}

/**
 * POST /api/v1/requisitions — creates a draft requisition with its line items.
 * Requires scope "requisitions:write:safe". Always created in "draft" status —
 * moving it to pending_approval and beyond goes through the app's approval
 * flow, not this API, so there's no PATCH endpoint for requisitions.
 */
export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "requisitions:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = createRequisitionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  let vendorName: string | null = null;
  if (body.vendorId) {
    const { data: vendor } = await db.from("vendors").select("org_id, name").eq("id", body.vendorId).maybeSingle();
    if (!vendor || vendor.org_id !== auth.orgId) return jsonError("Vendor not found", 404);
    vendorName = vendor.name as string;
  }
  if (body.workOrderId) {
    const { data: wo } = await db.from("work_orders").select("org_id").eq("id", body.workOrderId).maybeSingle();
    if (!wo || wo.org_id !== auth.orgId) return jsonError("Work order not found", 404);
  }

  const productIds = [...new Set(body.lineItems.map((li) => li.productItemId))];
  const { data: products } = await db
    .from("product_items")
    .select("id, org_id, name, part_number, unit_cost, category")
    .in("id", productIds);
  const productMap = new Map((products ?? []).map((p) => [p.id as string, p]));
  for (const id of productIds) {
    const product = productMap.get(id);
    if (!product || product.org_id !== auth.orgId) return jsonError(`Product item ${id} not found`, 404);
  }

  // Only project_material and stocked_material categories may carry a
  // project_id (see CLAUDE.md "Project cost tracking") — the app's
  // NewRequisitionDialog enforces this client-side but this public API
  // bypasses that UI entirely, so it must be re-checked here.
  const projectIds = [...new Set(body.lineItems.map((li) => li.projectId).filter((id): id is string => !!id))];
  const projectMap = new Map<string, { org_id: string }>();
  if (projectIds.length > 0) {
    const { data: projects } = await db.from("projects").select("id, org_id").in("id", projectIds);
    for (const p of projects ?? []) projectMap.set(p.id as string, p as { org_id: string });
  }
  for (const li of body.lineItems) {
    if (!li.projectId) continue;
    const product = productMap.get(li.productItemId)!;
    if (product.category === "maintenance_part") {
      return jsonError(
        `Product item ${li.productItemId} is a maintenance_part and cannot carry a projectId`,
        400
      );
    }
    // Never trust a client-supplied projectId's org — a caller could pass
    // another org's project id and have it silently linked to this org's
    // requisition line item.
    const project = projectMap.get(li.projectId);
    if (!project || project.org_id !== auth.orgId) return jsonError(`Project ${li.projectId} not found`, 404);
  }

  const { requisition, error: createError } = await createRequisitionRecord(
    db,
    {
      orgId: auth.orgId,
      title: body.title,
      vendorId: body.vendorId ?? null,
      vendorName,
      workOrderId: body.workOrderId ?? null,
      requestedByName: "Public API",
      notes: body.notes ?? null,
      taxRatePercent: body.taxRatePercent,
      shippingCostCents: body.shippingCostCents,
      lineItems: body.lineItems.map((li) => ({
        productItemId: li.productItemId,
        quantity: li.quantity,
        unitCostCents: li.unitCostCents,
        projectId: li.projectId,
        notes: li.notes,
      })),
    },
    productMap as unknown as Map<string, { name: string; part_number?: string | null; unit_cost: number }>
  );

  if (createError || !requisition) return jsonServerError("POST /api/v1/requisitions", createError);

  return NextResponse.json(shapeRequisition(requisition), { status: 201 });
}
