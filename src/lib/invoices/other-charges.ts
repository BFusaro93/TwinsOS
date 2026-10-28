/**
 * Working out the dollars for an Other Charge.
 *
 * A "percent" charge is a percentage of the invoice's service lines: each
 * line's own discount is netted out, other-charge lines are left out (a fuel
 * surcharge shouldn't be charged on a late fee), and the invoice-level
 * discount is not applied. The result is copied onto an ordinary line, so it
 * is a snapshot — it never re-floats if the invoice changes afterwards.
 */

export type OtherChargeType = "flat" | "percent";

export interface PricedOtherCharge {
  chargeType: OtherChargeType;
  amountCents: number;
  percentBps: number;
}

export function otherChargeBaseCents(
  lines: { totalCents: number; discountCents: number; isOtherCharge: boolean }[]
): number {
  const base = lines
    .filter((li) => !li.isOtherCharge)
    .reduce((sum, li) => sum + (li.totalCents - li.discountCents), 0);
  return Math.max(0, base);
}

export function resolveOtherChargeCents(charge: PricedOtherCharge, baseCents: number): number {
  if (charge.chargeType === "flat") return charge.amountCents;
  return Math.round((Math.max(0, baseCents) * charge.percentBps) / 10000);
}

/** 450 → "4.5%". */
export function formatPercentBps(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}

/** Percent-of-invoice charges say so on the printed line, e.g. "Fuel Surcharge (4.5%)". */
export function otherChargeLineDescription(
  charge: PricedOtherCharge & { name: string; description: string }
): string {
  const text = charge.description || charge.name;
  return charge.chargeType === "percent" ? `${text} (${formatPercentBps(charge.percentBps)})` : text;
}

/** Parses a typed percentage ("4.5") to basis points; null when it isn't a valid 0–1000% value. */
export function parsePercentToBps(raw: string): number | null {
  if (raw.trim() === "") return 0;
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1000) return null;
  return Math.round(n * 100);
}
