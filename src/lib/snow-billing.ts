import { formatCurrency } from "@/lib/utils";
import type { SnowRateTier } from "@/lib/hooks/use-snow-rate-tiers";
import type { CRMJobVisit } from "@/types/crm-jobs";
import { formatInZone } from "@/lib/time/zone";
import { capPartText, type SnowCapOverage } from "@/lib/snow-caps";

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
export function findSnowTier(depth: number, tiers: SnowRateTier[]): SnowRateTier | null {
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
  // overflow) — null, so the caller's `tiered ?? flatRateFallback` actually
  // falls back instead of billing $0.
  if (index === -1) return null;
  const tier = sorted[index];
  const isLast = index === sorted.length - 1;
  if (tier.maxInches != null && depth > tier.maxInches && isLast) return null;
  return tier;
}

/** Prices a depth against a job's configured tiers (e.g. 0-3in flat $X,
 *  3-6in flat $Y, ... 12+in $D/in, or an all-inclusive top range billed
 *  hourly). A tier covers min < depth <= max, so a boundary depth belongs to
 *  the LOWER range (exactly 3" on "0–3 / 3–6" is the first tier) and the first
 *  tier also covers a depth equal to its own min (e.g. 0). A depth that falls
 *  in a gap between ranges (a legacy "0–3 / 3.01–6" setup and 3.005") also
 *  bills the lower range, while 3.01" there is still the upper range's own
 *  start. The open-ended top flat tier (maxInches: null) bills
 *  ratePerInchCents × depth. A range billed "hourly" bills `billableHours` ×
 *  its hourly rate (rateCents) — the caller supplies the hours on site. */
export function priceWithTiers(depth: number, tiers: SnowRateTier[], billableHours = 0): number | null {
  const tier = findSnowTier(depth, tiers);
  if (!tier) return null;
  if (tier.billAs === "hourly") return Math.round(billableHours * (tier.rateCents ?? 0));
  if (tier.maxInches == null) return Math.round((tier.ratePerInchCents ?? 0) * depth);
  return tier.rateCents ?? 0;
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

/** A snow visit that is recorded but not billed on its own:
 *  - an extra crew on a multi-crew stop (crewGroupSecondary) — the lead visit
 *    carries the stop's charge. EXCEPT on Hourly jobs, where every truck bills
 *    its own hours on site;
 *  - push 2+ on a job billed once per storm (Per Event / Per Event Per Inch) —
 *    the crew went back and it is on the timeline, but the storm's one charge
 *    is carried by the first push — unless a flat Per Event push is marked
 *    billable (billPush), e.g. a second salting, which is its own charge. On
 *    Per Event, Per Inch a return trip is part of the event (its depth counts
 *    toward the deepest reading — see liftStormDepths).
 *  Per Push and Hourly jobs bill every push. Work that really is a separate
 *  charge (salt after plowing) is its own job, or a pushed visit on a Per Push
 *  job — not an extra crew. Unbilled visits show $0 and stay out of Snow
 *  Invoicing. */
export function isUnbilledSnowVisit(visit: {
  pushNumber?: number | null;
  billPush?: boolean | null;
  crewGroupSecondary?: boolean | null;
  job?: { invoiceType: string | null } | null;
}): boolean {
  const t = visit.job?.invoiceType ?? "per_event";
  if (visit.crewGroupSecondary) return t !== "hourly";
  if ((visit.pushNumber ?? 1) <= 1) return false;
  // billPush (a second salting billed as its own charge) only applies to flat Per Event;
  // on Per Event, Per Inch a return trip is part of the event's one charge.
  if (t === "per_event") return !visit.billPush;
  return t === "per_event_per_inch";
}

/** Per Event, Per Inch prices the storm once, on its deepest reading across
 *  EVERY visit of the job on it — including return trips and extra crews that
 *  aren't billed themselves (they are dropped from the invoicing queue). This
 *  lifts each such visit's depth to that storm maximum so the deeper return
 *  trip still prices the event. Other invoice types are returned unchanged. */
export function liftStormDepths<T extends { id: string; jobId: string; stormEventId: string | null; snowDepthInches: number | null; status: string; job?: { invoiceType: string | null } | null }>(visits: T[]): T[] {
  const maxByEvent = new Map<string, number>();
  for (const v of visits) {
    if (v.job?.invoiceType !== "per_event_per_inch" || !v.stormEventId) continue;
    if (v.status === "skipped" || v.status === "cancelled") continue;
    if (v.snowDepthInches == null || v.snowDepthInches <= 0) continue;
    const key = `${v.jobId}::${v.stormEventId}`;
    maxByEvent.set(key, Math.max(maxByEvent.get(key) ?? 0, v.snowDepthInches));
  }
  if (maxByEvent.size === 0) return visits;
  return visits.map((v) => {
    if (v.job?.invoiceType !== "per_event_per_inch" || !v.stormEventId) return v;
    const max = maxByEvent.get(`${v.jobId}::${v.stormEventId}`);
    return max != null && (v.snowDepthInches ?? 0) < max ? { ...v, snowDepthInches: max } : v;
  });
}

/** A completed snow visit as Snow Invoicing prices it: the visit, plus what
 *  the queue resolved around it (use-snow-invoicing). */
export type SnowBillableVisit = CRMJobVisit & {
  /** Monthly Flat Rate job on a storm its contract doesn't cover: the
   *  contract's price per storm outside its dates (null = none set). */
  contractOutsidePriceCents?: number | null;
  /** Hourly job sharing ONE crew stop with another hourly job: this visit's
   *  share (0–1) of the stop's on-site time. Unset = the whole span. */
  hourlyStopShare?: number | null;
  /** Per Event Per Inch: on-site hours worked by this storm's unbilled visits (return
   *  trips, extra crews) — added to an hourly depth range's billable hours. */
  stormExtraHours?: number | null;
  /** Monthly Flat Rate visit the contract covers but that is past its inch / salt
   *  cap: bills as overage (snow-caps.ts) instead of staying in the flat price. */
  capOverage?: SnowCapOverage;
  /** Why the visit can't be priced (shown in the queue instead of a silent $0). */
  billingWarning?: string | null;
  /** Materials the crew recorded as used on this storm visit, not yet billed. */
  stormProducts?: SnowVisitProduct[];
};

/** A per-storm material usage row (crm_job_products, visit_id = the storm visit). */
export interface SnowVisitProduct {
  id: string;
  productId: string | null;
  name: string;
  qty: number;
  unitPriceCents: number;
  totalCents: number;
  isTaxable: boolean;
  /** 'used' (never billed) or 'invoiced' on a voided / deleted invoice. */
  status: string;
  /** The dead invoice line it is still linked to, freed when re-billed. */
  staleLineItemId: string | null;
}

/** Same rounding as every other qty × rate line (complete-visit-side-effects). */
export function productLineTotalCents(unitPriceCents: number, qty: number): number {
  return Math.round(unitPriceCents * qty);
}

/** The visits one crew clocked in together at a stop: same client, day and
 *  clock-in instant (how Start / Stop Job stamps a stop's visits). */
/** The fields hourlyStopShares reads — a full CRMJobVisit fits. */
export interface StopShareVisit {
  id: string;
  clientId: string | null;
  scheduledDate: string;
  clockedInAt: string | null;
  actualHours: number | null;
  status: string;
  job?: { invoiceType: string | null } | null;
}

function stopClockKey(v: StopShareVisit): string | null {
  return v.clockedInAt ? `${v.clientId ?? ""}|${v.scheduledDate}|${v.clockedInAt}` : null;
}

/**
 * Splits ONE crew stop's on-site time between its hourly snow jobs. When a
 * single stop holds more than one hourly job (plow + salt at one property),
 * every visit carries the same clock stamps, and each used to bill the full
 * span — the client paid for the same hour twice. Each hourly visit now bills
 * its allocated share of the stop: its actual_hours (the clock-out allocation,
 * re-derived from punches) over the stop's total, else an even split. A stop
 * with one hourly job — and separate trips / crews — are unchanged (no entry).
 * `visits` must include the stop's other visits, not just the ones billed now.
 */
export function hourlyStopShares(visits: StopShareVisit[]): Map<string, number> {
  const byStop = new Map<string, typeof visits>();
  for (const v of visits) {
    if (v.status === "skipped" || v.status === "cancelled") continue;
    const key = stopClockKey(v);
    if (!key) continue;
    byStop.set(key, [...(byStop.get(key) ?? []), v]);
  }
  const shares = new Map<string, number>();
  for (const members of byStop.values()) {
    const hourly = members.filter((m) => m.job?.invoiceType === "hourly");
    if (hourly.length < 2) continue;
    const weights = members.map((m) => Math.max(0, Number(m.actualHours ?? 0)));
    const total = weights.reduce((a, b) => a + b, 0);
    members.forEach((m, i) => {
      if (m.job?.invoiceType !== "hourly") return;
      shares.set(m.id, total > 0 ? weights[i] / total : 1 / members.length);
    });
  }
  return shares;
}

/** Hours ON SITE for an hourly-billed snow visit — billed once, whatever the
 *  crew size. visit.actualHours is man-hours for job costing (the crew-app
 *  clock-out stores Σ every member's punches), so it can't be billed as-is.
 *  Clock stamps give the on-site span directly: clocked out − clocked in −
 *  breaks. Without stamps (office Close Out, manual entry) actual hours are
 *  divided back by the men on the visit, since those paths store
 *  on-site hours × men. Rounded to the hundredth of an hour. */
export function snowBillableHours(
  visit: Pick<CRMJobVisit, "clockedInAt" | "clockedOutAt" | "breakMinutes" | "actualHours" | "menCount"> & { hourlyStopShare?: number | null }
): number {
  let hours: number;
  const inMs = visit.clockedInAt ? new Date(visit.clockedInAt).getTime() : NaN;
  const outMs = visit.clockedOutAt ? new Date(visit.clockedOutAt).getTime() : NaN;
  if (Number.isFinite(inMs) && Number.isFinite(outMs) && outMs > inMs) {
    hours = (outMs - inMs) / 3_600_000 - (visit.breakMinutes ?? 0) / 60;
    // Another hourly job shared this stop: bill only this job's share of it.
    if (visit.hourlyStopShare != null) hours *= Math.max(0, Math.min(1, visit.hourlyStopShare));
  } else {
    hours = Number(visit.actualHours ?? 0) / Math.max(1, visit.menCount || 1);
  }
  return Math.max(0, Math.round(hours * 100) / 100);
}

/** "7:05 AM – 8:40 AM" from the visit's clock stamps in the org's zone — the optional time
 *  suffix on a snow invoice line (service option "Show visit times on snow invoice lines").
 *  Null when the crew never clocked a start AND end for the visit. */
export function visitTimeRangeText(
  visit: Pick<CRMJobVisit, "clockedInAt" | "clockedOutAt">,
  timeZone: string
): string | null {
  if (!visit.clockedInAt || !visit.clockedOutAt) return null;
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const start = formatInZone(visit.clockedInAt, timeZone, opts);
  const end = formatInZone(visit.clockedOutAt, timeZone, opts);
  if (start === "—" || end === "—") return null;
  return `${start} – ${end}`;
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
export function computeGroupAmountCents(groupVisits: SnowBillableVisit[], tiersByJobId?: Map<string, SnowRateTier[]>): number {
  const visit = groupVisits[0];
  const job = visit.job;
  const invoiceType = job?.invoiceType ?? "per_event";
  if (invoiceType === "per_event_per_inch") {
    const depths = groupVisits.map(recordedDepth).filter((d): d is number => d != null);
    if (depths.length === 0) return 0;
    const maxDepth = Math.max(...depths);
    const tiers = job?.id ? tiersByJobId?.get(job.id) : undefined;
    // An hourly range bills the on-site hours of every visit in the storm's billing group
    // (the deepest reading only picks the range; see liftStormDepths).
    const groupHours = groupVisits.reduce((sum, v) => sum + snowBillableHours(v) + (v.stormExtraHours ?? 0), 0);
    const tiered = tiers?.length ? priceWithTiers(maxDepth, tiers, groupHours) : null;
    return tiered ?? Math.round((job?.ratePerInchCents ?? 0) * maxDepth);
  }
  if (invoiceType === "per_push_per_inch") {
    // Interval billing: each push is priced by ITS depth against the job's ranges, else flat per inch.
    const depth = recordedDepth(visit);
    if (depth == null) return 0;
    const tiers = job?.id ? tiersByJobId?.get(job.id) : undefined;
    const tiered = tiers?.length ? priceWithTiers(depth, tiers, snowBillableHours(visit)) : null;
    return tiered ?? Math.round((job?.ratePerInchCents ?? 0) * depth);
  }
  if (invoiceType === "hourly") {
    // Hours on site, once — not the crew's man-hours (see snowBillableHours).
    return Math.round(snowBillableHours(visit) * (job?.rateCents ?? 0));
  }
  if (invoiceType === "monthly_flat_rate") {
    if (visit.capOverage) return visit.capOverage.amountCents;
    // Only reaches Snow Invoicing for a storm the contract doesn't cover; it
    // bills the contract's price per storm outside its dates (0 = not set —
    // the queue shows a warning instead of billing).
    return visit.contractOutsidePriceCents ?? 0;
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

export function describeAmount(visit: SnowBillableVisit, groupSize: number, tiersByJobId?: Map<string, SnowRateTier[]>): string {
  const invoiceType = visit.job?.invoiceType ?? "per_event";
  const splitSuffix = groupSize > 1 ? ` (split ÷${groupSize})` : "";
  if (invoiceType === "per_event_per_inch") {
    const tiers = visit.job?.id ? tiersByJobId?.get(visit.job.id) : undefined;
    const hourlyTier = tiers?.length && visit.snowDepthInches != null ? findSnowTier(visit.snowDepthInches, tiers) : null;
    if (hourlyTier?.billAs === "hourly") {
      return `event max depth ${visit.snowDepthInches}" is in the hourly range — on-site hours × ${formatCurrency(hourlyTier.rateCents ?? 0)}/hr${splitSuffix}`;
    }
    if (tiers?.length) return `event max depth via rate tiers${splitSuffix}`;
    return `event max depth × ${formatCurrency(visit.job?.ratePerInchCents ?? 0)}/in${splitSuffix}`;
  }
  if (invoiceType === "per_push_per_inch") {
    const tiers = visit.job?.id ? tiersByJobId?.get(visit.job.id) : undefined;
    const pushLabel = (visit.pushNumber ?? 1) > 1 ? `push ${visit.pushNumber}: ` : "";
    if (visit.snowDepthInches == null) return `${pushLabel}no depth recorded`;
    const hourlyTier = tiers?.length ? findSnowTier(visit.snowDepthInches, tiers) : null;
    if (hourlyTier?.billAs === "hourly") {
      return `${pushLabel}${visit.snowDepthInches}" hourly range: ${snowBillableHours(visit)} hrs × ${formatCurrency(hourlyTier.rateCents ?? 0)}/hr`;
    }
    if (tiers?.length) return `${pushLabel}${visit.snowDepthInches}" via rate ranges`;
    return `${pushLabel}${visit.snowDepthInches}" × ${formatCurrency(visit.job?.ratePerInchCents ?? 0)}/in`;
  }
  if (invoiceType === "hourly") {
    const shared = visit.hourlyStopShare != null ? ` (${Math.round(visit.hourlyStopShare * 100)}% of a shared stop)` : "";
    return `${snowBillableHours(visit)} hrs on site${shared} × ${formatCurrency(visit.job?.rateCents ?? 0)}/hr`;
  }
  if (invoiceType === "monthly_flat_rate") {
    if (visit.capOverage) return `overage: ${visit.capOverage.parts.map(capPartText).join("; ")}`;
    return visit.contractOutsidePriceCents != null
      ? "storm outside the contract — price per storm"
      : "storm outside the contract";
  }
  return `${INVOICE_TYPE_LABEL[invoiceType] ?? "Per Event"}${splitSuffix}`;
}

/** How a snow job's invoice type uses its service rows. The depth/interval types bill
 *  from the job's ranges (or Rate Per Inch), Hourly bills the job's hourly rate (which is
 *  the one service row's rate), and Monthly Flat Rate bills from the linked contract — so
 *  a price typed on a service row is either ignored by billing (yet still rolls up into
 *  the job's reported value) or only meaningful on a single row. Per Event is the only
 *  type that sums every service row. */
export interface SnowServiceRule {
  /** Most service rows the job may have, or null for no limit. */
  maxServices: number | null;
  /** False when billing never reads a service row's price. */
  servicePriceUsed: boolean;
  /** Shown above the services table. */
  note: string;
}

export function snowServiceRule(invoiceType: string | null | undefined): SnowServiceRule | null {
  switch (invoiceType) {
    case "per_event_per_inch":
    case "per_push_per_inch":
      return {
        maxServices: 1,
        servicePriceUsed: false,
        note: "Priced by the depth ranges (or Rate Per Inch) above, so a service price isn't used. One service per job — make a separate job for each service.",
      };
    case "hourly":
      return {
        maxServices: 1,
        servicePriceUsed: true,
        note: "The service's Rate is the hourly rate. One service per job.",
      };
    case "monthly_flat_rate":
      return {
        maxServices: null,
        servicePriceUsed: false,
        note: "Bills through the linked contract (not on its own), so a service price isn't used. Storms outside the contract's dates follow its \"Storms outside the contract dates\" setting. Link an active contract that auto-generates invoices, or this job will never be billed.",
      };
    default:
      return null;
  }
}
