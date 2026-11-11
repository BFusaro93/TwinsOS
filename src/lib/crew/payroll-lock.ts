/**
 * Payroll lock date (organizations.payroll_locked_through). The database
 * refuses any change to shifts, punches or payroll adjustments dated on or
 * before it (fn_payroll_lock_guard), for every writer — the office, the crew
 * app's server routes and background closes alike. Routes use this to answer
 * that refusal with a 409 and the database's own sentence ("Payroll is locked
 * through Nov 7, 2026; ask an admin to move the lock date.") instead of a 500.
 *
 * Pure: safe in client components.
 */
export const PAYROLL_LOCKED_PREFIX = "Payroll is locked through";

export function isPayrollLockedError(message: string | null | undefined): boolean {
  return !!message && message.includes(PAYROLL_LOCKED_PREFIX);
}

/** True when `workDate` (YYYY-MM-DD) is inside the locked period. */
export function isPayrollDayLocked(workDate: string, lockedThrough: string | null | undefined): boolean {
  return !!lockedThrough && workDate <= lockedThrough;
}
