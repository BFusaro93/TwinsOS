import { formatCurrency } from "@/lib/utils";
import type { SnowRateTier } from "@/lib/hooks/use-snow-rate-tiers";
import type { CRMJobVisit } from "@/types/crm-jobs";

export const INVOICE_TYPE_LABEL: Record<string, string> = {
  per_event: "Per Event",
  per_event_per_inch: "Per Event, Per Inch",
  per_push_per_inch: "Per Push",
  hourly: "Hourly",
};

/** Prices a storm's total depth against a job's configured tiers (e.g.
 *  0-3in flat $X, 3-6in flat $Y, ... 12+in $D/in) — the depth's tier is
 *  whichever one it falls within; the open-ended top tier (maxInches: null)
 *  bills ratePerInchCents × depth instead of a flat amount. */
export function priceWithTiers(depth: number, tiers: SnowRateTier[]): number | null {
  if (tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => a.minInches - b.minInches);
  for (const tier of sorted) {
    const withinBounded = tier.maxInches != null && depth >= tier.minInches && depth < tier.maxInches;
    const withinOpenEnded = tier.maxInches == null && depth >= tier.minInches;
    if (withinBounded) return tier.rateCents ?? 0;
    if (withinOpenEnded) return Math.round((tier.ratePerInchCents ?? 0) * depth);
  }
  // No tier's range contains this depth (below the lowest tier's minInches,
  // in a gap between tiers, or above the highest bounded tier with no
  // open-ended tier to catch the overflow) — null, not 0, so the caller's
  // `tiered ?? flatRateFallback` actually falls back instead of billing $0.
  return null;
}

/** The group's total charge for one storm event — computed once per group,
 *  not once per visit. per_event_per_inch uses the storm's total depth (the
 *  MAX across the group's visits, since depth doesn't accumulate per push
 *  within one storm), not each visit's own depth. */
export function computeGroupAmountCents(groupVisits: CRMJobVisit[], tiersByJobId?: Map<string, SnowRateTier[]>): number {
  const visit = groupVisits[0];
  const job = visit.job;
  const invoiceType = job?.invoiceType ?? "per_event";
  if (invoiceType === "per_event_per_inch") {
    const maxDepth = Math.max(...groupVisits.map((v) => v.snowDepthInches ?? 0));
    const tiers = job?.id ? tiersByJobId?.get(job.id) : undefined;
    const tiered = tiers?.length ? priceWithTiers(maxDepth, tiers) : null;
    return tiered ?? Math.round((job?.ratePerInchCents ?? 0) * maxDepth);
  }
  if (invoiceType === "per_push_per_inch") {
    return Math.round((job?.ratePerInchCents ?? 0) * (visit.snowDepthInches ?? 0));
  }
  if (invoiceType === "hourly") {
    return Math.round((visit.actualHours ?? 0) * (job?.rateCents ?? 0));
  }
  const serviceTotal = (job?.services ?? []).reduce((s, sv) => s + (sv.rateCents ?? 0) * (sv.qty ?? 1), 0);
  return visit.rateCents ?? job?.rateCents ?? serviceTotal;
}

/** Splits a group's total amount evenly across its visits (one invoice line
 *  item per visit either way, for idempotency-by-visit_id), assigning any
 *  leftover cent(s) to the first visits in the group so the sum always
 *  equals the group total exactly. */
export function splitGroupAmountByVisit(groupVisits: CRMJobVisit[], totalCents: number): Map<string, number> {
  const n = groupVisits.length;
  const base = Math.floor(totalCents / n);
  let remainder = totalCents - base * n;
  const result = new Map<string, number>();
  for (const v of groupVisits) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder--;
    result.set(v.id, base + extra);
  }
  return result;
}

export function describeAmount(visit: CRMJobVisit, groupSize: number, tiersByJobId?: Map<string, SnowRateTier[]>): string {
  const invoiceType = visit.job?.invoiceType ?? "per_event";
  const splitSuffix = groupSize > 1 ? ` (split ÷${groupSize})` : "";
  if (invoiceType === "per_event_per_inch") {
    const tiers = visit.job?.id ? tiersByJobId?.get(visit.job.id) : undefined;
    if (tiers?.length) return `event max depth via rate tiers${splitSuffix}`;
    return `event max depth × ${formatCurrency(visit.job?.ratePerInchCents ?? 0)}/in${splitSuffix}`;
  }
  if (invoiceType === "per_push_per_inch") {
    return `${visit.snowDepthInches ?? 0}" × ${formatCurrency(visit.job?.ratePerInchCents ?? 0)}/in`;
  }
  if (invoiceType === "hourly") {
    return `${visit.actualHours ?? 0} hrs × ${formatCurrency(visit.job?.rateCents ?? 0)}/hr`;
  }
  return `${INVOICE_TYPE_LABEL[invoiceType] ?? "Per Event"}${splitSuffix}`;
}
