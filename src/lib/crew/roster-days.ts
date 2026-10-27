/**
 * Whether a crew-roster row (crm_crew_members) works on a given calendar day.
 *
 * `days_of_week` (0 = Sunday … 6 = Saturday, default every day) is what lets one
 * employee sit on two crews on different days (Mon–Wed on A, Thu–Fri on B — the
 * crm_crew_members day-overlap trigger only forbids OVERLAPPING days). Every
 * roster resolution — headcount, who gets auto-punched at Start Day / Start Job,
 * the crew board — has to honour it, or the employee is counted (and paid) on
 * the crew they're NOT scheduled with. A same-day reassignment
 * (crm_crew_daily_members) is an explicit placement and always wins over it.
 *
 * `ymd` is a plain "YYYY-MM-DD" calendar date; the weekday is read without any
 * timezone conversion.
 */
export function memberWorksOn(daysOfWeek: number[] | null | undefined, ymd: string): boolean {
  if (!daysOfWeek) return true;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return true;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return daysOfWeek.includes(dow);
}
