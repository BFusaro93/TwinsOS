import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";
import { createServiceClient } from "@/lib/supabase/server";

const Body = z.object({ checked: z.boolean() });

/**
 * POST /api/crm/crew/visits/:visitId/subitems/:subitemId/check — the crew
 * ticks a sub-service ("Install edging") off on a visit, or un-ticks it.
 *
 * Writes through the service client after proving the caller's crew owns the
 * visit (crew accounts are read-only on the table itself), and only for a
 * sub-item that belongs to this visit's job. Idempotent both ways.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ visitId: string; subitemId: string }> }
) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId, subitemId } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visit } = await (supabase as any)
    .from("crm_job_visits")
    .select("id, job_id, org_id, crew_id, crew_unassigned, crm_jobs(crew_id)")
    .eq("id", visitId)
    .is("deleted_at", null)
    .single();
  if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  if (!(await assertCallerOwnsVisit(supabase, user.id, visit.org_id, visit))) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
  }

  const admin = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: subitem } = await (admin as any)
    .from("crm_job_service_subitems")
    .select("id, org_id, deleted_at, crm_job_services(job_id)")
    .eq("id", subitemId)
    .maybeSingle();
  const svc = Array.isArray(subitem?.crm_job_services) ? subitem.crm_job_services[0] : subitem?.crm_job_services;
  if (!subitem || subitem.deleted_at || subitem.org_id !== visit.org_id || svc?.job_id !== visit.job_id) {
    return NextResponse.json({ error: "Sub-item not found on this job" }, { status: 404 });
  }

  if (parsed.data.checked) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any)
      .from("crm_visit_subitem_checks")
      .upsert(
        { org_id: visit.org_id, visit_id: visitId, subitem_id: subitemId, checked_by: user.id, checked_at: new Date().toISOString() },
        { onConflict: "visit_id,subitem_id" }
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any)
      .from("crm_visit_subitem_checks")
      .delete()
      .eq("visit_id", visitId)
      .eq("subitem_id", subitemId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ visitId, subitemId, checked: parsed.data.checked });
}
