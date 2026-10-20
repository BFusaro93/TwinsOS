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

/** Sum of signed zone areas, optionally limited to one type; never below zero. */
export function sumZoneSqft(zones: PropertyZone[], type?: PropertyZone["type"]): number {
  const total = zones.reduce((s, z) => (type && z.type !== type ? s : s + zoneSignedSqft(z)), 0);
  return Math.max(0, Math.round(total));
}
