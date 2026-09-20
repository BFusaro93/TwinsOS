import { NextResponse } from "next/server";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { isoInZone, todayInZone } from "@/lib/time/zone";

/**
 * GET /api/crm/crew/visits/:visitId/job-products — the materials office
 * staff already planned/called for on this visit's job (crm_job_products),
 * distinct from the ad-hoc "Request Materials" flow (.../requisitions
 * above), which creates a brand-new purchase requisition instead. This
 * route is read-only status: crew records actual usage via the sibling
 * POST .../job-products/:jobProductId/use-materials route, not here.
 *
 * crm_job_products is job-level by design — it has no visit_id, and that's
 * deliberate: the office calls for materials against the job, not against
 * one of its thirty weekly visits. The crew card, though, is a *today* view,
 * and showing every row the job has ever had made a mowing crew in week 12
 * scroll past eleven weeks of resolved mulch. So a resolved row is only
 * returned when it was resolved on this visit's own service date — i.e.
 * "what this crew recorded today" — while still-pending rows always show,
 * because those are genuinely outstanding work. See the `filter` below.
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
    .select("id, job_id, org_id, crew_id, scheduled_date")
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
    .select("id, product_name, planned_qty, qty, status, updated_at")
    .eq("job_id", visit.job_id as string)
    .is("deleted_at", null)
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // crm_job_products has no resolved-at column; updated_at is set by the
  // same write that moves the row out of 'pending', so it's the closest
  // thing to "when was this recorded". Compared in NY, matching every other
  // date boundary in this codebase (see isoNy).
  const timeZone = await getOrgTimeZone(supabase, visit.org_id as string);
  const serviceDate = (visit.scheduled_date as string | null) ?? todayInZone(timeZone);

  return NextResponse.json(
    (data ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((row: any) =>
        row.status === "pending"
        || (row.updated_at && isoInZone(new Date(row.updated_at as string), timeZone) === serviceDate)
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((row: any) => ({
        id: row.id,
        productName: row.product_name,
        plannedQty: row.planned_qty != null ? Number(row.planned_qty) : Number(row.qty),
        qty: Number(row.qty),
        status: row.status,
      }))
  );
}
