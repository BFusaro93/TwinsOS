import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, jsonServerError } from "@/lib/api/route-helpers";
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

  if (error) return jsonServerError("GET /api/v1/projects/[id]", error);
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

  if (body.clientId !== undefined) {
    const { data: client } = await db.from("clients").select("org_id").eq("id", body.clientId).maybeSingle();
    if (!client || client.org_id !== auth.orgId) return jsonError("Client not found", 404);
  }

  const { data, error } = await db
    .from("projects")
    .update({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.clientId !== undefined && { client_id: body.clientId }),
      ...(body.customerName !== undefined && { customer_name: body.customerName }),
      ...(body.address !== undefined && { address: body.address }),
      ...(body.city !== undefined && { city: body.city }),
      ...(body.state !== undefined && { state: body.state }),
      ...(body.zip !== undefined && { zip: body.zip }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.startDate !== undefined && { start_date: body.startDate }),
      ...(body.endDate !== undefined && { end_date: body.endDate }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.contractPriceCents !== undefined && { original_contract_price: body.contractPriceCents }),
      ...(body.estimatedCostCents !== undefined && { estimated_cost_cents: body.estimatedCostCents }),
      ...(body.laborHours !== undefined && { labor_hours: body.laborHours }),
      ...(body.budgetHours !== undefined && { budget_hours: body.budgetHours }),
      ...(body.laborRateCents !== undefined && { labor_rate_cents: body.laborRateCents }),
      ...(body.burdenedRateCents !== undefined && { burdened_rate_cents: body.burdenedRateCents }),
    })
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .select(PROJECT_SELECT)
    .maybeSingle();

  if (error) return jsonServerError("PATCH /api/v1/projects/[id]", error);
  if (!data) return jsonError("Project not found", 404);
  return NextResponse.json(shapeProject(data));
}
