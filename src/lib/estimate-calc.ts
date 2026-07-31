import type { EstimateLineItem, DirectCostType } from "@/types/crm-estimates";
import type { CRMService } from "@/types/crm-jobs";
import type { OverheadSettings } from "@/lib/hooks/use-overhead-settings";

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

  let costCents = item.costCents;
  if (costCents === 0 && breakevenRateCents && budgetedHours > 0) {
    costCents = Math.round(budgetedHours * breakevenRateCents);
  }

  const totalBudgetedHours = budgetedHours * item.visits;

  const totalCostCents =
    item.calcType === 1
      ? Math.round(costCents * item.qty * item.visits)
      : costCents;

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
    const due = new Date(start);
    due.setMonth(due.getMonth() + i + 1);
    if (dayOfMonth) {
      const daysInMonth = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate();
      due.setDate(Math.min(dayOfMonth, daysInMonth));
    }
    return {
      number: i + 1,
      amountCents: baseAmount + (i === numInstallments - 1 ? remainder : 0),
      dueDate: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`,
    };
  });
}
