import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, jsonServerError, parsePagination } from "@/lib/api/route-helpers";
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

  if (error) return jsonServerError("GET /api/v1/work-orders", error);
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
    const { data: asset } = await db
      .from("assets")
      .select("org_id, name")
      .eq("id", body.assetId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!asset || asset.org_id !== auth.orgId) return jsonError("Asset not found", 404);
    assetName = asset.name as string;
  }

  if (body.pmScheduleId) {
    const { data: pm } = await db
      .from("pm_schedules")
      .select("org_id")
      .eq("id", body.pmScheduleId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!pm || pm.org_id !== auth.orgId) return jsonError("PM schedule not found", 404);
  }
  if (body.parentWorkOrderId) {
    const { data: parent } = await db
      .from("work_orders")
      .select("org_id")
      .eq("id", body.parentWorkOrderId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!parent || parent.org_id !== auth.orgId) return jsonError("Parent work order not found", 404);
  }

  const assigneeIds = [...new Set([body.assignedToId, ...(body.assignedToIds ?? [])].filter((x): x is string => !!x))];
  const employeeMap = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const { data: employees } = await db
      .from("crm_employees")
      .select("id, org_id, first_name, last_name")
      .in("id", assigneeIds)
      .is("deleted_at", null);
    for (const id of assigneeIds) {
      const emp = (employees ?? []).find((e) => e.id === id);
      if (!emp || emp.org_id !== auth.orgId) return jsonError(`Employee ${id} not found`, 404);
      employeeMap.set(id, `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim());
    }
  }

  // Atomic per-org/year counter, not Date.now() — see next_work_order_number().
  const { data: workOrderNumber, error: woNumErr } = await db.rpc("next_work_order_number", {
    p_org_id_override: auth.orgId,
  });
  if (woNumErr || !workOrderNumber) return jsonServerError("POST /api/v1/work-orders (next_work_order_number)", woNumErr);

  const { data, error } = await db
    .from("work_orders")
    .insert({
      org_id: auth.orgId,
      work_order_number: workOrderNumber,
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
      pm_schedule_id: body.pmScheduleId ?? null,
      parent_work_order_id: body.parentWorkOrderId ?? null,
      assigned_to_id: body.assignedToId ?? null,
      assigned_to_name: body.assignedToId ? employeeMap.get(body.assignedToId) : null,
      assigned_to_ids: body.assignedToIds ?? [],
      assigned_to_names: (body.assignedToIds ?? []).map((id) => employeeMap.get(id)),
    })
    .select(WORK_ORDER_SELECT)
    .single();

  if (error || !data) return jsonServerError("POST /api/v1/work-orders", error);
  return NextResponse.json(shapeWorkOrder(data), { status: 201 });
}
