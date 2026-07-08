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
