// Snow contract caps and overage — pure counting and pricing.
//
// A snow contract can cap what its flat price covers: inches of snowfall
// and/or salt applications per period. Work inside the cap stays covered by the
// contract; work beyond it bills as overage in Snow Invoicing.
//
// Counting rules (written down in the snow guide too):
//  • Only completed, non-skipped, non-cancelled visits that the contract covers
//    count (callers pass exactly those).
//  • INCHES: one reading per storm — the deepest recorded depth across every
//    inch-counted visit of the contract on that storm (same "priced once on its
//    deepest reading" rule as Per Event, Per Inch). A storm without a recorded
//    depth counts 0. Storms are summed over the period in date order.
//  • SALT: one application per completed salt-job visit (a second push that
//    salts again is a second application; an extra crew on the same stop is not).
//    Counted per salt job, so a contract with several properties doesn't burn
//    one property's cap on another's.
//  • A storm that crosses the inch cap bills only the inches beyond it. The
//    charge sits on the storm's first visit (so it is idempotent by visit id like
//    every other snow line). A salt past the cap bills on its own visit.

export type SnowCapKind = "inches" | "salt";
export type SnowCapReset = "contract_year" | "monthly";

/** The cap fields of a contract. */
export interface SnowCapContract {
  id: string;
  startDate: string | null;
  inchCap: number | null;
  saltCap: number | null;
  resetPeriod: SnowCapReset;
  overageDescription: string | null;
  overagePerInchCents: number | null;
  overagePerSaltCents: number | null;
}

/** A covered, completed visit of one of the contract's Monthly Flat Rate snow jobs. */
export interface SnowCapVisit {
  id: string;
  jobId: string;
  scheduledDate: string;
  stormEventId: string | null;
  snowDepthInches: number | null;
  crewGroupSecondary: boolean;
  /** Which cap the job counts toward; an untagged job counts toward inches. */
  capKind: SnowCapKind;
}

/** One visit that bills as overage instead of being covered by the contract. */
export interface SnowCapOverage {
  kind: SnowCapKind;
  /** Inches over the cap (inches) or 1 (a salt). */
  qty: number;
  cap: number;
  /** What each unit bills; null = no overage price set on the contract (amount stays 0). */
  unitPriceCents: number | null;
  amountCents: number;
  description: string;
  /** Salt only: which application of the period this is (36 of a 35 cap). */
  ordinal?: number;
}

export interface SnowCapStatus {
  inchCap: number | null;
  saltCap: number | null;
  resetPeriod: SnowCapReset;
  /** The period the usage figures describe, e.g. "2026-27 season" or "Jan 2027". */
  periodLabel: string;
  inchesUsed: number;
  /** Salt applications used in the period by the most-used salt job. */
  saltsUsed: number;
  saltsByJob: Map<string, number>;
  /** Visit id → the overage it bills (every period, not just the current one). */
  overageByVisit: Map<string, SnowCapOverage>;
  /** Cap crossed in the current period, so the next such stop would bill as overage. */
  inchesAtCap: boolean;
  saltAtCapByJob: Map<string, boolean>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function parts(day: string): { y: number; m: number; d: number } {
  return { y: Number(day.slice(0, 4)), m: Number(day.slice(5, 7)), d: Number(day.slice(8, 10)) };
}

/** Which cap period a service day falls in: the calendar month, or the
 *  contract year counted from the start date's anniversary. */
export function capPeriodKey(c: Pick<SnowCapContract, "startDate" | "resetPeriod">, day: string): string {
  if (c.resetPeriod === "monthly") return day.slice(0, 7);
  if (!c.startDate) return "season";
  const s = parts(c.startDate);
  const t = parts(day);
  let n = t.y - s.y;
  if (t.m < s.m || (t.m === s.m && t.d < s.d)) n -= 1;
  return `year-${Math.max(0, n)}`;
}

function periodLabelFor(c: Pick<SnowCapContract, "startDate" | "resetPeriod">, day: string): string {
  if (c.resetPeriod === "monthly") {
    const { y, m } = parts(day);
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }
  if (!c.startDate) return "contract season";
  const n = Number(capPeriodKey(c, day).replace("year-", "")) || 0;
  const startYear = parts(c.startDate).y + n;
  return `${startYear}–${String((startYear + 1) % 100).padStart(2, "0")} contract year`;
}

export function hasSnowCap(c: Pick<SnowCapContract, "inchCap" | "saltCap">): boolean {
  return (c.inchCap ?? 0) > 0 || (c.saltCap ?? 0) > 0;
}

const byDateThenId = (a: { scheduledDate: string; id: string }, b: { scheduledDate: string; id: string }) =>
  a.scheduledDate < b.scheduledDate ? -1 : a.scheduledDate > b.scheduledDate ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Counts a contract's covered visits against its caps. `today` picks the
 *  period the usage figures describe (clamped into the contract's dates by the
 *  caller via `displayDay`). */
export function computeSnowCapStatus(c: SnowCapContract, visits: SnowCapVisit[], displayDay: string): SnowCapStatus {
  const overageByVisit = new Map<string, SnowCapOverage>();
  const currentKey = capPeriodKey(c, displayDay);
  const inchCap = (c.inchCap ?? 0) > 0 ? Number(c.inchCap) : null;
  const saltCap = (c.saltCap ?? 0) > 0 ? Number(c.saltCap) : null;
  const description = c.overageDescription?.trim() || "Snow overage";

  // ── inches: one reading per storm, summed per period in date order ──
  const storms = new Map<string, { period: string; date: string; depth: number; lead: SnowCapVisit }>();
  for (const v of [...visits].filter((x) => x.capKind === "inches").sort(byDateThenId)) {
    const key = `${capPeriodKey(c, v.scheduledDate)}::${v.stormEventId ?? `date:${v.scheduledDate}`}`;
    const depth = v.snowDepthInches != null && v.snowDepthInches > 0 ? v.snowDepthInches : 0;
    const existing = storms.get(key);
    if (!existing) storms.set(key, { period: capPeriodKey(c, v.scheduledDate), date: v.scheduledDate, depth, lead: v });
    else existing.depth = Math.max(existing.depth, depth);
  }
  const running = new Map<string, number>();
  for (const s of [...storms.values()].sort((a, b) => byDateThenId({ scheduledDate: a.date, id: a.lead.id }, { scheduledDate: b.date, id: b.lead.id }))) {
    const before = running.get(s.period) ?? 0;
    const after = round2(before + s.depth);
    running.set(s.period, after);
    if (inchCap == null || s.depth <= 0) continue;
    const over = round2(Math.min(s.depth, Math.max(0, after - inchCap)));
    if (over <= 0) continue;
    const unit = c.overagePerInchCents;
    overageByVisit.set(s.lead.id, {
      kind: "inches",
      qty: over,
      cap: inchCap,
      unitPriceCents: unit,
      amountCents: unit != null ? Math.round(over * unit) : 0,
      description,
    });
  }

  // ── salt: one application per visit, counted per salt job ──
  const saltsByJob = new Map<string, number>();
  const saltAtCapByJob = new Map<string, boolean>();
  const saltRunning = new Map<string, number>(); // `${job}::${period}` → n
  for (const v of [...visits].filter((x) => x.capKind === "salt" && !x.crewGroupSecondary).sort(byDateThenId)) {
    const period = capPeriodKey(c, v.scheduledDate);
    const key = `${v.jobId}::${period}`;
    const n = (saltRunning.get(key) ?? 0) + 1;
    saltRunning.set(key, n);
    if (saltCap != null && n > saltCap) {
      const unit = c.overagePerSaltCents;
      overageByVisit.set(v.id, {
        kind: "salt",
        qty: 1,
        cap: saltCap,
        unitPriceCents: unit,
        amountCents: unit ?? 0,
        description,
        ordinal: n,
      });
    }
  }
  for (const [key, n] of saltRunning) {
    const [jobId, period] = key.split("::");
    if (period !== currentKey) continue;
    saltsByJob.set(jobId, n);
    saltAtCapByJob.set(jobId, saltCap != null && n >= saltCap);
  }

  return {
    inchCap,
    saltCap,
    resetPeriod: c.resetPeriod,
    periodLabel: periodLabelFor(c, displayDay),
    inchesUsed: round2(running.get(currentKey) ?? 0),
    saltsUsed: Math.max(0, ...saltsByJob.values()),
    saltsByJob,
    overageByVisit,
    inchesAtCap: inchCap != null && (running.get(currentKey) ?? 0) >= inchCap,
    saltAtCapByJob,
  };
}

/** The day whose period the contract's usage figures describe: today, kept
 *  inside the contract's start/end dates (a finished season shows its last
 *  period, a future one its first). */
export function capDisplayDay(c: { startDate: string | null; endDate: string | null }, today: string): string {
  if (c.endDate && today > c.endDate) return c.endDate;
  if (c.startDate && today < c.startDate) return c.startDate;
  return today;
}

/** Why a cap overage visit can't be priced yet, or null. */
export function capOverageWarning(o: SnowCapOverage): string | null {
  if (o.unitPriceCents != null) return null;
  return o.kind === "inches"
    ? "Over the inch cap but no overage price per inch is set on the contract — set one to bill this."
    : "Over the salt cap but no overage price per salt is set on the contract — set one to bill this.";
}

/** The invoice line text: the contract's overage description plus what is over. */
export function capOverageLineText(o: SnowCapOverage): string {
  return o.kind === "inches"
    ? `${o.description} — ${o.qty}" over the ${o.cap}" cap`
    : `${o.description} — salt ${o.ordinal ?? ""} (cap ${o.cap})`.replace("salt  (", "salt (");
}
