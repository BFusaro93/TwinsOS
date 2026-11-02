import type { CRMPackageService } from "@/types/crm-packages";

export interface PackageVisitSchedule {
  service: CRMPackageService;
  /** Earliest date that satisfies both this visit's window and the min-days
   *  gap from the previous visit's scheduled date. Null if the visit has no
   *  start date to anchor from. */
  scheduledDate: Date | null;
  /** True when the min-days constraint pushed the scheduled date past this
   *  visit's own end date — the window and the spacing rule can't both be
   *  satisfied, and this needs manual attention (shorten a window, reduce
   *  min days, or push the whole program back). */
  conflict: boolean;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function parseDate(s: string): Date {
  return new Date(s + "T00:00:00");
}

/**
 * Computes the actual scheduled date for each visit in a Master Package,
 * in sortOrder, given:
 *   - each visit's own [startDate, endDate] window
 *   - min_days: the minimum number of days that must elapse since the
 *     PREVIOUS visit's scheduled date before this one can occur
 *
 * A visit is scheduled as early as possible: the later of its own window
 * start and (previous visit's scheduled date + this visit's min_days).
 * If that date falls after the visit's own end date, the window and the
 * spacing rule conflict — the visit is still returned (clamped to its
 * scheduled date, not silently dropped) but flagged so the conflict is
 * visible rather than hidden.
 */
export function computePackageVisitSchedule(services: CRMPackageService[]): PackageVisitSchedule[] {
  const ordered = [...services].sort((a, b) => a.sortOrder - b.sortOrder);
  const results: PackageVisitSchedule[] = [];
  let prevDate: Date | null = null;

  for (const service of ordered) {
    if (!service.startDate) {
      results.push({ service, scheduledDate: null, conflict: false });
      // No window to anchor from — don't let a gap here silently reset
      // spacing for the next visit; carry the previous date forward as-is.
      continue;
    }

    let earliest = parseDate(service.startDate);
    if (prevDate && service.minDays) {
      const minDate = addDays(prevDate, service.minDays);
      if (minDate > earliest) earliest = minDate;
    }

    const conflict = !!service.endDate && earliest > parseDate(service.endDate);

    results.push({ service, scheduledDate: earliest, conflict });
    prevDate = earliest;
  }

  return results;
}

export interface PackageLineStep {
  /** Estimate line id this package step prices. */
  lineId: string;
  startDate: string | null;
  completeByDate: string | null;
  minDays: number | null;
}

function toDateStr(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function shiftStr(s: string | null, days: number): string | null {
  return s ? toDateStr(addDays(parseDate(s), days)) : null;
}

/**
 * Maps the lines of an estimate that were added from a package onto the
 * package's steps, then resolves each step's window the same way
 * NewJobDialog.pickPackage does (computePackageVisitSchedule, min-days
 * spacing included).
 *
 * A line matches the next unused package step with the same service id (or,
 * for older packages that only carry a name, the same name); the lines are
 * taken in the order given. A line with no matching step gets no window.
 * A `skipped` line (Draft/Lost, or not selected) still uses up its step but is left out of
 * the result, so skipping a middle step doesn't shift the later same-service steps' dates.
 *
 * `anchor` (YYYY-MM-DD), when given, re-anchors the whole program: every
 * window shifts by the days between the program's earliest scheduled date and
 * the anchor, exactly like changing the Start Date on a new package job.
 *
 * `windowStart` / `windowEnd` are the program's overall range (the job's
 * waiting-list window).
 */
export function planPackageLineSteps(
  services: CRMPackageService[],
  lines: { id: string; serviceId: string | null; serviceName: string; skipped?: boolean }[],
  anchor?: string | null,
): { steps: PackageLineStep[]; windowStart: string | null; windowEnd: string | null } {
  const schedule = computePackageVisitSchedule(services);
  const unused = [...schedule];
  const norm = (n: string) => n.trim().toLowerCase();

  const matched = lines.map((line) => {
    let idx = unused.findIndex((v) => !!line.serviceId && v.service.serviceId === line.serviceId);
    if (idx === -1) idx = unused.findIndex((v) => norm(v.service.serviceName) === norm(line.serviceName));
    const hit = idx === -1 ? null : unused.splice(idx, 1)[0];
    return { line, hit };
  });

  const dated = schedule.filter((v) => v.scheduledDate);
  let offset = 0;
  if (anchor && dated.length > 0) {
    const earliest = dated.reduce((min, v) => (v.scheduledDate! < min ? v.scheduledDate! : min), dated[0].scheduledDate!);
    offset = Math.round((parseDate(anchor).getTime() - parseDate(toDateStr(earliest)).getTime()) / 86_400_000);
  }

  const steps: PackageLineStep[] = matched.filter(({ line }) => !line.skipped).map(({ line, hit }) => ({
    lineId: line.id,
    startDate: hit?.scheduledDate ? shiftStr(toDateStr(hit.scheduledDate), offset) : null,
    completeByDate: shiftStr(hit?.service.endDate ?? null, offset),
    minDays: hit?.service.minDays ?? null,
  }));

  const starts = steps.map((s) => s.startDate).filter((d): d is string => !!d).sort();
  const ends = steps.map((s) => s.completeByDate ?? s.startDate).filter((d): d is string => !!d).sort();
  return {
    steps,
    windowStart: starts[0] ?? null,
    windowEnd: ends[ends.length - 1] ?? null,
  };
}
