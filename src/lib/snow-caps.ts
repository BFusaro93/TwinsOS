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
//  • PUSHES: one per completed plow-job visit (extra crews on a stop don't count),
//    counted per job like salts.
//  • EVENTS: one per storm (the storm event, else the service date) with a
//    completed plow visit — whatever its depth — counted per contract.
//  • Every cap is optional (blank = not applicable). A storm that crosses the
//    inch cap bills only the inches beyond it; the charge sits on the storm's
//    first visit (so it is idempotent by visit id like every other snow line).
//    A storm past the events cap bills on its first visit; a salt or push past its
//    cap bills on its own visit. One visit gets ONE overage line: when several
//    caps are exceeded on it their charges add up on that line.

export type SnowCapKind = "inches" | "salt";
export type SnowCapPartKind = "inches" | "salt" | "pushes" | "events";
export type SnowCapReset = "contract_year" | "monthly";

/** The cap fields of a contract. */
export interface SnowCapContract {
  id: string;
  startDate: string | null;
  inchCap: number | null;
  saltCap: number | null;
  pushesCap: number | null;
  eventsCap: number | null;
  resetPeriod: SnowCapReset;
  overageDescription: string | null;
  overagePerInchCents: number | null;
  overagePerSaltCents: number | null;
  overagePerPushCents: number | null;
  overagePerEventCents: number | null;
}

/** A covered, completed visit of one of the contract's Monthly Flat Rate snow jobs. */
export interface SnowCapVisit {
  id: string;
  jobId: string;
  scheduledDate: string;
  stormEventId: string | null;
  snowDepthInches: number | null;
  crewGroupSecondary: boolean;
  /** Which cap the job counts toward; an untagged job counts toward inches / pushes / events. */
  capKind: SnowCapKind;
}

/** One cap a visit is over. */
export interface SnowCapOveragePart {
  kind: SnowCapPartKind;
  /** Inches over the cap, or 1 (an event, push or salt). */
  qty: number;
  cap: number;
  /** What each unit bills; null = no overage price set on the contract (amount stays 0). */
  unitPriceCents: number | null;
  amountCents: number;
  /** Salt / push / event: which one of the period this is (36 of a 35 cap). */
  ordinal?: number;
}

/** What one visit bills as overage instead of being covered by the contract. */
export interface SnowCapOverage {
  parts: SnowCapOveragePart[];
  amountCents: number;
  description: string;
}

export interface SnowCapStatus {
  inchCap: number | null;
  saltCap: number | null;
  pushesCap: number | null;
  eventsCap: number | null;
  resetPeriod: SnowCapReset;
  /** The period the usage figures describe, e.g. "2026-27 contract year" or "Jan 2027". */
  periodLabel: string;
  inchesUsed: number;
  /** Salt applications used in the period by the most-used salt job. */
  saltsUsed: number;
  saltsByJob: Map<string, number>;
  /** Pushes used in the period by the most-pushed plow job. */
  pushesUsed: number;
  pushesByJob: Map<string, number>;
  eventsUsed: number;
  /** Visit id → the overage it bills (every period, not just the current one). */
  overageByVisit: Map<string, SnowCapOverage>;
  /** Each cap already used up in the current period, so the next such stop would bill as overage. */
  inchesAtCap: boolean;
  eventsAtCap: boolean;
  saltAtCapByJob: Map<string, boolean>;
  pushesAtCapByJob: Map<string, boolean>;
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

export function hasSnowCap(c: Pick<SnowCapContract, "inchCap" | "saltCap" | "pushesCap" | "eventsCap">): boolean {
  return (c.inchCap ?? 0) > 0 || (c.saltCap ?? 0) > 0 || (c.pushesCap ?? 0) > 0 || (c.eventsCap ?? 0) > 0;
}

const byDateThenId = (a: { scheduledDate: string; id: string }, b: { scheduledDate: string; id: string }) =>
  a.scheduledDate < b.scheduledDate ? -1 : a.scheduledDate > b.scheduledDate ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

const positive = (n: number | null): number | null => (n != null && n > 0 ? Number(n) : null);

/** Counts a contract's covered visits against its caps. `displayDay` picks the
 *  period the usage figures describe (see capDisplayDay). */
export function computeSnowCapStatus(c: SnowCapContract, visits: SnowCapVisit[], displayDay: string): SnowCapStatus {
  const partsByVisit = new Map<string, SnowCapOveragePart[]>();
  const addPart = (visitId: string, part: SnowCapOveragePart) => {
    partsByVisit.set(visitId, [...(partsByVisit.get(visitId) ?? []), part]);
  };
  const currentKey = capPeriodKey(c, displayDay);
  const inchCap = positive(c.inchCap);
  const saltCap = positive(c.saltCap);
  const pushesCap = positive(c.pushesCap);
  const eventsCap = positive(c.eventsCap);
  const description = c.overageDescription?.trim() || "Snow overage";
  const plow = [...visits].filter((x) => x.capKind === "inches").sort(byDateThenId);

  // ── inches + events: one storm each (deepest reading), summed per period in date order ──
  const storms = new Map<string, { period: string; date: string; depth: number; lead: SnowCapVisit }>();
  for (const v of plow) {
    const key = `${capPeriodKey(c, v.scheduledDate)}::${v.stormEventId ?? `date:${v.scheduledDate}`}`;
    const depth = v.snowDepthInches != null && v.snowDepthInches > 0 ? v.snowDepthInches : 0;
    const existing = storms.get(key);
    if (!existing) storms.set(key, { period: capPeriodKey(c, v.scheduledDate), date: v.scheduledDate, depth, lead: v });
    else {
      existing.depth = Math.max(existing.depth, depth);
      // An extra-crew (secondary) visit is never invoiced on its own, so the storm's
      // overage must land on a primary visit even if the secondary sorts first.
      if (existing.lead.crewGroupSecondary && !v.crewGroupSecondary) existing.lead = v;
    }
  }
  const inchRunning = new Map<string, number>();
  const eventRunning = new Map<string, number>();
  for (const s of [...storms.values()].sort((a, b) => byDateThenId({ scheduledDate: a.date, id: a.lead.id }, { scheduledDate: b.date, id: b.lead.id }))) {
    const beforeInches = inchRunning.get(s.period) ?? 0;
    const afterInches = round2(beforeInches + s.depth);
    inchRunning.set(s.period, afterInches);
    const eventNo = (eventRunning.get(s.period) ?? 0) + 1;
    eventRunning.set(s.period, eventNo);
    if (inchCap != null && s.depth > 0) {
      const over = round2(Math.min(s.depth, Math.max(0, afterInches - inchCap)));
      if (over > 0) {
        const unit = c.overagePerInchCents;
        addPart(s.lead.id, { kind: "inches", qty: over, cap: inchCap, unitPriceCents: unit, amountCents: unit != null ? Math.round(over * unit) : 0 });
      }
    }
    if (eventsCap != null && eventNo > eventsCap) {
      const unit = c.overagePerEventCents;
      addPart(s.lead.id, { kind: "events", qty: 1, cap: eventsCap, unitPriceCents: unit, amountCents: unit ?? 0, ordinal: eventNo });
    }
  }

  // ── pushes (plow jobs) and salts (salt jobs): one per visit, counted per job ──
  const countPerJob = (list: SnowCapVisit[], cap: number | null, kind: "pushes" | "salt", unit: number | null) => {
    const running = new Map<string, number>(); // `${job}::${period}` → n
    for (const v of list) {
      if (v.crewGroupSecondary) continue;
      const key = `${v.jobId}::${capPeriodKey(c, v.scheduledDate)}`;
      const n = (running.get(key) ?? 0) + 1;
      running.set(key, n);
      if (cap != null && n > cap) addPart(v.id, { kind, qty: 1, cap, unitPriceCents: unit, amountCents: unit ?? 0, ordinal: n });
    }
    const byJob = new Map<string, number>();
    const atCap = new Map<string, boolean>();
    for (const [key, n] of running) {
      const [jobId, period] = key.split("::");
      if (period !== currentKey) continue;
      byJob.set(jobId, n);
      atCap.set(jobId, cap != null && n >= cap);
    }
    return { byJob, atCap };
  };
  const salts = countPerJob([...visits].filter((x) => x.capKind === "salt").sort(byDateThenId), saltCap, "salt", c.overagePerSaltCents);
  const pushes = countPerJob(plow, pushesCap, "pushes", c.overagePerPushCents);

  const overageByVisit = new Map<string, SnowCapOverage>();
  for (const [visitId, list] of partsByVisit) {
    overageByVisit.set(visitId, { parts: list, amountCents: list.reduce((a, p) => a + p.amountCents, 0), description });
  }
  return {
    inchCap,
    saltCap,
    pushesCap,
    eventsCap,
    resetPeriod: c.resetPeriod,
    periodLabel: periodLabelFor(c, displayDay),
    inchesUsed: round2(inchRunning.get(currentKey) ?? 0),
    saltsUsed: Math.max(0, ...salts.byJob.values()),
    saltsByJob: salts.byJob,
    pushesUsed: Math.max(0, ...pushes.byJob.values()),
    pushesByJob: pushes.byJob,
    eventsUsed: eventRunning.get(currentKey) ?? 0,
    overageByVisit,
    inchesAtCap: inchCap != null && (inchRunning.get(currentKey) ?? 0) >= inchCap,
    eventsAtCap: eventsCap != null && (eventRunning.get(currentKey) ?? 0) >= eventsCap,
    saltAtCapByJob: salts.atCap,
    pushesAtCapByJob: pushes.atCap,
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

const UNIT_WORD: Record<SnowCapPartKind, string> = { inches: "inch", salt: "salt", pushes: "push", events: "event" };

/** Why an overage visit can't be priced yet, or null. */
export function capOverageWarning(o: SnowCapOverage): string | null {
  const missing = o.parts.filter((p) => p.unitPriceCents == null).map((p) => UNIT_WORD[p.kind]);
  if (missing.length === 0) return null;
  return `Over the ${missing.join(" and ")} cap but no overage price per ${missing.join(" / ")} is set on the contract — set one to bill this.`;
}

/** How one part reads: "4" over the 80" cap", "salt 36 (cap 35)", … */
export function capPartText(p: SnowCapOveragePart): string {
  switch (p.kind) {
    case "inches": return `${p.qty}" over the ${p.cap}" cap`;
    case "salt": return `salt ${p.ordinal} (cap ${p.cap})`;
    case "pushes": return `push ${p.ordinal} (cap ${p.cap})`;
    default: return `event ${p.ordinal} (cap ${p.cap})`;
  }
}

/** The invoice line text: the contract's overage description plus what is over. */
export function capOverageLineText(o: SnowCapOverage): string {
  return `${o.description} — ${o.parts.map(capPartText).join("; ")}`;
}
