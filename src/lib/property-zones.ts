import type { PropertyZone } from "@/types/crm";

/** Area zones only — linear measurements (fence runs, perimeters) carry no square footage. */
export function isAreaZone(z: PropertyZone): boolean {
  return z.kind !== "linear";
}

/** Signed square footage a zone contributes to its type's total: subtract zones (e.g. the house cut out of a whole-lot turf trace) count negative. */
export function zoneSignedSqft(z: PropertyZone): number {
  if (!isAreaZone(z)) return 0;
  const sqft = z.sqft || 0;
  return z.mode === "subtract" ? -sqft : sqft;
}

export type LinearType = NonNullable<PropertyZone["linearType"]>;

export function isLinearZone(z: PropertyZone): boolean {
  return z.kind === "linear";
}

/** Total length (ft) of linear measurements, optionally limited to one type (untyped lines count as 'other'). */
export function sumLinearFt(zones: PropertyZone[], type?: LinearType): number {
  return Math.round(
    zones.reduce((s, z) => (!isLinearZone(z) || (type && (z.linearType ?? "other") !== type) ? s : s + (z.lengthFt || 0)), 0)
  );
}

/** Sum of signed zone areas, optionally limited to one type; never below zero. */
export function sumZoneSqft(zones: PropertyZone[], type?: PropertyZone["type"]): number {
  const total = zones.reduce((s, z) => (type && z.type !== type ? s : s + zoneSignedSqft(z)), 0);
  return Math.max(0, Math.round(total));
}

export type BuiltinTarget = "turf" | "mulch_bed" | "parking_lot" | "perimeter" | "edging";

const LINEAR_TARGETS: readonly BuiltinTarget[] = ["perimeter", "edging"];

/**
 * The built-in takeoff field (turf / mulch / parking lot / perimeter / edging) a zone feeds, or null if none.
 * A zone's type is its "counts toward" pick: turf, mulch_bed and parking_lot areas and perimeter / edging
 * lines feed the matching takeoff; 'other' feeds none (it still counts in the gross total).
 */
export function zoneBuiltinTarget(z: PropertyZone): BuiltinTarget | null {
  if (isLinearZone(z)) return z.linearType === "perimeter" || z.linearType === "edging" ? z.linearType : null;
  return z.type === "turf" || z.type === "mulch_bed" || z.type === "parking_lot" ? z.type : null;
}

/** Total feeding one built-in field: sq ft for area targets, ft for distance targets. */
export function sumBuiltinTarget(zones: PropertyZone[], target: BuiltinTarget): number {
  const matching = zones.filter((z) => zoneBuiltinTarget(z) === target);
  const total = LINEAR_TARGETS.includes(target)
    ? matching.reduce((s, z) => s + (z.lengthFt || 0), 0)
    : matching.reduce((s, z) => s + zoneSignedSqft(z), 0);
  return LINEAR_TARGETS.includes(target) ? Math.round(total) : Math.max(0, Math.round(total));
}

export function hasBuiltinTarget(zones: PropertyZone[], target: BuiltinTarget): boolean {
  return zones.some((z) => zoneBuiltinTarget(z) === target);
}
