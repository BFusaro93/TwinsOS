import type { EstimateLineItem } from "@/types/crm-estimates";

/**
 * Recompute all derived fields on a line item from its inputs.
 *
 * Aspire-style production rate engine:
 *   - If unitType is area/length-based AND productionRateSqftPerHr > 0:
 *       budgetedHours (per occurrence) = qty / productionRateSqftPerHr
 *   - If unitType === 'hr': budgetedHours = qty (direct hours)
 *   - Otherwise: budgetedHours is manually set (no override)
 *   - totalBudgetedHours = budgetedHours × visits
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
  > & {
    unitType?: string | null;
    productionRateSqftPerHr?: number | null;
  }
): Pick<
  EstimateLineItem,
  | "totalCents"
  | "totalBudgetedHours"
  | "totalCostCents"
  | "marginBps"
  | "markupBps"
> & { budgetedHours: number } {
  const effectiveRate = item.adjRateCents ?? item.rateCents;

  const totalCents =
    item.calcType === 1
      ? Math.round(item.qty * effectiveRate * item.visits)
      : effectiveRate; // fixed: total IS the rate

  // Auto-calculate budgeted hours from production rate (Aspire engine)
  let budgetedHours = item.budgetedHours;
  if (
    item.productionRateSqftPerHr &&
    item.productionRateSqftPerHr > 0 &&
    item.qty > 0 &&
    item.unitType !== "hr" &&
    item.unitType !== "each"
  ) {
    budgetedHours = item.qty / item.productionRateSqftPerHr;
  } else if (item.unitType === "hr" && item.qty > 0) {
    // Direct hours: budgeted hours = qty
    budgetedHours = item.qty;
  }

  const totalBudgetedHours = budgetedHours * item.visits;

  const totalCostCents =
    item.calcType === 1
      ? Math.round(item.costCents * item.qty * item.visits)
      : item.costCents;

  const marginBps =
    totalCents > 0
      ? Math.round(((totalCents - totalCostCents) / totalCents) * 10000)
      : 0;

  const markupBps =
    totalCostCents > 0
      ? Math.round(((totalCents - totalCostCents) / totalCostCents) * 10000)
      : 0;

  return { totalCents, budgetedHours, totalBudgetedHours, totalCostCents, marginBps, markupBps };
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
