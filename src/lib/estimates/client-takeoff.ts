// Resolves the client's measured area ("takeoff") that a production-rate
// service should default its quantity from.
//
// Takeoffs live in two places: the fixed measurement columns on `clients`
// (turf_sqft, mulch_bed_sqft, gross_sqft — shown on the client Details tab
// alongside custom fields) and, for orgs that model their own, numeric
// crm_custom_field_defs whose name mentions the area (e.g. "Turf Sq. Ft.").

export interface ClientTakeoff {
  turfSqft: number | null;
  mulchBedSqft: number | null;
  grossSqft: number | null;
  /** Numeric custom fields by lower-cased def name → value. */
  customNumeric: Record<string, number>;
}

const MULCH_RE = /\b(mulch|bed|beds|planting)\b/i;
const TURF_CUSTOM_RE = /turf/i;
const MULCH_CUSTOM_RE = /mulch|bed/i;
const GROSS_CUSTOM_RE = /gross|lot|total/i;

function firstPositive(...values: Array<number | null | undefined>): number | null {
  for (const v of values) if (typeof v === "number" && v > 0) return v;
  return null;
}

function customMatch(takeoff: ClientTakeoff, re: RegExp): number | null {
  for (const [name, value] of Object.entries(takeoff.customNumeric)) {
    if (re.test(name) && /sq|ft|area/i.test(name) && value > 0) return value;
  }
  return null;
}

/**
 * Pick the sq ft takeoff for a service. Bed/mulch services use the mulch-bed
 * area; everything else defaults to turf, then falls back to gross area.
 * Returns null when the client has no usable measurement.
 */
export function resolveTakeoffSqft(serviceName: string | null | undefined, takeoff: ClientTakeoff | null | undefined): number | null {
  if (!takeoff) return null;
  const isBedService = !!serviceName && MULCH_RE.test(serviceName);
  if (isBedService) {
    return firstPositive(takeoff.mulchBedSqft, customMatch(takeoff, MULCH_CUSTOM_RE));
  }
  return firstPositive(
    takeoff.turfSqft,
    customMatch(takeoff, TURF_CUSTOM_RE),
    takeoff.grossSqft,
    customMatch(takeoff, GROSS_CUSTOM_RE),
  );
}
