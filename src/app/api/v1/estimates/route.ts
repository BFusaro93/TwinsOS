import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, jsonServerError, parsePagination } from "@/lib/api/route-helpers";
import { computeLineItem, getBreakevenRateCents, recalcEstimateTotals } from "@/lib/estimate-calc";
import { ESTIMATE_SELECT, ESTIMATE_LINE_ITEM_SELECT, shapeEstimate, shapeEstimateLineItem } from "./shape";
import { createEstimateSchema } from "./validation";

/**
 * GET /api/v1/estimates — list the org's estimates. Requires scope
 * "estimates:read".
 */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "estimates:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { limit, offset } = parsePagination(request.url);
  const { data, error } = await db
    .from("estimates")
    .select(ESTIMATE_SELECT)
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return jsonServerError("GET /api/v1/estimates", error);
  return NextResponse.json({ data: (data ?? []).map(shapeEstimate), limit, offset });
}

/**
 * POST /api/v1/estimates — creates a one-line estimate for an existing
 * client + catalog service. Requires scope "estimates:write:safe".
 *
 * This is deliberately narrow, not a general estimate builder: the caller
 * picks a client, a crm_services row, and a quantity — nothing else. Every
 * dollar figure (rate, cost, margin, subtotal, tax, total) is computed by
 * the exact same computeLineItem()/recalcEstimateTotals() functions the
 * app's own NewEstimateDialog/EstimateLineItemsGrid use
 * (src/lib/estimate-calc.ts), run here with the org's real service catalog
 * and overhead/labor-rate settings — never taken from the request body.
 * That's what makes this safe to expose where a raw insert wouldn't be: an
 * agent can request "quote this client for aeration" but can't set the
 * price. Multi-line estimates, discounts, tiers, and milestones still
 * require the app itself.
 */
export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "estimates:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = createEstimateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  const { data: client } = await db.from("clients").select("org_id").eq("id", body.clientId).maybeSingle();
  if (!client || client.org_id !== auth.orgId) return jsonError("Client not found", 404);

  const { data: service } = await db
    .from("crm_services")
    .select("org_id, name, unit, default_rate_cents, production_rate_sqft_per_hr, budget_method, is_active")
    .eq("id", body.serviceId)
    .maybeSingle();
  if (!service || service.org_id !== auth.orgId) return jsonError("Service not found", 404);
  if (!service.is_active) return jsonError("Service is not active", 400);

  const { data: org } = await db.from("organizations").select("customizations").eq("id", auth.orgId).maybeSingle();
  const breakevenRateCents = getBreakevenRateCents(org?.customizations as Record<string, unknown> | null);

  const { data: overheadRow } = await db
    .from("crm_overhead_settings")
    .select("flat_overhead_rate_bps")
    .eq("org_id", auth.orgId)
    .maybeSingle();

  const { data: estimate, error: estimateError } = await db
    .from("estimates")
    .insert({
      org_id: auth.orgId,
      client_id: body.clientId,
      description: body.description ?? service.name,
      estimate_date: body.estimateDate ?? new Date().toISOString().slice(0, 10),
      valid_until_date: body.validUntilDate ?? null,
      stage: "draft",
      overhead_rate_bps: overheadRow?.flat_overhead_rate_bps ?? 0,
    })
    .select(ESTIMATE_SELECT)
    .single();

  if (estimateError || !estimate) return jsonServerError("POST /api/v1/estimates (header insert)", estimateError);

  const visits = body.visits ?? 1;
  const computed = computeLineItem(
    {
      calcType: 1,
      qty: body.qty,
      rateCents: service.default_rate_cents ?? 0,
      visits,
      budgetedHours: 0,
      costCents: 0,
      adjRateCents: null,
      unitType: service.unit,
      productionRateSqftPerHr: service.production_rate_sqft_per_hr,
      budgetMethod: service.budget_method as "manual" | "production_rate",
    },
    breakevenRateCents
  );

  const { error: lineItemError } = await db.from("estimate_line_items").insert({
    org_id: auth.orgId,
    estimate_id: estimate.id,
    service_id: body.serviceId,
    service_name: service.name,
    status: "quote",
    calc_type: 1,
    qty: body.qty,
    unit_type: service.unit,
    production_rate_sqft_per_hr: service.production_rate_sqft_per_hr,
    budget_method: service.budget_method,
    rate_cents: service.default_rate_cents ?? 0,
    visits,
    cost_cents: computed.costCents,
    adj_rate_cents: null,
    sort_order: 0,
    total_cents: computed.totalCents,
    budgeted_hours: computed.budgetedHours,
    total_budgeted_hours: computed.totalBudgetedHours,
    total_cost_cents: computed.totalCostCents,
    margin_bps: computed.marginBps,
    markup_bps: computed.markupBps,
  });

  if (lineItemError) {
    // Line item failed after the header was committed — delete the
    // just-created draft estimate (hard delete: it's a fresh row with no
    // dependents yet) so it doesn't leak an orphaned empty draft.
    await db.from("estimates").delete().eq("id", estimate.id);
    return jsonServerError("POST /api/v1/estimates (line item insert)", lineItemError);
  }

  await recalcEstimateTotals(db, estimate.id);

  await db.from("client_activity").insert({
    org_id: auth.orgId,
    client_id: body.clientId,
    activity_type: "estimate",
    subject: `Estimate created: ${estimate.description}`,
    ref_id: estimate.id,
    ref_table: "estimates",
  });

  const { data: finalEstimate } = await db
    .from("estimates")
    .select(ESTIMATE_SELECT)
    .eq("id", estimate.id)
    .single();
  const { data: lineItems } = await db
    .from("estimate_line_items")
    .select(ESTIMATE_LINE_ITEM_SELECT)
    .eq("estimate_id", estimate.id);

  return NextResponse.json(
    { ...shapeEstimate(finalEstimate ?? estimate), lineItems: (lineItems ?? []).map(shapeEstimateLineItem) },
    { status: 201 }
  );
}
