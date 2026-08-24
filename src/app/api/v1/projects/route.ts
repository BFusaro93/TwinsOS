import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, parsePagination } from "@/lib/api/route-helpers";
import { PROJECT_SELECT, shapeProject } from "./shape";
import { createProjectSchema } from "./validation";

/** GET /api/v1/projects — list the org's projects. Requires scope "projects:read". */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "projects:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { limit, offset } = parsePagination(request.url);
  const { data, error } = await db
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ data: (data ?? []).map(shapeProject), limit, offset });
}

/** POST /api/v1/projects — creates a project. Requires scope "projects:write:safe". */
export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "projects:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = createProjectSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  const { data, error } = await db
    .from("projects")
    .insert({
      org_id: auth.orgId,
      name: body.name,
      customer_name: body.customerName ?? "",
      address: body.address ?? "",
      status: body.status ?? "scheduled",
      start_date: body.startDate ?? null,
      end_date: body.endDate ?? null,
      notes: body.notes ?? null,
    })
    .select(PROJECT_SELECT)
    .single();

  if (error || !data) return jsonError(error?.message ?? "create failed", 500);
  return NextResponse.json(shapeProject(data), { status: 201 });
}
