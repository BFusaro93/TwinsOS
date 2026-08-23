import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, parsePagination } from "@/lib/api/route-helpers";
import { PM_SCHEDULE_SELECT, shapePmSchedule } from "./shape";
import { createPmScheduleSchema } from "./validation";

/** GET /api/v1/pm-schedules — list the org's PM schedules. Requires scope "pm_schedules:read". */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "pm_schedules:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { limit, offset } = parsePagination(request.url);
  const { data, error } = await db
    .from("pm_schedules")
    .select(PM_SCHEDULE_SELECT)
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("next_due_date", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ data: (data ?? []).map(shapePmSchedule), limit, offset });
}

/** POST /api/v1/pm-schedules — creates a PM schedule. Requires scope "pm_schedules:write:safe". */
export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "pm_schedules:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = createPmScheduleSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  let assetName = "";
  if (body.assetId) {
    const { data: asset } = await db.from("assets").select("org_id, name").eq("id", body.assetId).maybeSingle();
    if (!asset || asset.org_id !== auth.orgId) return jsonError("Asset not found", 404);
    assetName = asset.name as string;
  }

  const { data, error } = await db
    .from("pm_schedules")
    .insert({
      org_id: auth.orgId,
      title: body.title,
      asset_id: body.assetId ?? null,
      asset_name: assetName,
      frequency: body.frequency,
      next_due_date: body.nextDueDate,
      description: body.description ?? null,
    })
    .select(PM_SCHEDULE_SELECT)
    .single();

  if (error || !data) return jsonError(error?.message ?? "create failed", 500);
  return NextResponse.json(shapePmSchedule(data), { status: 201 });
}
