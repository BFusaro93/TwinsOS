import type { ReportScheduleRow } from "@/types/report-schedules";
import { nextRunAt, recurrenceFromRow } from "@/lib/reports/schedule-recurrence";

/** A report_schedules row as the API returns it: the stored columns plus
 *  next_run_at computed on the ORG's clock (`timeZone`). */
export function withNextRun(
  row: Omit<ReportScheduleRow, "next_run_at">,
  now: Date,
  timeZone: string
): ReportScheduleRow {
  const next = nextRunAt(recurrenceFromRow(row), now, timeZone, row.last_run_at, row.enabled);
  return { ...row, weekdays: row.weekdays ?? [], next_run_at: next ? next.toISOString() : null };
}
