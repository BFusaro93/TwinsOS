// Unit-of-measure helpers shared by the estimate grid, the public proposal
// page and the estimating engine.
//
// Production rates on a service are always expressed in **sq ft per man-hour**
// (see CRMService.productionRateSqftPerHr), so production-rate budgeting only
// makes sense when the line's quantity is itself an area in sq ft. Every other
// unit (visit, each, cuyd, lf, …) has to budget hours manually.

/** Units whose quantity can be divided by a sq ft/hr production rate. */
export const AREA_UNITS = new Set(["sqft"]);

export function isAreaUnit(unit: string | null | undefined): boolean {
  return !!unit && AREA_UNITS.has(unit);
}

/**
 * A production-rate line can auto-derive budgeted hours only when its qty is
 * an area. `hr` is exempt (qty IS the hours) — it never needs a production
 * rate and shouldn't be flagged as misconfigured.
 */
export function productionRateAppliesToUnit(unit: string | null | undefined): boolean {
  return isAreaUnit(unit);
}

export function needsProductionRateUnitWarning(
  budgetMethod: string | null | undefined,
  unit: string | null | undefined,
): boolean {
  return budgetMethod === "production_rate" && unit !== "hr" && !isAreaUnit(unit);
}

const UNIT_LABELS: Record<string, string> = {
  sqft: "sq ft",
  lf: "lin ft",
  cuyd: "cu yd",
  acres: "acres",
  hr: "hr",
  each: "each",
  lb: "lb",
  gal: "gal",
  visit: "visit",
};

/** Client-facing label for a stored unit code ("sqft" → "sq ft"). */
export function unitLabel(unit: string | null | undefined, fallback = "visit"): string {
  if (!unit) return fallback;
  return UNIT_LABELS[unit] ?? unit;
}
