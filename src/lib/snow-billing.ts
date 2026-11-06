import { formatCurrency } from "@/lib/utils";
import type { SnowRateTier } from "@/lib/hooks/use-snow-rate-tiers";
import type { CRMJobVisit } from "@/types/crm-jobs";

export const INVOICE_TYPE_LABEL: Record<string, string> = {
  per_event: "Per Event",
  per_event_per_inch: "Per Event, Per Inch",
  per_push_per_inch: "Per Push",
  hourly: "Hourly",
};

/** Prices a depth against a job's configured tiers (e.g. 0-3in flat $X,
 *  3-6in flat $Y, ... 12+in $D/in). A tier covers min < depth <= max, so a
 *  boundary depth belongs to the LOWER range (exactly 3" on "0–3 / 3–6" is the
 *  first tier) and the first tier also covers a depth equal to its own min
 *  (e.g. 0). A depth that falls in a gap between ranges (a legacy "0–3 /
 *  3.01–6" setup and 3.005") also bills the lower range, while 3.01" there is
 *  still the upper range's own start. The open-ended top
 *  tier (maxInches: null) bills ratePerInchCents × depth instead of a flat
 *  amount. */
export function priceWithTiers(depth: number, tiers: SnowRateTier[]): number | null {
  if (tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => a.minInches - b.minInches);
  // The highest tier that starts below the depth — or that starts exactly AT
  // it when nothing below reaches that far (the first tier, or a tier after a
  // gap: "3.01–6" still owns 3.01").
  let index = -1;
  for (let i = 0; i < sorted.length; i++) {
    const prevMax = i > 0 ? sorted[i - 1].maxInches : null;
    const startsHere = depth === sorted[i].minInches && (i === 0 || (prevMax != null && prevMax < depth));
    if (sorted[i].minInches < depth || startsHere) index = i;
  }
  // No tier's range contains this depth (below the lowest tier's minInches,
  // or above the highest bounded tier with no open-ended tier to catch the
  // overflow) — null, not 0, so the caller's `tiered ?? flatRateFallback`
  // actually falls back instead of billing $0.
  if (index === -1) return null;
  const tier = sorted[index];
  if (tier.maxInches == null) return Math.round((tier.ratePerInchCents ?? 0) * depth);
  const isLast = index === sorted.length - 1;
  if (depth <= tier.maxInches || !isLast) return tier.rateCents ?? 0;
  return null;
}

/** Tier ranges must be contiguous: each range starts where the previous one
 *  ends ("0–3, 3–6, 6+"), with no gap or overlap, only the last range open-ended,
 *  and every bounded range ending above where it starts. Returns the problem as
 *  a sentence, or null when the ranges are valid. */
export function snowTierRangeProblem(tiers: { minInches: number; maxInches: number | null }[]): string | null {
  const sorted = [...tiers].sort((a, b) => a.minInches - b.minInches);
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    if (current.maxInches != null && current.maxInches <= current.minInches) {
      return `The ${current.minInches}–${current.maxInches}" range must end above where it starts.`;
    }
    const next = sorted[i + 1];
    if (!next) break;
    if (current.maxInches == null) {
      return `"${current.minInches}"+ is open-ended but isn't the last range — the range(s) after it can never apply.`;
    }
    if (next.minInches < current.maxInches) {
      return `The ${current.minInches}–${current.maxInches}" and ${next.minInches}" ranges overlap — start the next range at ${current.maxInches}".`;
    }
    if (next.minInches > current.maxInches) {
      return `There's a gap between ${current.maxInches}" and ${next.minInches}" — start the next range at ${current.maxInches}" (a depth exactly on a boundary bills the lower range).`;
    }
  }
  return null;
}

/** Hours ON SITE for an hourly-billed snow visit — billed once, whatever the
 *  crew size. visit.actualHours is man-hours for job costing (the crew-app
 *  clock-out stores Σ every member's punches), so it can't be billed as-is.
 *  Clock stamps give the on-site span directly: clocked out − clocked in −
 *  breaks. Without stamps (office Close Out, manual entry) actual hours are
 *  divided back by the men on the visit, since those paths store
 *  on-site hours × men. Rounded to the hundredth of an hour. */
export function snowBillableHours(visit: Pick<CRMJobVisit, "clockedInAt" | "clockedOutAt" | "breakMinutes" | "actualHours" | "menCount">): number {
  let hours: number;
  const inMs = visit.clockedInAt ? new Date(visit.clockedInAt).getTime() : NaN;
  const outMs = visit.clockedOutAt ? new Date(visit.clockedOutAt).getTime() : NaN;
  if (Number.isFinite(inMs) && Number.isFinite(outMs) && outMs > inMs) {
    hours = (outMs - inMs) / 3_600_000 - (visit.breakMinutes ?? 0) / 60;
  } else {
    hours = Number(visit.actualHours ?? 0) / Math.max(1, visit.menCount || 1);
  }
  return Math.max(0, Math.round(hours * 100) / 100);
}

/** A per-inch depth only counts once it was actually recorded — an unrecorded
 *  depth (null) or 0 leaves the visit unpriced ($0, flagged in the queue for a
 *  depth) rather than billing the bottom range. */
function recordedDepth(v: CRMJobVisit): number | null {
  return v.snowDepthInches != null && v.snowDepthInches > 0 ? v.snowDepthInches : null;
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
    const depths = groupVisits.map(recordedDepth).filter((d): d is number => d != null);
    if (depths.length === 0) return 0;
    const maxDepth = Math.max(...depths);
    const tiers = job?.id ? tiersByJobId?.get(job.id) : undefined;
    const tiered = tiers?.length ? priceWithTiers(maxDepth, tiers) : null;
    return tiered ?? Math.round((job?.ratePerInchCents ?? 0) * maxDepth);
  }
  if (invoiceType === "per_push_per_inch") {
    // Interval billing: each push is priced by ITS depth against the job's ranges, else flat per inch.
    const depth = recordedDepth(visit);
    if (depth == null) return 0;
    const tiers = job?.id ? tiersByJobId?.get(job.id) : undefined;
    const tiered = tiers?.length ? priceWithTiers(depth, tiers) : null;
    return tiered ?? Math.round((job?.ratePerInchCents ?? 0) * depth);
  }
  if (invoiceType === "hourly") {
    // Hours on site, once — not the crew's man-hours (see snowBillableHours).
    return Math.round(snowBillableHours(visit) * (job?.rateCents ?? 0));
  }
  // Rounded: a fractional qty (1050 × 0.333) must not put a non-integer into an integer cents column.
  const serviceTotal = Math.round((job?.services ?? []).reduce((s, sv) => s + (sv.rateCents ?? 0) * (sv.qty ?? 1), 0));
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
    const tiers = visit.job?.id ? tiersByJobId?.get(visit.job.id) : undefined;
    const pushLabel = (visit.pushNumber ?? 1) > 1 ? `push ${visit.pushNumber}: ` : "";
    if (visit.snowDepthInches == null) return `${pushLabel}no depth recorded`;
    if (tiers?.length) return `${pushLabel}${visit.snowDepthInches}" via rate ranges`;
    return `${pushLabel}${visit.snowDepthInches}" × ${formatCurrency(visit.job?.ratePerInchCents ?? 0)}/in`;
  }
  if (invoiceType === "hourly") {
    return `${snowBillableHours(visit)} hrs on site × ${formatCurrency(visit.job?.rateCents ?? 0)}/hr`;
  }
  return `${INVOICE_TYPE_LABEL[invoiceType] ?? "Per Event"}${splitSuffix}`;
}
