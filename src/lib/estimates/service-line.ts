import { isAreaUnit } from "@/lib/estimates/units";
import { resolveTakeoffSqft, type ClientTakeoff } from "@/lib/estimates/client-takeoff";
import { computeLineItem, type getBreakevenRateCents } from "@/lib/estimate-calc";
import { createClient } from "@/lib/supabase/client";
import { fetchFieldValueWithClientFallback } from "@/lib/chemical-area";
import { lookupRateMatrixMatch, applyMatrixTail, mapRateMatrixRow, type RateMatrixRow } from "@/lib/hooks/use-rate-matrix";
import { isQtyKeyedMatrix, qtyMatrixLinePatch } from "@/lib/estimates/qty-matrix";
import { isBlankRich } from "@/lib/utils/visit-note";
import { stripHtml } from "@/lib/utils/strip-html";
import type { BudgetMethod } from "@/types/crm-jobs";

/** One service (or package step) to price as an estimate line. */
export interface ServiceLineInput {
  name: string;
  id?: string;
  unit?: string;
  productionRate?: number | null;
  budgetMethod?: BudgetMethod;
  rateCents?: number | null;
  estimateDesc?: string | null;
  invoiceDesc?: string | null;
  visits?: number;
  packageId?: string | null;
  sortOrder?: number;
  budgetedHours?: number | null;
  lockRate?: boolean;
  minChargeCents?: number | null;
  minChargeMessage?: string | null;
}

/** What the pricing needs to know about the estimate it is pricing for. */
export interface ServiceLineContext {
  clientId?: string | null;
  propertyId?: string | null;
  /** The estimate's client/property measurements (turf sq ft etc.). */
  takeoff: ClientTakeoff | null;
  breakevenRateCents: ReturnType<typeof getBreakevenRateCents>;
  /** sort_order used when the input carries none. */
  defaultSortOrder: number;
}

/**
 * Prices one service as an estimate line (rate matrix, client takeoff, production rate,
 * minimum charge) and returns the line payload for useUpsertLineItem. Shared by the
 * estimate grid's Add Item / Add Package and by templates that contain packages, so a
 * package added from a template prices exactly like one added by hand.
 */
export async function priceServiceLine(svc: ServiceLineInput, ctx: ServiceLineContext): Promise<Record<string, unknown>> {
  const { clientId, propertyId, takeoff, breakevenRateCents } = ctx;
  const unit = svc.unit ?? null;
  const prodRate = svc.productionRate ?? null;
  let budgetMethod = svc.budgetMethod ?? "manual";

  // A production-rate service measured in sq ft starts from the client's
  // takeoff (e.g. Turf Sq. Ft.) so budgeted hours are real from the first
  // render, instead of qty 1 ÷ rate ≈ 0 hrs. Nothing is written to the client.
  const takeoffQty = budgetMethod === "production_rate" && isAreaUnit(unit)
    ? resolveTakeoffSqft(svc.name, takeoff)
    : null;
  // A package step's rate is a per-visit price (lockRate), not a per-sq-ft rate:
  // never multiply it by the client's takeoff.
  let qty = svc.lockRate ? 1 : (takeoffQty ?? 1);

  // Rate Matrix override: if this service has banded rows keyed off a
  // property custom field, and the estimate has a property with a value
  // for that field, the matched row's rate/hours/cost replace the flat
  // production_rate lookup entirely — snapshotted once at add-time (same
  // moment budgetMethod/productionRateSqftPerHr are normally snapshotted),
  // not re-resolved on every render. No property, no matrix rows, or no
  // value for the property → falls through to today's unchanged behavior.
  let calcType: 0 | 1 = 1;
  let effectiveRateCents = svc.rateCents ?? 0;
  const lineVisits = Math.max(1, Math.round(svc.visits ?? 1));
  let matrixBudgetedHours: number | null = svc.budgetedHours ?? null;
  let matrixCostCents: number | null = null;
  let matrixProductionRate: number | null = null;
  // A package step's own price (lockRate) is only the fallback: when the service
  // has Rate Matrix rows keyed off a property field (e.g. Turf Sq. Ft.) that the
  // estimate's property has a value for, the matched band prices the visit, so a
  // package honors custom fields the same as the service added on its own.
  // A matrix with no property field is keyed off the line's own quantity: price
  // the starting qty here, and the row re-prices as the qty is edited.
  if (svc.id && !svc.lockRate) {
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: qtyRows } = await (supabase as any)
      .from("crm_service_rate_matrix")
      .select("*")
      .eq("service_id", svc.id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true });
    const mappedQtyRows = ((qtyRows ?? []) as Record<string, unknown>[]).map(mapRateMatrixRow);
    if (isQtyKeyedMatrix(mappedQtyRows)) {
      const { data: tailSvc } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .from("crm_services")
        .select("matrix_tail_every_qty, matrix_tail_over_qty, matrix_tail_rate_cents, matrix_tail_hours, matrix_tail_cost_cents")
        .eq("id", svc.id)
        .maybeSingle();
      const patch = qtyMatrixLinePatch(mappedQtyRows, tailSvc ? {
        everyQty: Number(tailSvc.matrix_tail_every_qty ?? 0),
        overQty: Number(tailSvc.matrix_tail_over_qty ?? 0),
        rateCents: tailSvc.matrix_tail_rate_cents ?? 0,
        hours: Number(tailSvc.matrix_tail_hours ?? 0),
        costCents: tailSvc.matrix_tail_cost_cents ?? 0,
      } : null, qty, unit);
      if (patch) {
        calcType = patch.calcType;
        effectiveRateCents = patch.rateCents;
        matrixCostCents = patch.costCents;
        matrixBudgetedHours = patch.budgetedHours;
        matrixProductionRate = patch.productionRateSqftPerHr;
        budgetMethod = patch.budgetMethod;
      }
    }
  }
  if (svc.id && (propertyId || clientId)) {
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: matrixRows } = await (supabase as any)
      .from("crm_service_rate_matrix")
      .select("*")
      .eq("service_id", svc.id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true });
    const rows = (matrixRows ?? []) as Record<string, unknown>[];
    const customFieldId = rows[0]?.custom_field_id as string | undefined;
    // Read the property's value for the lookup field STRAIGHT FROM THE DB
    // rather than from the usePropertyCustomFieldValues cache. That cache is
    // a closure capture with no isLoading gate, so adding a service in the
    // first few hundred ms after the estimate opened found an empty array,
    // silently skipped the matrix and priced the line at the service's flat
    // rate — indistinguishable, once saved, from a genuinely matrix-priced
    // line. The matrix rows are already being fetched here on the same
    // round trip; one more point lookup removes the race entirely instead of
    // just narrowing it.
    // Property value first (custom value, then the property's own takeoff
    // column), then the client's value for the same field — so a number
    // entered once on the client prices every estimate without a property,
    // and a property can override it.
    const propertyValue: number | null = customFieldId
      ? await fetchFieldValueWithClientFallback(supabase, customFieldId, propertyId ?? null, clientId ?? null)
      : null;
    if (rows.length > 0 && propertyValue != null) {
      const mapped: RateMatrixRow[] = rows.map((r) => ({
        id: r.id as string,
        orgId: r.org_id as string,
        serviceId: r.service_id as string,
        customFieldId: r.custom_field_id as string,
        calcType: r.calc_type as 0 | 1,
        fromVal: Number(r.from_val ?? 0),
        toVal: r.to_val != null ? Number(r.to_val) : null,
        rateCents: (r.rate_cents as number) ?? 0,
        budgetedHours: Number(r.budgeted_hours ?? 0),
        budgetedCostCents: (r.budgeted_cost_cents as number) ?? 0,
        sortOrder: (r.sort_order as number) ?? 0,
        isTailRow: (r.is_tail_row as boolean) ?? false,
        tailEveryQty: r.tail_every_qty != null ? Number(r.tail_every_qty) : null,
        tailOverQty: r.tail_over_qty != null ? Number(r.tail_over_qty) : null,
      }));
      let match = lookupRateMatrixMatch(mapped, propertyValue);
      // Past the end of the bands: the service's overflow rule ("every Y over
      // X adds $R") takes over from a tail row or the flat rate.
      if (!match || match.isTailRow) {
        const { data: tailSvc } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
          .from("crm_services")
          .select("matrix_tail_every_qty, matrix_tail_over_qty, matrix_tail_rate_cents, matrix_tail_hours, matrix_tail_cost_cents")
          .eq("id", svc.id)
          .maybeSingle();
        if (tailSvc) {
          match = applyMatrixTail(mapped, propertyValue, {
            everyQty: Number(tailSvc.matrix_tail_every_qty ?? 0),
            overQty: Number(tailSvc.matrix_tail_over_qty ?? 0),
            rateCents: tailSvc.matrix_tail_rate_cents ?? 0,
            hours: Number(tailSvc.matrix_tail_hours ?? 0),
            costCents: tailSvc.matrix_tail_cost_cents ?? 0,
          }) ?? match;
        }
      }
      // A package step with its own price under a per-unit band: the visit's quantity is the
      // client's takeoff, else the very value the band was matched on. With no quantity at
      // all, keep the step's locked price rather than one unit of a per-sq-ft rate.
      let packageBandQty: number | null = null;
      if (match && svc.lockRate && match.calcType === 1) {
        packageBandQty = (isAreaUnit(unit) ? resolveTakeoffSqft(svc.name, takeoff) : null)
          ?? (propertyValue > 0 ? propertyValue : null);
        if (packageBandQty == null) match = null;
      }
      if (match) {
        calcType = match.calcType;
        effectiveRateCents = match.rateCents;
        matrixCostCents = match.budgetedCostCents;
        // A per-unit matrix row's rate and cost are both per-unit, so
        // computeLineItem's calcType formula rescales them for free when the
        // qty changes later. Its hours don't get that treatment under the
        // 'manual' budget method, which used to leave hours frozen at
        // `match.budgetedHours × the add-time qty` — change the qty
        // afterwards and price moved while hours didn't, quietly breaking
        // the line's $/man-hour.
        //
        // A per-unit matrix row on an area line is exactly a production rate
        // expressed the other way up (hours per sq ft vs sq ft per hour), so
        // express it that way and let the production_rate branch re-derive
        // hours from qty on every recompute. Fixed ($) matrix rows genuinely
        // shouldn't scale with qty, and a per-unit row on a non-area unit
        // can't be stated as a sq ft/hr production rate at all — both keep
        // the manual snapshot.
        // A per-unit band on an area line prices per sq ft, so a package visit
        // (qty forced to 1 above) needs the client's takeoff as its quantity.
        if (packageBandQty != null) qty = packageBandQty;
        if (match.calcType === 1 && match.budgetedHours > 0 && isAreaUnit(unit)) {
          matrixProductionRate = 1 / match.budgetedHours;
          budgetMethod = "production_rate";
        } else {
          matrixBudgetedHours = match.calcType === 1 ? match.budgetedHours * qty : match.budgetedHours;
          budgetMethod = "manual";
        }
      }
    }
  }

  // A package step's rate is its own per-visit price, so the service minimum
  // doesn't apply to it. Fixed matrix rows (calcType 0) ignore it inside computeLineItem.
  const minChargeCents = svc.lockRate ? 0 : (svc.minChargeCents ?? 0);
  const computed = computeLineItem({
    calcType,
    qty,
    rateCents: effectiveRateCents,
    minChargeCents,
    visits: lineVisits,
    budgetedHours: matrixBudgetedHours ?? 0, // derived from qty ÷ production rate (production_rate), a Rate Matrix match, or set manually
    costCents: matrixCostCents ?? 0,
    adjRateCents: null,
    unitType: unit,
    productionRateSqftPerHr: matrixProductionRate ?? prodRate,
    budgetMethod,
  }, breakevenRateCents);

  return {
    service_id: svc.id ?? null,
    service_name: svc.name,
    status: "quote",
    calc_type: calcType,
    qty,
    unit_type: unit,
    // Both are authored via a rich-text editor on the Service (Descriptions
    // tab). The estimate wording keeps its HTML (bullets, bold) — the
    // proposal, PDF, portal and the line's rich-text popover all render it.
    // The invoice wording is shown/edited as plain text (the Invoice
    // Description popover's textarea and the generated invoice line), so
    // strip HTML for that one at copy time.
    estimate_desc: svc.estimateDesc && !isBlankRich(svc.estimateDesc) ? svc.estimateDesc : null,
    invoice_desc: svc.invoiceDesc ? stripHtml(svc.invoiceDesc) || null : null,
    production_rate_sqft_per_hr: matrixProductionRate ?? prodRate,
    budget_method: budgetMethod,
    rate_cents: effectiveRateCents,
    min_charge_cents: minChargeCents,
    min_charge_message: minChargeCents > 0 ? (svc.minChargeMessage ?? null) : null,
    visits: lineVisits,
    package_id: svc.packageId ?? null,
    cost_cents: computed.costCents,
    adj_rate_cents: null,
    sort_order: svc.sortOrder ?? ctx.defaultSortOrder,
    total_cents: computed.totalCents,
    budgeted_hours: computed.budgetedHours,
    total_budgeted_hours: computed.totalBudgetedHours,
    total_cost_cents: computed.totalCostCents,
    margin_bps: computed.marginBps,
    markup_bps: computed.markupBps,
  };
}
