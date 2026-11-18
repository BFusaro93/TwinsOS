import { NextResponse } from "next/server";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";
import { loadCrewProductInfo } from "@/lib/crew/product-info";

/**
 * GET ?visitIds=a,b — chemical applications for every visit in a stop, in one
 * call. Native counterpart of useVisitChemicals() (the web hook reads
 * crm_chemical_applications through the browser client, which a bearer-token
 * mobile client can't do), so the shape matches it field for field: it
 * carries `visitId`, `preloaded` and `confirmedAt`, which the single-visit
 * route (visits/:id/chemicals) omits and which the confirm-chemicals gate and
 * the skipped-service filter both depend on.
 */
export async function GET(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const visitIds = (new URL(request.url).searchParams.get("visitIds") ?? "")
    .split(",")
    .filter(Boolean)
    .slice(0, 50);
  if (visitIds.length === 0) return NextResponse.json([]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visits } = await (supabase as any)
    .from("crm_crew_job_visits")
    .select("id, org_id, crew_id, crew_unassigned, crm_jobs:crew_job(crew_id)")
    .in("id", visitIds)
    .is("deleted_at", null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const found = (visits ?? []) as any[];
  if (found.length !== visitIds.length) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }
  for (const visit of found) {
    if (!(await assertCallerOwnsVisit(supabase, user.id, visit.org_id, visit))) {
      return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_chemical_applications")
    .select(
      "id, visit_id, product_id, chemical_amount, unit_of_measure_id, solution_amount, used, application_rate_label, preloaded, confirmed_at, application_method_id, target_ids, areas_treated_ids, " +
      "unit:unit_of_measure_id(name), " +
      "solution_unit:solution_unit_of_measure_id(name)"
    )
    .in("visit_id", visitIds)
    .is("deleted_at", null)
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Product name / label fields come from the price-free crew RPC: a crew login
  // can't read product_items (20270109000210).
  let products: Awaited<ReturnType<typeof loadCrewProductInfo>>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    products = await loadCrewProductInfo(supabase, (data as any[]).map((row) => row.product_id));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not load products" }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json((data as any[]).map((row) => {
    const product = products.get(row.product_id);
    return {
      id: row.id,
      visitId: row.visit_id,
      productName: product?.name ?? null,
      used: row.used ?? true,
      chemicalAmount: row.chemical_amount,
      unitOfMeasureId: row.unit_of_measure_id ?? null,
      unitName: row.unit?.name ?? null,
      solutionAmount: row.solution_amount,
      solutionUnitName: row.solution_unit?.name ?? null,
      applicationRateLabel: row.application_rate_label,
      preloaded: row.preloaded === true,
      confirmedAt: row.confirmed_at ?? null,
      productId: row.product_id ?? null,
      epaNumber: product?.epa_registration_number ?? null,
      reEntryInterval: product?.re_entry_interval ?? null,
      labelInstructions: product?.label_instructions ?? null,
      restricted: product?.restricted_product === true,
      applicationMethodId: row.application_method_id ?? null,
      targetIds: row.target_ids ?? [],
      areasTreatedIds: row.areas_treated_ids ?? [],
    };
  }));
}
