import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/route-helpers";
import { WORK_ORDER_SELECT, shapeWorkOrder } from "../shape";

const updateWorkOrderSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(["open", "on_hold", "in_progress", "done"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  dueDate: z.string().optional(),
  category: z.string().optional(),
});

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

  if (error) return jsonError(error.message, 500);
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

  const { data, error } = await db
    .from("work_orders")
    .update({
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.dueDate !== undefined && { due_date: body.dueDate }),
      ...(body.category !== undefined && { category: body.category }),
    })
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .select(WORK_ORDER_SELECT)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Work order not found", 404);
  return NextResponse.json(shapeWorkOrder(data));
}
