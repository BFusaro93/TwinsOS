import { NextResponse } from "next/server";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";

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
    .from("crm_job_visits")
    .select("id, org_id, crew_id, crew_unassigned, crm_jobs(crew_id)")
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
      "id, visit_id, chemical_amount, solution_amount, used, application_rate_label, preloaded, confirmed_at, " +
      "product:product_id(name), unit:unit_of_measure_id(name), " +
      "solution_unit:solution_unit_of_measure_id(name)"
    )
    .in("visit_id", visitIds)
    .is("deleted_at", null)
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json((data as any[]).map((row) => ({
    id: row.id,
    visitId: row.visit_id,
    productName: row.product?.name ?? null,
    used: row.used ?? true,
    chemicalAmount: row.chemical_amount,
    unitName: row.unit?.name ?? null,
    solutionAmount: row.solution_amount,
    solutionUnitName: row.solution_unit?.name ?? null,
    applicationRateLabel: row.application_rate_label,
    preloaded: row.preloaded === true,
    confirmedAt: row.confirmed_at ?? null,
  })));
}
