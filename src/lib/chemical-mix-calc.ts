import type { ChemicalApplicationRate, ChemicalLookupItem, ChemicalUnitClass } from "@/types/chemical-tracking";

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
 * amount, and therefore NOT necessarily "how much of the catalog product this
 * job consumes". A rate stated as a finished-spray volume ("1 gallon per
 * 1,000 sq ft") consumes only the concentrate share of that gallon. Callers
 * that need product consumption must go through calcChemicalAndSolution and
 * respect the unit it returns; this function alone is only safe when the
 * rate's own unit is already the product's unit, which is exactly the case
 * calcChemicalAndSolution signals by returning chemicalUnitOfMeasureId ===
 * rate.unitOfMeasureId.
 */
export function calcAutoQuantity(rate: ChemicalApplicationRate, areaValue: number): number | null {
  if (!rate.areaQty || rate.rateQty == null) return null;
  return (areaValue / rate.areaQty) * rate.rateQty;
}

/** A lookup row carrying enough metadata to convert within its own class. */
type ConvertibleUnit = ChemicalLookupItem & { unitClass: ChemicalUnitClass; baseFactor: number };

function convertibleUnit(u: ChemicalLookupItem | undefined): u is ConvertibleUnit {
  return !!u && (u.unitClass === "volume" || u.unitClass === "mass") && u.baseFactor != null && u.baseFactor > 0;
}

function convertibleVolumeUnit(u: ChemicalLookupItem | undefined): u is ConvertibleUnit & { unitClass: "volume" } {
  return convertibleUnit(u) && u.unitClass === "volume";
}

/**
 * Two lookup rows are the SAME unit when they measure the same physical class
 * at the same scale — an org can easily hold both "Ounces - Liquid" and
 * "Fluid Ounce" (two ids, one unit). Comparing ids would make a rate
 * configured with one and a dilution configured with the other match neither
 * branch of calcChemicalAndSolution and silently lose the mix calc, so the
 * comparison is on conversion metadata instead.
 *
 * baseFactor arrives from a Postgres numeric via JSON, so the two rows for one
 * unit can differ in the last float bit — compare with a relative epsilon
 * rather than ===. Distinct units are orders of magnitude apart (1 vs 8 vs
 * 128), so this can never collapse two genuinely different units.
 */
function sameUnit(a: ConvertibleUnit, b: ConvertibleUnit): boolean {
  if (a.unitClass !== b.unitClass) return false;
  return Math.abs(a.baseFactor - b.baseFactor) <= 1e-9 * Math.max(a.baseFactor, b.baseFactor);
}

/**
 * sameUnit() by lookup id, for callers (settings/rate UIs) that hold ids
 * rather than resolved rows. Two ids that are literally equal are the same
 * unit even when the row is missing conversion metadata.
 */
export function sameUnitById(
  aId: string | null | undefined,
  bId: string | null | undefined,
  unitsById: Map<string, ChemicalLookupItem>
): boolean {
  if (!aId || !bId) return false;
  if (aId === bId) return true;
  const a = unitsById.get(aId);
  const b = unitsById.get(bId);
  if (!convertibleUnit(a) || !convertibleUnit(b)) return false;
  return sameUnit(a, b);
}

/** Prefer Gallons (any of "gallon"/"gallons", case-insensitive) as the display
 * unit for a finished-mix volume; fall back to the given unit otherwise. */
function preferredDisplayUnit(
  unitsById: Map<string, ChemicalLookupItem>,
  fallback: ConvertibleUnit & { unitClass: "volume" }
): ConvertibleUnit & { unitClass: "volume" } {
  const gallonsUnit = [...unitsById.values()].find(
    (u) =>
      convertibleVolumeUnit(u) &&
      (u.name.trim().toLowerCase() === "gallon" || u.name.trim().toLowerCase() === "gallons")
  );
  return (gallonsUnit as (ConvertibleUnit & { unitClass: "volume" }) | undefined) ?? fallback;
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
 * Resolution: compare the rate's own unit to the two sides of the
 * dilution/mix ratio — by unit CLASS + SCALE, never by id, since one unit can
 * exist under two names/ids in the same org (see sameUnit).
 * - If it is the ADDITIVE side (dilutionWaterUnitId / mixProductTotalUnitId),
 *   the Applied quantity IS the finished mix — solutionAmount is that number
 *   directly, and chemicalAmount is derived by scaling DOWN through the
 *   ratio.
 * - If it is the REFERENCE side (dilutionChemicalUnitId /
 *   mixProductAmountUnitId), the Applied quantity IS the concentrate —
 *   chemicalAmount is that number directly, and solutionAmount is derived by
 *   scaling UP (chemical + proportional additive).
 * - If BOTH sides are the same unit, the rate's unit matches both and there is
 *   no way to tell which of the two conventions the office meant — a
 *   concentrate rate read as a finished-mix rate under-doses by the dilution
 *   factor (1:100 → 101x under-dose). That is a pesticide-label error, so this
 *   is an explicit unresolved, not a coin flip.
 * - If it matches neither (or units aren't convertible), there's likewise no
 *   reliable way to tell which convention was intended — return the raw
 *   Applied quantity as chemicalAmount and leave solutionAmount null rather
 *   than guess wrong.
 *
 * Mixed classes: a DRY concentrate (mass) stirred into a volume of water is a
 * legitimate, computable recipe — "1 lb per 100 gallons". The two amounts are
 * never converted into each other; each stays in its own class, and the
 * finished mix is denominated in the ADDITIVE side's class, with the solid
 * contributing no volume to it (a pound of WDG displaces a rounding error in
 * 100 gallons). The reverse — a liquid reference against a mass additive —
 * is not computable that way (the liquid's mass is not negligible), so it is
 * left unresolved.
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
  if (!convertibleUnit(appliedUnit)) return unresolved;

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
  if (!convertibleUnit(referenceUnit) || !convertibleUnit(additiveUnit)) return unresolved;

  // A mass concentrate into a volume additive is fine (see doc comment); the
  // reverse is not, because a liquid's contribution to a mass total is not
  // negligible and nothing here can weigh it.
  if (referenceUnit.unitClass !== additiveUnit.unitClass && referenceUnit.unitClass !== "mass") {
    return unresolved;
  }

  const referenceBase = referenceQty * referenceUnit.baseFactor;
  const additiveBase = additiveQty * additiveUnit.baseFactor;
  if (referenceBase <= 0 || additiveBase <= 0) return unresolved;

  // The finished mix is measured in the additive side's class. Same class =>
  // the concentrate is part of that total; different class (dry into liquid)
  // => the solid adds no volume, so the total IS the additive.
  const sameClass = referenceUnit.unitClass === additiveUnit.unitClass;
  const recipeTotalBase = sameClass ? referenceBase + additiveBase : additiveBase;

  const appliedBase = appliedAmount * appliedUnit.baseFactor;
  const appliedIsAdditive = sameUnit(appliedUnit, additiveUnit);
  const appliedIsReference = sameUnit(appliedUnit, referenceUnit);

  if (appliedIsAdditive && appliedIsReference) {
    // Both sides of the ratio are the same unit, so the rate's own unit says
    // nothing about which convention was configured. Refuse rather than pick.
    return unresolved;
  }

  if (appliedIsAdditive) {
    // Applied quantity IS the finished mix — derive the concentrate amount as
    // the recipe's concentrate scaled to that much finished mix.
    const chemicalBase = referenceBase * (appliedBase / recipeTotalBase);
    return {
      chemicalAmount: chemicalBase / referenceUnit.baseFactor,
      chemicalUnitOfMeasureId: referenceUnitId,
      solutionAmount: appliedAmount,
      solutionUnitOfMeasureId: rate.unitOfMeasureId,
    };
  }

  if (appliedIsReference) {
    // Applied quantity IS the concentrate — scale the whole recipe by how much
    // concentrate this job needs to get the finished mix total.
    const totalBase = recipeTotalBase * (appliedBase / referenceBase);
    // The mix total is in the additive's class, which is where the output unit
    // has to come from — the applied unit is only a valid fallback when it is
    // in that same class (it isn't for a dry concentrate into water).
    const volumeFallback = convertibleVolumeUnit(appliedUnit) ? appliedUnit : additiveUnit;
    const outputUnit =
      additiveUnit.unitClass === "volume" && convertibleVolumeUnit(volumeFallback)
        ? preferredDisplayUnit(unitsById, volumeFallback)
        : additiveUnit;
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

/**
 * Restates `amount` from one unit into another, or returns null when that
 * can't be done honestly — the units are in different classes (no amount of
 * arithmetic turns grams into gallons), or either row is missing the
 * unitClass/baseFactor metadata the conversion needs.
 *
 * Callers use this to line a computed quantity up with a quantity that is
 * already denominated in a known unit (e.g. a product's on-hand stock).
 * Returning null rather than the raw number is the point: a silently
 * unconverted figure differenced against stock is what turns 2.8 gallons of
 * demand into a purchase order for 351.
 */
export function convertQuantity(
  amount: number,
  fromUnitId: string | null,
  toUnitId: string | null,
  unitsById: Map<string, ChemicalLookupItem>
): number | null {
  if (!fromUnitId || !toUnitId) return null;
  if (fromUnitId === toUnitId) return amount;
  const from = unitsById.get(fromUnitId);
  const to = unitsById.get(toUnitId);
  if (!convertibleUnit(from) || !convertibleUnit(to)) return null;
  if (from.unitClass !== to.unitClass) return null;
  return (amount * from.baseFactor) / to.baseFactor;
}

// ── unit-aware aggregation ───────────────────────────────────────────────────

/** The outcome of summing several quantities that each carry their own unit. */
export interface QuantityTotal {
  /** null when the contributions could not be expressed as a single number. */
  amount: number | null;
  /** The unit `amount` is denominated in; null when unknown or mixed. */
  unitId: string | null;
  /** true when at least one contribution could not be combined with the rest. */
  mixedUnits: boolean;
}

export interface QuantityAccumulator {
  add: (amount: number, unitId: string | null) => void;
  total: () => QuantityTotal;
}

/**
 * Sums quantities that each carry their own unit, converting where the units
 * are genuinely interchangeable and refusing where they aren't.
 *
 * Reports aggregate one product across many visits, and those visits do NOT
 * all speak the same unit: an entered application record stores whatever unit
 * the office picked on that row, while an estimated one comes back in
 * whatever unit calcChemicalAndSolution resolved. Adding 2 Gallons to 3 Fluid
 * Ounces and printing the first unit seen ("5 Gallons") is a ~40x error on a
 * crew's load sheet, and which unit won depended on iteration order. So:
 * convert when the units share a class, and when they don't (or a unit is
 * unknown) report mixedUnits so the caller can say "can't compute" instead of
 * printing a number nobody can act on.
 */
export function createQuantityAccumulator(unitsById: Map<string, ChemicalLookupItem>): QuantityAccumulator {
  let baseTotal = 0;
  let displayUnitId: string | null = null;
  let displayFactor: number | null = null;
  let mixedUnits = false;
  let anchored = false;

  return {
    add(amount: number, unitId: string | null) {
      const unit = unitId ? unitsById.get(unitId) : undefined;

      // The first contribution fixes the unit everything else is reported in.
      if (!anchored) {
        anchored = true;
        displayUnitId = unitId;
        displayFactor = convertibleUnit(unit) ? unit.baseFactor : null;
        baseTotal = amount * (displayFactor ?? 1);
        return;
      }

      if (unitId === displayUnitId) {
        baseTotal += amount * (displayFactor ?? 1);
        return;
      }

      // Different id: only safe if both sides carry conversion metadata in the
      // same class — otherwise we have no idea what adding them would mean.
      const displayUnit = displayUnitId ? unitsById.get(displayUnitId) : undefined;
      if (convertibleUnit(unit) && convertibleUnit(displayUnit) && unit.unitClass === displayUnit.unitClass) {
        baseTotal += amount * unit.baseFactor;
        return;
      }
      mixedUnits = true;
    },
    total() {
      if (!anchored) return { amount: null, unitId: null, mixedUnits: false };
      if (mixedUnits) return { amount: null, unitId: null, mixedUnits: true };
      return { amount: baseTotal / (displayFactor ?? 1), unitId: displayUnitId, mixedUnits: false };
    },
  };
}
