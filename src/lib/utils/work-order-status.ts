import type { WorkOrderStatus } from "@/types/cmms";

/**
 * Work order statuses that still need work. Everything else — done and
 * skipped — is closed. Counting `status !== "done"` as open made skipped work
 * orders show up as open and overdue on the dashboard, reports, list filters
 * and the bell.
 */
export const OPEN_WO_STATUSES: readonly WorkOrderStatus[] = ["open", "in_progress", "on_hold"];

export function isOpenWO(wo: { status: string }): boolean {
  return (OPEN_WO_STATUSES as readonly string[]).includes(wo.status);
}

/**
 * Open and past due on the org's calendar. `todayYmd` is the org's today
 * ("YYYY-MM-DD", from todayInZone / useOrgDates().today()); due dates are
 * compared as text so no Date parsing (and no UTC-vs-local shift) is involved.
 */
export function isOverdueWO(wo: { status: string; dueDate: string | null }, todayYmd: string): boolean {
  return isOpenWO(wo) && !!wo.dueDate && wo.dueDate.slice(0, 10) < todayYmd;
}
