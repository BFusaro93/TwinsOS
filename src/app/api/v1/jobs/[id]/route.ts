import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, jsonServerError } from "@/lib/api/route-helpers";
import { JOB_SELECT, shapeJob } from "../shape";
import { updateJobSchema } from "../validation";

/** GET /api/v1/jobs/[id] — fetch one job. Requires scope "jobs:read". */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "jobs:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { data, error } = await db
    .from("crm_jobs")
    .select(JOB_SELECT)
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return jsonServerError("GET /api/v1/jobs/[id]", error);
  if (!data) return jsonError("Job not found", 404);
  return NextResponse.json(shapeJob(data));
}

/** PATCH /api/v1/jobs/[id] — updates a job. Requires scope "jobs:write:safe". */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "jobs:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = updateJobSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  if (Object.keys(body).length === 0) return jsonError("No fields to update", 400);

  if (body.crewId) {
    const { data: crew } = await db.from("crm_crews").select("org_id").eq("id", body.crewId).maybeSingle();
    if (!crew || crew.org_id !== auth.orgId) return jsonError("Crew not found", 404);
  }

  const { data, error } = await db
    .from("crm_jobs")
    .update({
      ...(body.status !== undefined && { status: body.status }),
      ...(body.subStatus !== undefined && { sub_status: body.subStatus }),
      ...(body.scheduledDate !== undefined && { scheduled_date: body.scheduledDate }),
      ...(body.crewId !== undefined && { crew_id: body.crewId }),
      ...(body.rateCents !== undefined && { rate_cents: body.rateCents }),
      ...(body.notesToCrew !== undefined && { notes_to_crew: body.notesToCrew }),
      ...(body.completionNotes !== undefined && { completion_notes: body.completionNotes }),
    })
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .select(JOB_SELECT)
    .maybeSingle();

  if (error) return jsonServerError("PATCH /api/v1/jobs/[id]", error);
  if (!data) return jsonError("Job not found", 404);
  return NextResponse.json(shapeJob(data));
}
