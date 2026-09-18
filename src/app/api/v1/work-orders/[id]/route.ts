import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, jsonServerError } from "@/lib/api/route-helpers";
import { WORK_ORDER_SELECT, shapeWorkOrder } from "../shape";
import { updateWorkOrderSchema } from "../validation";

/** GET /api/v1/work-orders/[id] — fetch one work order. Requires scope "work_orders:read". */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "work_orders:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { data, error } = await db
    .from("work_orders")
    .select(WORK_ORDER_SELECT)
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return jsonServerError("GET /api/v1/work-orders/[id]", error);
  if (!data) return jsonError("Work order not found", 404);
  return NextResponse.json(shapeWorkOrder(data));
}

/** PATCH /api/v1/work-orders/[id] — updates a work order. Requires scope "work_orders:write:safe". */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "work_orders:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = updateWorkOrderSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  if (Object.keys(body).length === 0) return jsonError("No fields to update", 400);

  if (body.pmScheduleId !== undefined) {
    const { data: pm } = await db.from("pm_schedules").select("org_id").eq("id", body.pmScheduleId).maybeSingle();
    if (!pm || pm.org_id !== auth.orgId) return jsonError("PM schedule not found", 404);
  }
  if (body.parentWorkOrderId !== undefined) {
    const { data: parent } = await db
      .from("work_orders")
      .select("org_id")
      .eq("id", body.parentWorkOrderId)
      .maybeSingle();
    if (!parent || parent.org_id !== auth.orgId) return jsonError("Parent work order not found", 404);
  }

  const assigneeIds = [...new Set([body.assignedToId, ...(body.assignedToIds ?? [])].filter((x): x is string => !!x))];
  const employeeMap = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const { data: employees } = await db
      .from("crm_employees")
      .select("id, org_id, first_name, last_name")
      .in("id", assigneeIds);
    for (const empId of assigneeIds) {
      const emp = (employees ?? []).find((e) => e.id === empId);
      if (!emp || emp.org_id !== auth.orgId) return jsonError(`Employee ${empId} not found`, 404);
      employeeMap.set(empId, `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim());
    }
  }

  const { data, error } = await db
    .from("work_orders")
    .update({
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.dueDate !== undefined && { due_date: body.dueDate }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.pmScheduleId !== undefined && { pm_schedule_id: body.pmScheduleId }),
      ...(body.parentWorkOrderId !== undefined && { parent_work_order_id: body.parentWorkOrderId }),
      ...(body.assignedToId !== undefined && {
        assigned_to_id: body.assignedToId,
        assigned_to_name: employeeMap.get(body.assignedToId) ?? null,
      }),
      ...(body.assignedToIds !== undefined && {
        assigned_to_ids: body.assignedToIds,
        assigned_to_names: body.assignedToIds.map((id) => employeeMap.get(id)),
      }),
    })
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .select(WORK_ORDER_SELECT)
    .maybeSingle();

  if (error) return jsonServerError("PATCH /api/v1/work-orders/[id]", error);
  if (!data) return jsonError("Work order not found", 404);
  return NextResponse.json(shapeWorkOrder(data));
}
