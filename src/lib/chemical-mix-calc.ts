import type { ChemicalApplicationRate, ChemicalLookupItem } from "@/types/chemical-tracking";

// ── pure helpers ──────────────────────────────────────────────────────────────
// Extracted from use-chemical-tracking.ts (a "use client" hooks file) so
// server-side code (report compute functions, API routes) can reuse this math
// without pulling in react-query/browser-supabase-client module scope.

/**
 * Quantity to apply = (property's area value / rate's area basis) * rate's applied qty,
 * e.g. rate "1 oz per 1,000 sqft" against a 12,000 sqft property = 12 oz.
 * Not tiered like the Rate Matrix — chemical rates are a single ratio.
 *
 * NOTE: this is the raw "Applied X per area" number in whatever unit the
 * rate's own unitOfMeasureId is — it is NOT necessarily the concentrate
 * amount. See calcChemicalAndSolution for why that distinction matters and
 * how it's resolved; callers that just need "how much of the catalog
 * product will this job consume" (e.g. Materials Needed / Planned Chemical
 * Usage reports) can keep using this function directly, since that
 * question is about the product's own unit either way.
 */
export function calcAutoQuantity(rate: ChemicalApplicationRate, areaValue: number): number | null {
  if (!rate.areaQty || rate.rateQty == null) return null;
  return (areaValue / rate.areaQty) * rate.rateQty;
}

function convertibleVolumeUnit(
  u: ChemicalLookupItem | undefined
): u is ChemicalLookupItem & { baseFactor: number } {
  return !!u && u.unitClass === "volume" && u.baseFactor != null && u.baseFactor > 0;
}

/** Prefer Gallons (any of "gallon"/"gallons", case-insensitive) as the display
 * unit for a finished-mix volume; fall back to the given unit otherwise. */
function preferredDisplayUnit(
  unitsById: Map<string, ChemicalLookupItem>,
  fallback: ChemicalLookupItem & { baseFactor: number }
): ChemicalLookupItem & { baseFactor: number } {
  const gallonsUnit = [...unitsById.values()].find(
    (u) =>
      convertibleVolumeUnit(u) &&
      (u.name.trim().toLowerCase() === "gallon" || u.name.trim().toLowerCase() === "gallons")
  );
  return (gallonsUnit as (ChemicalLookupItem & { baseFactor: number }) | undefined) ?? fallback;
}

export interface ChemicalCalcResult {
  chemicalAmount: number;
  chemicalUnitOfMeasureId: string;
  /** null when the mix ratio can't be resolved — never a guessed number. */
  solutionAmount: number | null;
  solutionUnitOfMeasureId: string | null;
}

/**
 * The single entry point for "how much chemical, and how much finished mix,
 * does this job need" — replaces calling calcAutoQuantity and a standalone
 * mix-volume calc as two independent steps, because which one is the
 * "primary" number depends on how the office configured the rate.
 *
 * A real chemical label's "Applied X per area" rate is NOT consistently one
 * convention. Some rates state the pure concentrate/active-ingredient amount
 * (e.g. "1.1-1.8 fl oz per 1,000 sq ft" broadcast rate) — the tech dilutes
 * that concentrate up to a finished-mix volume, and dilutionWaterQty is an
 * ADDITIVE amount on top of it. Others state the already-finished spray
 * volume directly (e.g. "apply at 1 gallon per 1,000 sq ft" spot-treatment
 * rate, common on lawn-care product labels) — the dilution ratio here is a
 * RECIPE for how to make up that gallon (how much concentrate goes into a
 * gallon of finished mix), not something to add on top of it. Treating the
 * second case like the first was a real bug caught by testing real labels
 * (SpeedZone/Tenacity/TickKillz/Quinclorac all use the second convention):
 * it summed the finished-mix number with proportional "water" as if it were
 * concentrate, inflating a 12-gallon job to ~780 gallons.
 *
 * Resolution: compare the rate's own unitOfMeasureId to the two sides of the
 * dilution/mix ratio.
 * - If it matches the ADDITIVE side (dilutionWaterUnitId / mixProductTotalUnitId),
 *   the Applied quantity IS the finished mix — solutionAmount is that number
 *   directly, and chemicalAmount is derived by scaling DOWN through the
 *   ratio.
 * - If it matches the REFERENCE side (dilutionChemicalUnitId /
 *   mixProductAmountUnitId), the Applied quantity IS the concentrate —
 *   chemicalAmount is that number directly, and solutionAmount is derived by
 *   scaling UP (chemical + proportional additive).
 * - If it matches neither (or units aren't convertible), there's no reliable
 *   way to tell which convention was intended — return the raw Applied
 *   quantity as chemicalAmount and leave solutionAmount null rather than
 *   guess wrong.
 *
 * mixType 'product' is resolved the same way, substituting the second
 * catalog product's amount/total fields for the dilution chemical/water
 * fields — structurally mirrored, but still unverified against a real
 * 'product'-mixType rate (none existed at the time this was written).
 */
export function calcChemicalAndSolution(
  rate: ChemicalApplicationRate,
  areaValue: number,
  unitsById: Map<string, ChemicalLookupItem>
): ChemicalCalcResult | null {
  const appliedAmount = calcAutoQuantity(rate, areaValue);
  if (appliedAmount == null || !rate.unitOfMeasureId) return null;

  const unresolved: ChemicalCalcResult = {
    chemicalAmount: appliedAmount,
    chemicalUnitOfMeasureId: rate.unitOfMeasureId,
    solutionAmount: null,
    solutionUnitOfMeasureId: null,
  };

  const appliedUnit = unitsById.get(rate.unitOfMeasureId);
  if (!convertibleVolumeUnit(appliedUnit)) return unresolved;

  let referenceQty: number | null = null;
  let referenceUnitId: string | null = null;
  let additiveQty: number | null = null;
  let additiveUnitId: string | null = null;
  if (rate.mixType === "water") {
    referenceQty = rate.dilutionChemicalQty;
    referenceUnitId = rate.dilutionChemicalUnitId;
    additiveQty = rate.dilutionWaterQty;
    additiveUnitId = rate.dilutionWaterUnitId;
  } else if (rate.mixType === "product") {
    referenceQty = rate.mixProductAmountQty;
    referenceUnitId = rate.mixProductAmountUnitId;
    additiveQty = rate.mixProductTotalQty;
    additiveUnitId = rate.mixProductTotalUnitId;
  }
  if (referenceQty == null || additiveQty == null || !referenceUnitId || !additiveUnitId) {
    return unresolved;
  }

  const referenceUnit = unitsById.get(referenceUnitId);
  const additiveUnit = unitsById.get(additiveUnitId);
  if (!convertibleVolumeUnit(referenceUnit) || !convertibleVolumeUnit(additiveUnit)) return unresolved;

  const referenceBase = referenceQty * referenceUnit.baseFactor;
  const additiveBase = additiveQty * additiveUnit.baseFactor;
  if (referenceBase <= 0) return unresolved;

  const appliedBase = appliedAmount * appliedUnit.baseFactor;

  if (rate.unitOfMeasureId === additiveUnitId) {
    // Applied quantity IS the finished mix — derive the concentrate amount
    // as the chemical's share of that total.
    const chemicalBase = appliedBase * (referenceBase / (referenceBase + additiveBase));
    return {
      chemicalAmount: chemicalBase / referenceUnit.baseFactor,
      chemicalUnitOfMeasureId: referenceUnitId,
      solutionAmount: appliedAmount,
      solutionUnitOfMeasureId: rate.unitOfMeasureId,
    };
  }

  if (rate.unitOfMeasureId === referenceUnitId) {
    // Applied quantity IS the concentrate — add proportional diluent to get
    // the finished mix total.
    const totalBase = appliedBase + appliedBase * (additiveBase / referenceBase);
    const outputUnit = preferredDisplayUnit(unitsById, appliedUnit);
    return {
      chemicalAmount: appliedAmount,
      chemicalUnitOfMeasureId: rate.unitOfMeasureId,
      solutionAmount: totalBase / outputUnit.baseFactor,
      solutionUnitOfMeasureId: outputUnit.id,
    };
  }

  // Rate's own unit doesn't match either side of the recipe — can't tell
  // which convention was intended.
  return unresolved;
}
