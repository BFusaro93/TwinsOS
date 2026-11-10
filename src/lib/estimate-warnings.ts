import { bpsToPercent, centsToDisplay } from "@/lib/estimate-calc";

/**
 * Advisory warnings for one estimate line, shown under its sub-items/equipment.
 * Nothing here blocks saving — they flag entries that usually mean a pricing
 * mistake (double-counted labor, a line price that doesn't cover equipment,
 * labor sold below the company's breakeven rate).
 */
export interface LineWarningInput {
  /** The line's own price after its discount, before sub-items. */
  lineRevenueCents: number;
  /** Line price + sub-items, after the line discount. */
  rolledRevenueCents: number;
  /** Line cost + sub-item cost + equipment cost. */
  totalCostCents: number;
  /** What the equipment on the line is charged out at (equipment is never billed separately). */
  equipmentChargeCents: number;
  subitems: { name: string; type: "product" | "subservice"; productId: string | null; serviceId: string | null; rateCents: number }[];
  /** Hourly catalog services by id — only these have a rate comparable to the breakeven labor rate. */
  hourlyServiceIds: ReadonlySet<string>;
  breakevenRateCents: number | undefined;
}

export interface LineWarning {
  code: "equipment_uncovered" | "below_breakeven" | "duplicate_subitem" | "negative_margin";
  message: string;
}

export function computeLineWarnings(i: LineWarningInput): LineWarning[] {
  const out: LineWarning[] = [];

  if (i.equipmentChargeCents > 0 && i.lineRevenueCents < i.equipmentChargeCents) {
    out.push({
      code: "equipment_uncovered",
      message: `Line price ${centsToDisplay(i.lineRevenueCents)} is less than the ${centsToDisplay(i.equipmentChargeCents)} equipment charge. Equipment isn't billed separately, so raise the line Rate to cover it.`,
    });
  }

  if (i.breakevenRateCents) {
    for (const s of i.subitems) {
      if (s.type === "subservice" && s.serviceId && i.hourlyServiceIds.has(s.serviceId) && s.rateCents < i.breakevenRateCents) {
        out.push({
          code: "below_breakeven",
          message: `${s.name} is priced at ${centsToDisplay(s.rateCents)}/hr, below your ${centsToDisplay(i.breakevenRateCents)}/hr breakeven labor rate.`,
        });
      }
    }
  }

  // The same catalog product/service twice on one line is the usual shape of a
  // double-count (e.g. Labor entered once as a sub-item and again as another).
  const seen = new Map<string, string>();
  const dup = new Set<string>();
  for (const s of i.subitems) {
    const ref = s.serviceId ? `s:${s.serviceId}` : s.productId ? `p:${s.productId}` : null;
    if (!ref) continue;
    if (seen.has(ref)) dup.add(seen.get(ref)!);
    else seen.set(ref, s.name);
  }
  for (const name of dup) {
    out.push({ code: "duplicate_subitem", message: `${name} appears more than once under this line. Check that it isn't counted twice.` });
  }

  if (i.rolledRevenueCents > 0 && i.totalCostCents > i.rolledRevenueCents) {
    const bps = Math.round(((i.rolledRevenueCents - i.totalCostCents) / i.rolledRevenueCents) * 10000);
    out.push({
      code: "negative_margin",
      message: `Costs (${centsToDisplay(i.totalCostCents)}) exceed the price (${centsToDisplay(i.rolledRevenueCents)}), a ${bpsToPercent(bps)} margin.`,
    });
  }

  return out;
}
