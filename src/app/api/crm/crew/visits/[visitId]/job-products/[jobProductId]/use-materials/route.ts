import { NextResponse } from "next/server";
import { crewGroupVisitIds } from "@/lib/crew/crew-group-visits";
import { z } from "zod";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

const log = logger.child("crew/use-materials");

const Body = z.union([
  z.object({
    // Strictly positive: 0 is not "used none", it's "not used", and routing it
    // through this branch used to resolve the row with qty 0 — unbillable and
    // unreopenable — from the non-destructive button. Callers that mean zero
    // send { notUsed: true }.
    usedQty: z.number().positive().finite(),
    /**
     * "Used — don't bill". Default (absent/false) records `used`: inventory
     * decrements AND the quantity stays billable, which is what the office
     * calling for 10 bags of mulch expects to see on the invoice. Only this
     * flag produces `used_no_invoice`.
     */
    noInvoice: z.boolean().optional(),
  }),
  z.object({ notUsed: z.literal(true) }),
]);

// A crew honestly correcting 8 bags to 11 is routine; 8 to 800 is a fat
// finger on a decimal-pad, and it would decrement real inventory. Bound the
// correction against what the office actually called for, with an absolute
// floor so a planned qty of 1 isn't capped at 10.
const MAX_OVERAGE_MULTIPLE = 10;
const MAX_OVERAGE_ABSOLUTE = 50;

interface ProductRow {
  name: string;
  category: string | null;
  is_inventory: boolean | null;
  quantity_on_hand: number | null;
}

/**
 * POST /api/crm/crew/visits/:visitId/job-products/:jobProductId/use-materials
 * — crew records how much of a pre-planned material (crm_job_products) they
 * actually used on this job, which may differ from what office staff called
 * for (planned_qty, see supabase/migrations/
 * 20260918050000_crm_job_products_planned_qty.sql). Distinct from the ad-hoc
 * "Request Materials" flow, which creates a new requisition for something
 * not already planned.
 *
 * Three outcomes, all terminal for this row:
 *   used            — used, inventory decremented, STILL BILLABLE (the default)
 *   used_no_invoice — used, inventory decremented, deliberately not billed
 *   not_used        — not used at all, inventory untouched
 *
 * `used` rows are swept into the job's invoice by
 * buildPendingProductLineItems() in JobDetail.tsx; set_job_product_status
 * counts `used` as a "used" status for its inventory logic, so the later
 * used -> invoiced transition does NOT decrement a second time.
 *
 * Snow jobs record per STORM: the job-level row is the plan for every storm,
 * and each storm visit gets its own usage record (see the snow branch below).
 *
 * Only allowed from 'pending' — once a row has been recorded it's final
 * here; matches the existing qty-is-locked-once-left-pending rule already
 * enforced elsewhere for this table. An already-resolved row 409s and
 * returns that row's current state, so a second crew (or a stale queued
 * retry) can see what was recorded rather than hitting a dead end.
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
    .select("id, job_id, org_id, crew_id, crew_unassigned, crew_group_id, crm_jobs:crew_job(crew_id)")
    .eq("id", visitId)
    .is("deleted_at", null)
    .maybeSingle();
  if (visitError) return NextResponse.json({ error: visitError.message }, { status: 500 });
  if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  if (!(await assertCallerOwnsVisit(supabase, user.id, visit.org_id, visit))) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
  }

  // crm_job_products carries the material's price and cost, so a crew login
  // can't read it directly (20261231000340). Visit ownership is proven above
  // and the row is checked against that visit's job below; only price-free
  // columns are read.
  const admin = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jobProduct, error: jpError } = await (admin as any)
    .from("crm_job_products")
    .select("id, job_id, org_id, product_id, product_name, planned_qty, qty, status, visit_id")
    .eq("id", jobProductId)
    .eq("org_id", visit.org_id as string)
    .is("deleted_at", null)
    .maybeSingle();
  if (jpError) return NextResponse.json({ error: jpError.message }, { status: 500 });
  // A per-visit row (recurring sub-item product) can only be recorded on its own stop — any
  // crew of a multi-crew stop, since the rows live on the lead visit.
  const stopVisitIds = jobProduct?.visit_id ? await crewGroupVisitIds(visit) : null;
  if (
    !jobProduct || jobProduct.job_id !== visit.job_id || jobProduct.org_id !== visit.org_id ||
    (jobProduct.visit_id && !stopVisitIds?.has(jobProduct.visit_id))
  ) {
    return NextResponse.json({ error: "Material not found on this job" }, { status: 404 });
  }
  if (jobProduct.status !== "pending") {
    // Carry the resolved row back so the caller can show what was actually
    // recorded (and by implication that there's nothing left to do here)
    // instead of a bare conflict with no way forward.
    return NextResponse.json(
      {
        error: `This material was already recorded (${shapeStatusLabel(jobProduct.status, Number(jobProduct.qty))}).`,
        material: shapeMaterial(jobProduct),
      },
      { status: 409 }
    );
  }

  const previousQty = Number(jobProduct.qty);

  // ── validate the quantity BEFORE touching anything ────────────────────────
  // adjust_product_item_quantity RAISES (it does not clamp) when the result
  // would go negative, and a maintenance_part trigger RAISES on a fractional
  // on-hand. Both used to surface as a 500 carrying the raw Postgres string,
  // which the offline sync engine reads as transient and retries five times
  // against a permanently failing condition — while the qty UPDATE below had
  // already committed, leaving Materials Needed treating the crew's number as
  // outstanding office demand. Everything that can be known up front is
  // checked here and answered with a 422 (non-retryable, human-readable).
  if ("usedQty" in parsed.data) {
    const usedQty = parsed.data.usedQty;
    const plannedQty = jobProduct.planned_qty != null ? Number(jobProduct.planned_qty) : previousQty;
    const maxQty = Math.max(plannedQty * MAX_OVERAGE_MULTIPLE, plannedQty + MAX_OVERAGE_ABSOLUTE);
    if (usedQty > maxQty) {
      return NextResponse.json(
        {
          error: `${usedQty} is far more than the ${plannedQty} called for. Check the amount, or ask the office to update this material.`,
        },
        { status: 422 }
      );
    }

    let product: ProductRow | null = null;
    if (jobProduct.product_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: productRow, error: productError } = await (supabase as any)
        .from("product_items")
        .select("name, category, is_inventory, quantity_on_hand")
        .eq("id", jobProduct.product_id)
        .eq("org_id", jobProduct.org_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (productError) return NextResponse.json({ error: productError.message }, { status: 500 });
      product = (productRow as ProductRow | null) ?? null;
    }

    if (product?.category === "maintenance_part" && !Number.isInteger(usedQty)) {
      return NextResponse.json(
        { error: `${product.name} is counted in whole units — enter a whole number.` },
        { status: 422 }
      );
    }

    if (product?.is_inventory) {
      const onHand = Number(product.quantity_on_hand ?? 0);
      if (usedQty > onHand) {
        return NextResponse.json(
          {
            error: `Only ${onHand} of ${product.name} is on hand, so ${usedQty} can't be recorded as used. Tell the office what you actually used.`,
          },
          { status: 422 }
        );
      }
    }
  }

  const newStatus = "notUsed" in parsed.data
    ? "not_used"
    : parsed.data.noInvoice
      ? "used_no_invoice"
      : "used";

  // ── snow: one record per storm ────────────────────────────────────────────
  // A snow job's job-level row is the per-storm plan ("10 bags each storm").
  // Each storm visit records its OWN usage as a per-visit copy of the plan row
  // (priced from it), the plan row stays pending for the next storm, and Snow
  // Invoicing bills each storm's usage on that storm's invoice. Recording on
  // the plan row itself would have been once per season.
  if (!jobProduct.visit_id && (await jobIsSnow(admin, visit.job_id as string))) {
    const recorded = await stormUsageRow(admin, visitId, jobProductId);
    if (recorded) {
      // A replayed / second tap for the same storm.
      return NextResponse.json(
        {
          error: `This material was already recorded for this storm (${shapeStatusLabel(recorded.status, Number(recorded.qty))}).`,
          material: shapeMaterial({ ...recorded, id: jobProductId }),
        },
        { status: 409 }
      );
    }
    // As the caller: the RPC re-checks the crew owns the visit, and the stock
    // adjustment and history name the crew login.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: stormError } = await (supabase as any).rpc("crew_record_storm_visit_product", {
      p_visit_id: visitId,
      p_template_id: jobProductId,
      p_status: newStatus,
      p_qty: "usedQty" in parsed.data ? parsed.data.usedQty : null,
    });
    if (stormError) {
      const code = (stormError as { code?: string }).code;
      if (code === "23505") {
        const row = await stormUsageRow(admin, visitId, jobProductId);
        return NextResponse.json(
          { error: "This material was already recorded for this storm.", ...(row ? { material: shapeMaterial({ ...row, id: jobProductId }) } : {}) },
          { status: 409 }
        );
      }
      // check_violation: a sentence written for the crew (already invoiced, no quantity).
      if (code === "23514") return NextResponse.json({ error: stormError.message }, { status: 422 });
      if (code === "P0002") return NextResponse.json({ error: "Material not found on this job" }, { status: 404 });
      if (code === "42501") return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
      log.error("crew_record_storm_visit_product failed", { visitId, jobProductId, error: stormError.message });
      return NextResponse.json({ error: "Couldn't record this material. Try again, or tell the office." }, { status: 500 });
    }
    const row = await stormUsageRow(admin, visitId, jobProductId);
    // Shown under the plan row's id: the crew's list keys this storm's record by it.
    return NextResponse.json(row ? shapeMaterial({ ...row, id: jobProductId }) : shapeMaterial(jobProduct));
  }

  // ── write ─────────────────────────────────────────────────────────────────
  // The RPC reads qty off the row, so qty has to land first; the two writes
  // can't share a transaction from here. If the status change then fails, the
  // qty is rolled back to what it was, so a failed request never leaves a
  // pending row asserting a quantity nobody recorded.
  const qtyChanged = "usedQty" in parsed.data && parsed.data.usedQty !== previousQty;
  if (qtyChanged && "usedQty" in parsed.data) {
    // crew_set_job_product_qty runs as the caller (the audit trail names the
    // crew) and only updates a still-pending row on the caller's crew's job —
    // the race guard the direct UPDATE used to carry.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any).rpc("crew_set_job_product_qty", {
      p_job_product_id: jobProductId,
      p_qty: parsed.data.usedQty,
    });
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: rpcError } = await (supabase as any).rpc("set_job_product_status", {
    p_job_product_id: jobProductId,
    p_new_status: newStatus,
  });
  if (rpcError) {
    if (qtyChanged) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: restoreError } = await (supabase as any).rpc("crew_set_job_product_qty", {
        p_job_product_id: jobProductId,
        p_qty: previousQty,
      });
      if (restoreError) {
        log.error("qty rollback failed after status change failed", {
          jobProductId, previousQty, error: restoreError.message,
        });
      }
    }
    // Never hand a raw Postgres string to a crew tablet. 500 so a genuinely
    // transient failure still retries — everything we can prove is permanent
    // was already answered with a 422 above.
    log.error("set_job_product_status failed", { jobProductId, newStatus, error: rpcError.message });
    return NextResponse.json(
      { error: "Couldn't record this material. Try again, or tell the office." },
      { status: 500 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error: reloadError } = await (admin as any)
    .from("crm_job_products")
    .select("id, product_name, planned_qty, qty, status")
    .eq("id", jobProductId)
    .maybeSingle();
  if (reloadError) return NextResponse.json({ error: reloadError.message }, { status: 500 });

  return NextResponse.json(shapeMaterial(updated ?? jobProduct));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

async function jobIsSnow(admin: AdminClient, jobId: string): Promise<boolean> {
  const { data } = await admin.from("crm_jobs").select("job_type").eq("id", jobId).maybeSingle();
  return (data?.job_type as string | undefined) === "snow";
}

/** This storm visit's own usage record of a snow plan row, if one was made. */
async function stormUsageRow(admin: AdminClient, visitId: string, templateId: string): Promise<JobProductRow | null> {
  const { data } = await admin
    .from("crm_job_products")
    .select("id, product_name, planned_qty, qty, status")
    .eq("visit_id", visitId)
    .eq("template_job_product_id", templateId)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as JobProductRow | null) ?? null;
}

interface JobProductRow {
  id: string;
  product_name: string;
  planned_qty: number | string | null;
  qty: number | string;
  status: string;
}

function shapeMaterial(row: JobProductRow) {
  return {
    id: row.id,
    productName: row.product_name,
    plannedQty: row.planned_qty != null ? Number(row.planned_qty) : Number(row.qty),
    qty: Number(row.qty),
    status: row.status,
  };
}

function shapeStatusLabel(status: string, qty: number): string {
  if (status === "not_used") return "not used";
  return `used: ${qty}`;
}
