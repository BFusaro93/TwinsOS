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

  // Truthy, not `!== undefined`: an explicit null clears the link and has
  // nothing to look up. deleted_at IS NULL so a soft-deleted schedule or
  // parent WO can't be attached.
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
    // A work order that is its own parent drops out of every top-level view.
    if (body.parentWorkOrderId === id) return jsonError("A work order can't be its own parent", 400);
    const { data: parent } = await db
      .from("work_orders")
      .select("org_id")
      .eq("id", body.parentWorkOrderId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!parent || parent.org_id !== auth.orgId) return jsonError("Parent work order not found", 404);
  }

  // assigned_to_id and assigned_to_ids/names are one assignee set and are
  // always written together, primary first:
  //   * assignedToIds given (with or without assignedToId): the set is the
  //     union of both; the primary is the first entry (assignedToId wins when
  //     it is non-null).
  //   * only assignedToId given: a non-null id replaces the old primary and
  //     keeps the existing co-assignees; null unassigns everyone.
  // Previously sending only assignedToIds left assigned_to_id stale, and only
  // assignedToId wiped the co-assignees.
  const assignmentTouched = body.assignedToId !== undefined || body.assignedToIds !== undefined;
  const suppliedIds = [...new Set([body.assignedToId, ...(body.assignedToIds ?? [])].filter((x): x is string => !!x))];
  let assigneeIds = suppliedIds;
  const carriedIds = new Set<string>();
  if (assignmentTouched && body.assignedToIds === undefined && body.assignedToId) {
    const { data: current } = await db
      .from("work_orders")
      .select("assigned_to_id, assigned_to_ids")
      .eq("org_id", auth.orgId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (current) {
      const existing = Array.isArray(current.assigned_to_ids) ? (current.assigned_to_ids as string[]) : [];
      for (const eid of existing) {
        if (eid !== current.assigned_to_id && eid !== body.assignedToId) carriedIds.add(eid);
      }
      assigneeIds = [body.assignedToId, ...carriedIds];
    }
  }
  const employeeMap = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const { data: employees } = await db
      .from("crm_employees")
      .select("id, org_id, first_name, last_name")
      .in("id", assigneeIds)
      .is("deleted_at", null);
    for (const empId of [...assigneeIds]) {
      const emp = (employees ?? []).find((e) => e.id === empId);
      if (!emp || emp.org_id !== auth.orgId) {
        // A carried-over co-assignee who has since been deleted just drops
        // off; an id the caller supplied must exist.
        if (carriedIds.has(empId)) {
          assigneeIds = assigneeIds.filter((x) => x !== empId);
          continue;
        }
        return jsonError(`Employee ${empId} not found`, 404);
      }
      employeeMap.set(empId, `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim());
    }
  }
  const primaryAssigneeId = assigneeIds[0] ?? null;

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
      // Any assignee change rewrites the primary (id + denormalised name)
      // and the arrays together — see the note above.
      ...(assignmentTouched && {
        assigned_to_id: primaryAssigneeId,
        assigned_to_name: primaryAssigneeId ? (employeeMap.get(primaryAssigneeId) ?? null) : null,
        assigned_to_ids: assigneeIds,
        assigned_to_names: assigneeIds.map((aid) => employeeMap.get(aid) ?? ""),
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
