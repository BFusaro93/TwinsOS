import type { EstimateLineItem, DirectCostType } from "@/types/crm-estimates";
import type { CRMService } from "@/types/crm-jobs";
import type { OverheadSettings } from "@/lib/hooks/use-overhead-settings";

// Duplicated from use-overhead-settings.ts rather than imported — that module
// is "use client" and pulls in @tanstack/react-query + the browser Supabase
// client, neither of which belong in a server route's bundle. This is a
// zero-value literal, not logic, so keeping it in sync is a non-issue.
const OVERHEAD_SETTINGS_DEFAULTS: OverheadSettings = {
  id: null,
  laborOhBps: 0,
  laborBurdenBps: 0,
  contractOhBps: 0,
  equipmentOhBps: 0,
  materialsOhBps: 0,
  otherOhBps: 0,
  flatOverheadRateBps: 0,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOverheadSettingsRow(row: any): OverheadSettings {
  return {
    id: row.id,
    laborOhBps: row.labor_oh_bps ?? 0,
    laborBurdenBps: row.labor_burden_bps ?? 0,
    contractOhBps: row.contract_oh_bps ?? 0,
    equipmentOhBps: row.equipment_oh_bps ?? 0,
    materialsOhBps: row.materials_oh_bps ?? 0,
    otherOhBps: row.other_oh_bps ?? 0,
    flatOverheadRateBps: row.flat_overhead_rate_bps ?? 0,
  };
}

// Minimal structural type for a Supabase client — matches both the browser
// client (@/lib/supabase/client) and a service-role client
// (@supabase/supabase-js), so recalcEstimateTotals can run from either a
// "use client" hook or a server-only API route.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = { from: (table: string) => any };

/**
 * Reads the org's configured breakeven labor rate ($/hr, fully burdened —
 * wages + burden + non-billable uplift + fixed OH recovery) from org settings
 * customizations. Set via the Job Costing bid-rate calculator's "Set as
 * project rate" action (src/components/operations/JobCostingDashboard.tsx).
 */
export function getBreakevenRateCents(customizations: Record<string, unknown> | null | undefined): number | undefined {
  const v = customizations?.breakevenLaborRateCents;
  return typeof v === "number" && v > 0 ? v : undefined;
}

/**
 * Recompute all derived fields on a line item from its inputs.
 *
 * budgetMethod is the explicit, user-chosen toggle (set on the service, snapshotted
 * onto the line item) between the two supported budgeting styles:
 *   - 'manual'          (Service Autopilot style): budgetedHours is entered directly
 *                        and never overridden here — except unitType === 'hr', where
 *                        qty itself IS the hours (direct pass-through either way).
 *   - 'production_rate' (Aspire style): budgetedHours (per occurrence) is derived
 *                        from qty ÷ productionRateSqftPerHr.
 *   - totalBudgetedHours = budgetedHours × visits
 *
 * breakevenRateCents (optional) auto-fills costCents from budgetedHours × rate
 * whenever costCents is still 0 (the "never manually set" convention used
 * elsewhere on this type) — once a user types a real cost, further edits to
 * other fields won't clobber it.
 */
export function computeLineItem(
  item: Pick<
    EstimateLineItem,
    | "calcType"
    | "qty"
    | "rateCents"
    | "visits"
    | "budgetedHours"
    | "costCents"
    | "adjRateCents"
    | "budgetMethod"
  > & {
    unitType?: string | null;
    productionRateSqftPerHr?: number | null;
  },
  breakevenRateCents?: number
): Pick<
  EstimateLineItem,
  | "totalCents"
  | "totalBudgetedHours"
  | "costCents"
  | "totalCostCents"
  | "marginBps"
  | "markupBps"
> & { budgetedHours: number } {
  const effectiveRate = item.adjRateCents ?? item.rateCents;

  const totalCents =
    item.calcType === 1
      ? Math.round(item.qty * effectiveRate * item.visits)
      : effectiveRate; // fixed: total IS the rate

  // Auto-calculate budgeted hours from production rate (Aspire engine) — only
  // when the line item is explicitly set to that budget method.
  let budgetedHours = item.budgetedHours;
  if (item.unitType === "hr" && item.qty > 0) {
    // Direct hours: budgeted hours = qty, regardless of budget method
    budgetedHours = item.qty;
  } else if (
    item.budgetMethod === "production_rate" &&
    item.productionRateSqftPerHr &&
    item.productionRateSqftPerHr > 0 &&
    item.qty > 0 &&
    item.unitType !== "each"
  ) {
    budgetedHours = item.qty / item.productionRateSqftPerHr;
  }

  const totalBudgetedHours = budgetedHours * item.visits;

  // `costCents === 0` is this type's "never manually set" convention (see
  // this function's docstring) — costCents is left at 0 for as long as the
  // auto-fill is in control, and totalCostCents alone carries the derived
  // dollar amount. costCents used to get overwritten with a derived
  // per-unit rate here (perOccurrenceCostCents / qty) so the Cost column
  // had something to display — but that value then flowed back in as
  // `item.costCents` on the NEXT edit (any field, not just Cost itself),
  // no longer 0, so a further Qty/Budgeted-Hours change fell through to
  // the plain `costCents × qty × visits` branch below and multiplied an
  // already-divided-out total by qty A SECOND TIME. Concretely: 79 budgeted
  // hours at a $69.25/hr breakeven rate on a 325-unit line auto-filled to
  // $5,470.75 correctly, but bumping budgeted hours back to 80 immediately
  // after re-multiplied that $5,470.75 by 325 again into $1,777,993.75.
  // Keeping costCents pinned at 0 while auto mode is active makes every
  // subsequent edit re-derive fresh from budgetedHours × breakevenRateCents
  // instead of compounding a stale derived value — the caller is
  // responsible for computing a separate, display-only per-unit figure
  // (totalCostCents ÷ qty ÷ visits) if it wants to show one, without
  // feeding that back in as costCents.
  let totalCostCents: number;
  if (item.costCents === 0 && breakevenRateCents && budgetedHours > 0) {
    const perOccurrenceCostCents = Math.round(budgetedHours * breakevenRateCents);
    totalCostCents =
      item.calcType === 1 ? Math.round(perOccurrenceCostCents * item.visits) : perOccurrenceCostCents;
  } else {
    totalCostCents =
      item.calcType === 1 ? Math.round(item.costCents * item.qty * item.visits) : item.costCents;
  }
  const costCents = item.costCents;

  const marginBps =
    totalCents > 0
      ? Math.round(((totalCents - totalCostCents) / totalCents) * 10000)
      : 0;

  const markupBps =
    totalCostCents > 0
      ? Math.round(((totalCents - totalCostCents) / totalCostCents) * 10000)
      : 0;

  return { totalCents, budgetedHours, totalBudgetedHours, costCents, totalCostCents, marginBps, markupBps };
}

/**
 * Compute budgeted hours for a service added directly to a job (outside the
 * estimate pipeline — NewJobDialog, JobDetail's "add service" flow). Unlike
 * estimate line items, a job service row has no per-row unitType, so this
 * checks the service's own `unit` field instead.
 */
export function computeJobServiceBudgetedHours(
  service: Pick<CRMService, "budgetMethod" | "productionRateSqftPerHr" | "unit" | "defaultBHrs">,
  qty: number
): number {
  if (
    service.budgetMethod === "production_rate" &&
    service.productionRateSqftPerHr &&
    service.productionRateSqftPerHr > 0 &&
    service.unit !== "hour" &&
    qty > 0
  ) {
    return qty / service.productionRateSqftPerHr;
  }
  return service.defaultBHrs ?? 0;
}

/**
 * Budgeted hours to carry from an accepted estimate's line item into the new
 * job's crm_job_services row (per-occurrence, matching how budgeted_hours is
 * used everywhere else in the job/service/visit chain). `computeLineItem`
 * already keeps `budgetedHours` correct on every line-item edit, so this is
 * normally just a direct read — the production-rate recompute here is only a
 * defensive fallback for a stale/zero stored value, not the primary path.
 */
export function budgetedHoursFromLineItem(
  li: Pick<EstimateLineItem, "budgetedHours" | "budgetMethod" | "productionRateSqftPerHr" | "unitType" | "qty">
): number {
  if (li.budgetedHours > 0) return li.budgetedHours;
  if (
    li.budgetMethod === "production_rate" &&
    li.productionRateSqftPerHr &&
    li.productionRateSqftPerHr > 0 &&
    li.unitType !== "hr" &&
    li.qty > 0
  ) {
    return li.qty / li.productionRateSqftPerHr;
  }
  return 0;
}

/**
 * Maps a direct cost's cost_type to the matching org-level overhead bps
 * (crm_overhead_settings). 'labor' picks up both labor overhead and labor
 * burden. 'service' has no dedicated bucket in the settings table — treated
 * as 'other' rather than assumed equivalent to 'sub_contract'.
 */
export function overheadBpsForCostType(costType: DirectCostType, settings: OverheadSettings): number {
  switch (costType) {
    case "labor": return settings.laborOhBps + settings.laborBurdenBps;
    case "sub_contract": return settings.contractOhBps;
    case "product_material": return settings.materialsOhBps;
    case "asset_equipment": return settings.equipmentOhBps;
    case "service":
    case "other":
    default: return settings.otherOhBps;
  }
}

/** True if the org has configured any per-cost-type overhead percentage. */
export function hasPerTypeOverhead(settings: OverheadSettings): boolean {
  return (
    settings.laborOhBps > 0 ||
    settings.laborBurdenBps > 0 ||
    settings.contractOhBps > 0 ||
    settings.equipmentOhBps > 0 ||
    settings.materialsOhBps > 0 ||
    settings.otherOhBps > 0
  );
}

/** Overhead dollars for a single direct cost row, given its cost_type and total. */
export function computeDirectCostOverhead(
  costType: DirectCostType,
  totalCents: number,
  settings: OverheadSettings
): number {
  return Math.round((totalCents * overheadBpsForCostType(costType, settings)) / 10000);
}

/** Format basis points as a percentage string: 10000 bps → "100.0%" */
export function bpsToPercent(bps: number): string {
  return (bps / 100).toFixed(1) + "%";
}

/** Convert cents to a display string: 675000 → "6,750.00" */
export function centsToDisplay(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export interface InstallmentScheduleEntry {
  number: number;
  amountCents: number;
  dueDate: string; // YYYY-MM-DD
}

/**
 * Splits the balance due (total minus any deposit) into N equal monthly
 * installments starting one month after startDate, so the deposit (due at
 * signing) isn't counted as installment #1. Integer division leftover cents
 * are added to the final installment so the sum always equals the balance
 * exactly. Returns [] when numInstallments <= 1 (nothing to schedule).
 *
 * `dayOfMonth`, when given, fixes every installment to that day (e.g. always
 * the 1st, or always the 15th) instead of whichever day startDate falls on —
 * clamped to the last day of a shorter month (e.g. requesting the 31st in
 * February falls back to the 28th/29th).
 */
export function computeInstallmentSchedule(
  totalCents: number,
  depositRequiredCents: number,
  numInstallments: number,
  startDate: string,
  dayOfMonth?: number | null
): InstallmentScheduleEntry[] {
  if (numInstallments <= 1) return [];

  const balanceCents = Math.max(0, totalCents - depositRequiredCents);
  const baseAmount = Math.floor(balanceCents / numInstallments);
  const remainder = balanceCents - baseAmount * numInstallments;

  const start = new Date(startDate + "T00:00:00");

  return Array.from({ length: numInstallments }, (_, i) => {
    // Building the date directly from (year, targetMonthIndex, day) rather
    // than mutating a copy of `start` via .setMonth() avoids JS Date's
    // month-overflow rollover: with no dayOfMonth override, `due` still
    // carried start's original day-of-month (e.g. 31), and .setMonth()
    // silently rolls into the FOLLOWING month whenever the target month is
    // shorter (e.g. Jan 31 + 1 month landed on Mar 3, skipping February
    // entirely and leaving installments #1/#2 only ~28 days apart).
    const targetDay = dayOfMonth || start.getDate();
    const targetMonthIndex = start.getMonth() + i + 1;
    const daysInTargetMonth = new Date(start.getFullYear(), targetMonthIndex + 1, 0).getDate();
    const due = new Date(start.getFullYear(), targetMonthIndex, Math.min(targetDay, daysInTargetMonth));
    return {
      number: i + 1,
      amountCents: baseAmount + (i === numInstallments - 1 ? remainder : 0),
      dueDate: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`,
    };
  });
}

/**
 * Recomputes the estimate's subtotal/tax/total/profit rollups from the
 * currently-committed line items and direct costs (read fresh from the DB,
 * not from a caller's in-memory/cached estimate, which can be a render
 * behind the write that just happened) and persists them. Every mutation
 * that adds/edits/removes a line item or direct cost — and every flow that
 * marks line items won/lost (tiered proposal acceptance, portal accept) —
 * must call this so the parent row never goes stale.
 *
 * Line items with status 'lost' are excluded from every sum: once a line
 * item is marked lost (a rejected tier, an unchecked item on a partial
 * acceptance, or a manual "lost" mark during quoting), it no longer
 * represents money owed and shouldn't count toward the estimate's total.
 *
 * Takes an explicit Supabase client so it can run from a "use client" hook
 * (browser client) or a server-only API route (service-role client) alike.
 */
export async function recalcEstimateTotals(supabase: AnySupabaseClient, estimateId: string) {
  const { data: est, error: estError } = await supabase
    .from("estimates")
    .select("org_id, tax_rate_bps, overhead_rate_bps, discount_cents, discount_type, discount_value")
    .eq("id", estimateId)
    .single();
  if (estError) throw estError;

  const { data: lineItems, error: liError } = await supabase
    .from("estimate_line_items")
    .select("total_cents, discount_cents, total_cost_cents, total_budgeted_hours")
    .eq("estimate_id", estimateId)
    .neq("status", "lost")
    .is("deleted_at", null);
  if (liError) throw liError;

  const { data: directCosts, error: dcError } = await supabase
    .from("estimate_direct_costs")
    .select("total_cents, cost_type")
    .eq("estimate_id", estimateId);
  if (dcError) throw dcError;

  // Sub-items (estimate_line_item_subitems) are real priced Product/Subservice
  // rows a user attaches under a line item (their own rate/cost/qty/total, see
  // AddSubitemDialog) — not decorative notes. They have no estimate_id column
  // of their own, only line_item_id, so reach them through the parent line
  // item via an embedded filter. Excluded whenever the PARENT line item is
  // lost or soft-deleted, matching the line-item exclusion above; subitems
  // have no status of their own to filter on.
  const { data: subitems, error: siError } = await supabase
    .from("estimate_line_item_subitems")
    .select("total_cents, cost_cents, qty, estimate_line_items!inner(estimate_id, status, deleted_at)")
    .eq("estimate_line_items.estimate_id", estimateId)
    .neq("estimate_line_items.status", "lost")
    .is("estimate_line_items.deleted_at", null)
    .is("deleted_at", null);
  if (siError) throw siError;

  const { data: overheadRow } = await supabase
    .from("crm_overhead_settings")
    .select("*")
    .eq("org_id", est.org_id)
    .maybeSingle();
  const overheadSettings = overheadRow ? mapOverheadSettingsRow(overheadRow) : OVERHEAD_SETTINGS_DEFAULTS;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineItemSubtotalCents = (lineItems ?? []).reduce((s: number, li: any) => s + (li.total_cents - (li.discount_cents ?? 0)), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subitemRevenueCents = (subitems ?? []).reduce((s: number, si: any) => s + (si.total_cents ?? 0), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subitemCostCents = (subitems ?? []).reduce((s: number, si: any) => s + Math.round((si.cost_cents ?? 0) * (si.qty ?? 1)), 0);
  const subtotalCents = lineItemSubtotalCents + subitemRevenueCents;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalCostCents = (lineItems ?? []).reduce((s: number, li: any) => s + li.total_cost_cents, 0) + subitemCostCents;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const directTotal = (directCosts ?? []).reduce((s: number, dc: any) => s + dc.total_cents, 0);
  // A "percent" discount is a % of the subtotal at whatever it is NOW, not a
  // frozen dollar amount from whenever it was applied — re-derive it here so
  // it stays in sync every time line items change, instead of trusting the
  // stored discount_cents snapshot (which only `applyNamedDiscount` in
  // EstimateSummaryPanel writes, and only at the moment a discount is picked).
  const discountCents = est.discount_type === "percent"
    ? Math.round(subtotalCents * ((est.discount_value ?? 0) / 10000))
    : (est.discount_cents ?? 0);
  const revenueCents = subtotalCents - discountCents;
  const taxCents = Math.round((revenueCents * (est.tax_rate_bps ?? 0)) / 10000);
  const totalCents = revenueCents + taxCents;

  // Overhead must be based on the estimate's FULL cost base — line items'
  // own modeled cost (total_cost_cents) AND estimate_direct_costs rows —
  // not just one or the other. Previously the flat-rate branch only looked
  // at totalCostCents (line items) and ignored directTotal entirely, while
  // the per-type branch only looked at directCosts and ignored line items'
  // cost entirely: an estimate whose cost lives mostly in Direct Costs
  // (materials/subcontract/equipment entered there rather than modeled on
  // line items) showed a configured flat overhead rate (e.g. 15%) but $0
  // actual Overhead Cost and no gross→net deduction, since totalCostCents
  // alone was 0. Line items' cost has no cost_type of its own — it's
  // modeled/production-rate labor cost, so it's treated as 'labor' here,
  // matching how EstimateSummaryPanel's own cost-breakdown display already
  // buckets it (costByType.labor += line items' totalCostCents).
  const overheadCostCents = hasPerTypeOverhead(overheadSettings)
    ? (directCosts ?? []).reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sum: number, dc: any) => sum + computeDirectCostOverhead(dc.cost_type, dc.total_cents, overheadSettings),
        0
      ) + computeDirectCostOverhead("labor", totalCostCents, overheadSettings)
    : Math.round(((totalCostCents + directTotal) * (est.overhead_rate_bps ?? 0)) / 10000);

  const grossProfitCents = revenueCents - totalCostCents - directTotal;
  const netProfitCents = grossProfitCents - overheadCostCents;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalBudgetedHours = (lineItems ?? []).reduce((s: number, li: any) => s + Number(li.total_budgeted_hours ?? 0), 0);

  const { error: updError } = await supabase
    .from("estimates")
    .update({
      subtotal_cents: subtotalCents,
      discount_cents: discountCents,
      tax_cents: taxCents,
      total_cents: totalCents,
      revenue_cents: revenueCents,
      overhead_cost_cents: overheadCostCents,
      gross_profit_cents: grossProfitCents,
      net_profit_cents: netProfitCents,
      total_budgeted_hours: totalBudgetedHours,
    })
    .eq("id", estimateId);
  if (updError) throw updError;

  // estimate_milestones.amount_cents is a snapshot (the PDF and invoice
  // creation read it directly, without recomputing), so a percent-type
  // milestone's dollar amount goes stale the moment the estimate total
  // changes elsewhere — until that specific row happens to get re-saved.
  // Re-sync every still-pending percent milestone here so the snapshot
  // never drifts from the Payment Plan tab's live "% of total" display.
  // Invoiced milestones are left alone — their amount is a locked billing
  // record once actually billed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: milestones } = await supabase
    .from("estimate_milestones")
    .select("id, milestone_type, milestone_value, amount_cents")
    .eq("estimate_id", estimateId)
    .eq("status", "pending")
    .is("deleted_at", null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of (milestones ?? []) as any[]) {
    if (m.milestone_type !== "percent") continue;
    const newAmountCents = Math.round((totalCents * m.milestone_value) / 10000);
    if (newAmountCents !== m.amount_cents) {
      await supabase.from("estimate_milestones").update({ amount_cents: newAmountCents }).eq("id", m.id);
    }
  }
}
