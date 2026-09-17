import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, jsonServerError, parsePagination } from "@/lib/api/route-helpers";
import { CONTRACT_SELECT, shapeContract } from "./shape";
import { createContractSchema, type CreateContractItem } from "./validation";

/** GET /api/v1/contracts — list the org's contracts. Requires scope "contracts:read". */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "contracts:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { limit, offset } = parsePagination(request.url);
  const { data, error } = await db
    .from("crm_contracts")
    .select(CONTRACT_SELECT)
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return jsonServerError("GET /api/v1/contracts", error);
  return NextResponse.json({ data: (data ?? []).map(shapeContract), limit, offset });
}

/**
 * POST /api/v1/contracts — records one or more already-executed contracts
 * for billing. Requires scope "contracts:write:safe". See validation.ts for
 * why this can set a historical signedAt/signedBy and a non-"draft" initial
 * status, unlike the app's own contract-creation UI.
 */
export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "contracts:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = createContractSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  let items: CreateContractItem[];
  if (body.contracts) {
    items = body.contracts;
  } else {
    if (!body.clientId || !body.title) return jsonError("clientId and title are required", 400);
    items = [
      {
        clientId: body.clientId,
        title: body.title,
        estimateId: body.estimateId,
        startDate: body.startDate,
        endDate: body.endDate,
        monthlyAmountCents: body.monthlyAmountCents,
        billingFrequency: body.billingFrequency,
        autoRenew: body.autoRenew,
        notes: body.notes,
        status: body.status,
        signedAt: body.signedAt,
        signedBy: body.signedBy,
      },
    ];
  }

  const clientIds = [...new Set(items.map((c) => c.clientId))];
  const { data: clients } = await db.from("clients").select("id, org_id").in("id", clientIds);
  const clientOrgs = new Map((clients ?? []).map((c) => [c.id as string, c.org_id as string]));
  for (const id of clientIds) {
    if (clientOrgs.get(id) !== auth.orgId) return jsonError(`Client ${id} not found`, 404);
  }

  const estimateIds = [...new Set(items.map((c) => c.estimateId).filter((id): id is string => !!id))];
  const estimateOrgs = new Map<string, string>();
  if (estimateIds.length > 0) {
    const { data: estimates } = await db.from("estimates").select("id, org_id").in("id", estimateIds);
    for (const e of estimates ?? []) estimateOrgs.set(e.id as string, e.org_id as string);
  }
  for (const c of items) {
    if (c.estimateId && estimateOrgs.get(c.estimateId) !== auth.orgId) {
      return jsonError(`Estimate ${c.estimateId} not found`, 404);
    }
  }

  const rows = items.map((c) => ({
    org_id: auth.orgId,
    client_id: c.clientId,
    title: c.title,
    estimate_id: c.estimateId ?? null,
    status: c.status ?? (c.signedAt ? "active" : "draft"),
    start_date: c.startDate ?? null,
    end_date: c.endDate ?? null,
    monthly_amount_cents: c.monthlyAmountCents ?? 0,
    billing_frequency: c.billingFrequency ?? "monthly",
    auto_renew: c.autoRenew ?? false,
    notes: c.notes ?? null,
    signed_at: c.signedAt ?? null,
    signed_by: c.signedBy ?? null,
  }));

  const { data, error } = await db.from("crm_contracts").insert(rows).select(CONTRACT_SELECT);
  if (error || !data) return jsonServerError("POST /api/v1/contracts", error);

  const shaped = data.map(shapeContract);
  return NextResponse.json(body.contracts ? { data: shaped } : shaped[0], { status: 201 });
}
