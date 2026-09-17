import type { ChemicalApplicationRate, ChemicalLookupItem } from "@/types/chemical-tracking";

// ── pure helpers ──────────────────────────────────────────────────────────────
// Extracted from use-chemical-tracking.ts (a "use client" hooks file) so
// server-side code (report compute functions, API routes) can reuse this math
// without pulling in react-query/browser-supabase-client module scope.

/**
 * Quantity to apply = (property's area value / rate's area basis) * rate's applied qty,
 * e.g. rate "1 oz per 1,000 sqft" against a 12,000 sqft property = 12 oz.
 * Not tiered like the Rate Matrix — chemical rates are a single ratio.
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

/** totalBase = chemicalAmountBase + (chemicalAmountBase * additiveBase / referenceBase). */
function calcTotalMixBase(chemicalAmountBase: number, referenceBase: number, additiveBase: number): number | null {
  if (referenceBase <= 0) return null;
  return chemicalAmountBase + chemicalAmountBase * (additiveBase / referenceBase);
}

/**
 * Total finished-mix-solution volume for a rate that's Mixed with Water or
 * Mixed with Products — e.g. "1.8 oz chemical per 1 gal water" applied to a
 * 16 oz chemicalAmount means the tech needs (16 / 1.8) * 1 gal of water,
 * plus the chemical itself, as finished spray solution. This is the number
 * a tech should be told to use ("43 gallons of mix"), not the raw
 * chemicalAmount ("16 oz of active").
 *
 * mixType 'product' is computed with the same ratio math as 'water',
 * substituting the second catalog product's amount/total fields for the
 * dilution chemical/water fields — the schema was built as a direct mirror
 * of the water-dilution shape (see 20260724021814_chemical_application_rate_mixing.sql),
 * so "mixProductAmountQty per mixProductTotalQty" is read the same way as
 * "dilutionChemicalQty per dilutionWaterQty". No live rate row used mixType
 * 'product' at the time this was written, so this reading is unverified
 * against real data — confirm it against the first real 'product' rate an
 * org configures, and adjust here if their intent turns out to differ.
 *
 * Returns null whenever it can't compute (mixType is 'none', the relevant
 * fields are incomplete, or any unit involved lacks conversion metadata —
 * e.g. a custom org-renamed unit with no baseFactor).
 */
export function calcMixVolume(
  rate: ChemicalApplicationRate,
  chemicalAmount: number,
  unitsById: Map<string, ChemicalLookupItem>
): { solutionAmount: number; solutionUnitOfMeasureId: string } | null {
  if (!rate.unitOfMeasureId) return null;
  const chemicalUnit = unitsById.get(rate.unitOfMeasureId);
  if (!convertibleVolumeUnit(chemicalUnit)) return null;
  const chemicalAmountBase = chemicalAmount * chemicalUnit.baseFactor;

  let totalBase: number | null = null;
  if (
    rate.mixType === "water" &&
    rate.dilutionChemicalQty != null &&
    rate.dilutionWaterQty != null &&
    rate.dilutionChemicalUnitId &&
    rate.dilutionWaterUnitId
  ) {
    const referenceUnit = unitsById.get(rate.dilutionChemicalUnitId);
    const additiveUnit = unitsById.get(rate.dilutionWaterUnitId);
    if (convertibleVolumeUnit(referenceUnit) && convertibleVolumeUnit(additiveUnit)) {
      totalBase = calcTotalMixBase(
        chemicalAmountBase,
        rate.dilutionChemicalQty * referenceUnit.baseFactor,
        rate.dilutionWaterQty * additiveUnit.baseFactor
      );
    }
  } else if (
    rate.mixType === "product" &&
    rate.mixProductAmountQty != null &&
    rate.mixProductTotalQty != null &&
    rate.mixProductAmountUnitId &&
    rate.mixProductTotalUnitId
  ) {
    const referenceUnit = unitsById.get(rate.mixProductAmountUnitId);
    const additiveUnit = unitsById.get(rate.mixProductTotalUnitId);
    if (convertibleVolumeUnit(referenceUnit) && convertibleVolumeUnit(additiveUnit)) {
      totalBase = calcTotalMixBase(
        chemicalAmountBase,
        rate.mixProductAmountQty * referenceUnit.baseFactor,
        rate.mixProductTotalQty * additiveUnit.baseFactor
      );
    }
  }
  if (totalBase == null) return null;

  // Prefer displaying the total in Gallons (the natural unit for a finished
  // spray solution) when the org has one; otherwise fall back to whatever
  // unit the chemical amount itself was already in.
  const gallonsUnit = [...unitsById.values()].find(
    (u) => u.unitClass === "volume" && u.baseFactor != null && u.name.trim().toLowerCase() === "gallons"
  );
  const outputUnit = gallonsUnit ?? chemicalUnit;

  return {
    solutionAmount: totalBase / outputUnit.baseFactor!,
    solutionUnitOfMeasureId: outputUnit.id,
  };
}
