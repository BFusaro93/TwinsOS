import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";
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
    .select("id, job_id, org_id, product_id, product_name, planned_qty, qty, status")
    .eq("id", jobProductId)
    .is("deleted_at", null)
    .maybeSingle();
  if (jpError) return NextResponse.json({ error: jpError.message }, { status: 500 });
  if (!jobProduct || jobProduct.job_id !== visit.job_id || jobProduct.org_id !== visit.org_id) {
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

  // ── write ─────────────────────────────────────────────────────────────────
  // The RPC reads qty off the row, so qty has to land first; the two writes
  // can't share a transaction from here. If the status change then fails, the
  // qty is rolled back to what it was, so a failed request never leaves a
  // pending row asserting a quantity nobody recorded.
  const qtyChanged = "usedQty" in parsed.data && parsed.data.usedQty !== previousQty;
  if (qtyChanged && "usedQty" in parsed.data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from("crm_job_products")
      .update({ qty: parsed.data.usedQty })
      .eq("id", jobProductId)
      .eq("status", "pending"); // still-pending guard, race-safe with the check above
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const newStatus = "notUsed" in parsed.data
    ? "not_used"
    : parsed.data.noInvoice
      ? "used_no_invoice"
      : "used";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: rpcError } = await (supabase as any).rpc("set_job_product_status", {
    p_job_product_id: jobProductId,
    p_new_status: newStatus,
  });
  if (rpcError) {
    if (qtyChanged) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: restoreError } = await (supabase as any)
        .from("crm_job_products")
        .update({ qty: previousQty })
        .eq("id", jobProductId)
        .eq("status", "pending");
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
  const { data: updated, error: reloadError } = await (supabase as any)
    .from("crm_job_products")
    .select("id, product_name, planned_qty, qty, status")
    .eq("id", jobProductId)
    .maybeSingle();
  if (reloadError) return NextResponse.json({ error: reloadError.message }, { status: 500 });

  return NextResponse.json(shapeMaterial(updated ?? jobProduct));
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
