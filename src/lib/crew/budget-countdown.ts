/**
 * Time left against a stop's budgeted hours, for the running-job timer (SA's
 * Team app counts down from the visit's budget instead of only counting up).
 *
 * The budget is a wall-clock allowance — a crew works a stop side by side — so
 * it's the sum of visitBudgetHours() over the stop's live visits. Time already
 * spent on breaks (breakMinutes) doesn't count against it. Returns null when
 * nothing is budgeted — the caller then shows the plain elapsed timer, as SA does.
 */
export interface BudgetCountdown {
  /** Minutes left; negative once over budget. */
  remainingMinutes: number;
  over: boolean;
  /** e.g. "1h 05m left" or "12m over budget". */
  label: string;
}

export function budgetCountdown(args: {
  budgetedHours: (number | null | undefined)[];
  clockedInAt: string;
  breakMinutes?: number | null;
  now?: Date;
}): BudgetCountdown | null {
  const budgetMinutes = Math.round(args.budgetedHours.reduce<number>((sum, h) => sum + (h ?? 0), 0) * 60);
  if (budgetMinutes <= 0) return null;
  const now = args.now ?? new Date();
  const workedMs = now.getTime() - new Date(args.clockedInAt).getTime() - (args.breakMinutes ?? 0) * 60_000;
  const remainingMinutes = budgetMinutes - Math.floor(Math.max(0, workedMs) / 60_000);
  const abs = Math.abs(remainingMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const text = h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
  return { remainingMinutes, over: remainingMinutes < 0, label: remainingMinutes < 0 ? `${text} over budget` : `${text} left` };
}

/**
 * One visit's wall-clock budget in hours — the single rule behind the web stop
 * page's countdown and the per-visit `budgetedHours` /api/crm/crew/visits sends
 * the native app, so the two can't drift:
 *   1. the visit's own budgeted_hours override (man-hours) ÷ its men count;
 *   2. else the per-person budgeted hours of EVERY service the visit covers
 *      (its linked service, or all the job's services when it has none);
 *   3. else the job's budgeted_hours (man-hours) ÷ men count.
 * Returns null when none is set.
 */
export function visitBudgetHours(visit: {
  /** crm_job_visits.budgeted_hours — the visit's OWN override, not the job's. */
  budgetedHoursOverride: number | null | undefined;
  menCount: number | null | undefined;
  /** visitServices(visit): per-person budgeted hours. */
  services: { budgetedHours?: number | null }[];
  jobBudgetedHours?: number | null;
}): number | null {
  const men = Math.max(1, visit.menCount ?? 1);
  if (visit.budgetedHoursOverride != null && visit.budgetedHoursOverride > 0) return visit.budgetedHoursOverride / men;
  const perPerson = visit.services.reduce<number>((sum, s) => sum + Math.max(0, Number(s.budgetedHours ?? 0)), 0);
  if (perPerson > 0) return perPerson;
  if (visit.jobBudgetedHours != null && visit.jobBudgetedHours > 0) return visit.jobBudgetedHours / men;
  return null;
}
