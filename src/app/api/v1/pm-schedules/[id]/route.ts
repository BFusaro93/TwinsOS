import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/route-helpers";
import { PM_SCHEDULE_SELECT, shapePmSchedule } from "../shape";
import { updatePmScheduleSchema } from "../validation";

/** GET /api/v1/pm-schedules/[id] — fetch one PM schedule. Requires scope "pm_schedules:read". */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "pm_schedules:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { data, error } = await db
    .from("pm_schedules")
    .select(PM_SCHEDULE_SELECT)
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("PM schedule not found", 404);
  return NextResponse.json(shapePmSchedule(data));
}

/** PATCH /api/v1/pm-schedules/[id] — updates a PM schedule. Requires scope "pm_schedules:write:safe". */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "pm_schedules:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = updatePmScheduleSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  if (Object.keys(body).length === 0) return jsonError("No fields to update", 400);

  const { data, error } = await db
    .from("pm_schedules")
    .update({
      ...(body.title !== undefined && { title: body.title }),
      ...(body.frequency !== undefined && { frequency: body.frequency }),
      ...(body.nextDueDate !== undefined && { next_due_date: body.nextDueDate }),
      ...(body.lastCompletedDate !== undefined && { last_completed_date: body.lastCompletedDate }),
      ...(body.isActive !== undefined && { is_active: body.isActive }),
      ...(body.description !== undefined && { description: body.description }),
    })
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .select(PM_SCHEDULE_SELECT)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("PM schedule not found", 404);
  return NextResponse.json(shapePmSchedule(data));
}
