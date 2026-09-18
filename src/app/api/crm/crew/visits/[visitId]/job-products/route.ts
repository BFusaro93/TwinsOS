import { NextResponse } from "next/server";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";

/**
 * GET /api/crm/crew/visits/:visitId/job-products — the materials office
 * staff already planned/called for on this visit's job (crm_job_products),
 * distinct from the ad-hoc "Request Materials" flow (.../requisitions
 * above), which creates a brand-new purchase requisition instead. This
 * route is read-only status: crew records actual usage via the sibling
 * POST .../job-products/:jobProductId/use-materials route, not here.
 *
 * crm_job_products RLS (has_crm_access()) already permits the 'crew' role
 * full read/write — unlike requisitions/purchase_orders, no admin-client
 * bypass is needed; the caller's own bearer-scoped session is enough.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visit, error: visitError } = await (supabase as any)
    .from("crm_job_visits")
    .select("id, job_id, org_id, crew_id")
    .eq("id", visitId)
    .is("deleted_at", null)
    .maybeSingle();
  if (visitError) return NextResponse.json({ error: visitError.message }, { status: 500 });
  if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  if (!(await assertCallerOwnsVisit(supabase, user.id, visit.org_id, visit.crew_id))) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_job_products")
    .select("id, product_name, planned_qty, qty, status")
    .eq("job_id", visit.job_id as string)
    .is("deleted_at", null)
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data ?? []).map((row: any) => ({
      id: row.id,
      productName: row.product_name,
      plannedQty: row.planned_qty != null ? Number(row.planned_qty) : Number(row.qty),
      qty: Number(row.qty),
      status: row.status,
    }))
  );
}
