import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/route-helpers";
import { PROJECT_SELECT, shapeProject } from "../shape";
import { updateProjectSchema } from "../validation";

/** GET /api/v1/projects/[id] — fetch one project. Requires scope "projects:read". */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "projects:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { data, error } = await db
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Project not found", 404);
  return NextResponse.json(shapeProject(data));
}

/** PATCH /api/v1/projects/[id] — updates a project. Requires scope "projects:write:safe". */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "projects:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = updateProjectSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  if (Object.keys(body).length === 0) return jsonError("No fields to update", 400);

  const { data, error } = await db
    .from("projects")
    .update({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.customerName !== undefined && { customer_name: body.customerName }),
      ...(body.address !== undefined && { address: body.address }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.startDate !== undefined && { start_date: body.startDate }),
      ...(body.endDate !== undefined && { end_date: body.endDate }),
      ...(body.notes !== undefined && { notes: body.notes }),
    })
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .select(PROJECT_SELECT)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Project not found", 404);
  return NextResponse.json(shapeProject(data));
}
