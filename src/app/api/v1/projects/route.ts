import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, jsonServerError, parsePagination } from "@/lib/api/route-helpers";
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

  if (error) return jsonServerError("GET /api/v1/projects", error);
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

  if (body.clientId) {
    const { data: client } = await db
      .from("clients")
      .select("org_id")
      .eq("id", body.clientId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!client || client.org_id !== auth.orgId) return jsonError("Client not found", 404);
  }

  const { data, error } = await db
    .from("projects")
    .insert({
      org_id: auth.orgId,
      name: body.name,
      client_id: body.clientId ?? null,
      customer_name: body.customerName ?? "",
      address: body.address ?? "",
      // city/state/zip/estimated_cost_cents are NOT NULL with ''/''/''/0
      // defaults on the projects table. An explicit NULL does NOT fall back
      // to a column default, so writing `?? null` here turned the minimal
      // payload `{ name }` — which the MCP create_projects tool sends — into
      // a 500. Fall back to the column's own default value instead.
      city: body.city ?? "",
      state: body.state ?? "",
      zip: body.zip ?? "",
      status: body.status ?? "scheduled",
      start_date: body.startDate ?? null,
      end_date: body.endDate ?? null,
      notes: body.notes ?? null,
      original_contract_price: body.contractPriceCents ?? 0,
      estimated_cost_cents: body.estimatedCostCents ?? 0,
      labor_hours: body.laborHours ?? null,
      budget_hours: body.budgetHours ?? null,
      labor_rate_cents: body.laborRateCents ?? null,
      burdened_rate_cents: body.burdenedRateCents ?? null,
    })
    .select(PROJECT_SELECT)
    .single();

  if (error || !data) return jsonServerError("POST /api/v1/projects", error);
  return NextResponse.json(shapeProject(data), { status: 201 });
}
