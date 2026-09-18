import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";

const Body = z.union([
  z.object({ usedQty: z.number().nonnegative() }),
  z.object({ notUsed: z.literal(true) }),
]);

/**
 * POST /api/crm/crew/visits/:visitId/job-products/:jobProductId/use-materials
 * — crew records how much of a pre-planned material (crm_job_products) they
 * actually used on this job, which may differ from what office staff called
 * for (planned_qty, see supabase/migrations/
 * 20260918050000_crm_job_products_planned_qty.sql). Distinct from the ad-hoc
 * "Request Materials" flow, which creates a new requisition for something
 * not already planned.
 *
 * Only allowed from 'pending' — once a row has been recorded (used_no_invoice/
 * invoiced/not_used) it's final here; matches the existing qty-is-locked-
 * once-left-pending rule already enforced elsewhere for this table. A retry
 * of the exact same still-pending row is safe and idempotent (re-submitting
 * the same usedQty is a no-op update, and set_job_product_status is itself
 * idempotent against re-entering the same status) — only a genuinely
 * already-resolved row 409s.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ visitId: string; jobProductId: string }> }
) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId, jobProductId } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

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
  const { data: jobProduct, error: jpError } = await (supabase as any)
    .from("crm_job_products")
    .select("id, job_id, org_id, qty, status")
    .eq("id", jobProductId)
    .is("deleted_at", null)
    .maybeSingle();
  if (jpError) return NextResponse.json({ error: jpError.message }, { status: 500 });
  if (!jobProduct || jobProduct.job_id !== visit.job_id || jobProduct.org_id !== visit.org_id) {
    return NextResponse.json({ error: "Material not found on this job" }, { status: 404 });
  }
  if (jobProduct.status !== "pending") {
    return NextResponse.json(
      { error: "This material's usage was already recorded." },
      { status: 409 }
    );
  }

  if ("usedQty" in parsed.data && parsed.data.usedQty !== Number(jobProduct.qty)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from("crm_job_products")
      .update({ qty: parsed.data.usedQty })
      .eq("id", jobProductId)
      .eq("status", "pending"); // still-pending guard, race-safe with the check above
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const newStatus = "notUsed" in parsed.data ? "not_used" : "used_no_invoice";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: rpcError } = await (supabase as any).rpc("set_job_product_status", {
    p_job_product_id: jobProductId,
    p_new_status: newStatus,
  });
  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error: reloadError } = await (supabase as any)
    .from("crm_job_products")
    .select("id, product_name, planned_qty, qty, status")
    .eq("id", jobProductId)
    .single();
  if (reloadError) return NextResponse.json({ error: reloadError.message }, { status: 500 });

  return NextResponse.json({
    id: updated.id,
    productName: updated.product_name,
    plannedQty: updated.planned_qty != null ? Number(updated.planned_qty) : Number(updated.qty),
    qty: Number(updated.qty),
    status: updated.status,
  });
}
