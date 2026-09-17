import { NextResponse } from "next/server";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";

/**
 * Read-only chemical mix info for a crew's visit — what product to use, how
 * much active ingredient, and (when computed) the total finished-mix
 * solution volume the tech should actually prepare. Crew never writes here;
 * office staff record/edit applications via ChemicalApplicationPanel.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visit } = await (supabase as any)
    .from("crm_job_visits")
    .select("org_id, crew_id")
    .eq("id", visitId)
    .is("deleted_at", null)
    .single();
  if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  if (!(await assertCallerOwnsVisit(supabase, user.id, visit.org_id, visit.crew_id))) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_chemical_applications")
    .select(
      "id, product_id, chemical_amount, solution_amount, used, application_rate_label, " +
      "product:product_id(name), " +
      "unit:unit_of_measure_id(name), " +
      "solution_unit:solution_unit_of_measure_id(name)"
    )
    .eq("visit_id", visitId)
    .is("deleted_at", null)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applications = (data as any[]).map((row) => ({
    id: row.id,
    productName: row.product?.name ?? null,
    used: row.used ?? true,
    chemicalAmount: row.chemical_amount,
    unitName: row.unit?.name ?? null,
    solutionAmount: row.solution_amount,
    solutionUnitName: row.solution_unit?.name ?? null,
    applicationRateLabel: row.application_rate_label,
  }));

  return NextResponse.json(applications);
}
