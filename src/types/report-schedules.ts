import { z } from "zod";
import { DATE_WINDOWS } from "@/lib/reports/schedule-date-window";
import { MONTHLY_MODES, SCHEDULE_FREQUENCIES } from "@/lib/reports/schedule-recurrence";

// Request bodies for /api/crm/report-schedules (POST) and /[id] (PATCH).
// Cross-field recurrence rules (weekly needs a day, monthly needs its fields,
// once needs a date) are checked by recurrenceProblem() on the MERGED row in
// the routes, so a PATCH that changes only part of a recurrence is validated
// against what the row will actually end up as.

export const SCHEDULE_FORMATS = ["pdf", "xlsx"] as const;
export type ScheduleFormat = (typeof SCHEDULE_FORMATS)[number];

const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be YYYY-MM-DD");

/** Blank / whitespace-only text means "use the default wording" → null. */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .max(max, `${label} must be ${max} characters or fewer`)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === null || v.trim() === "" ? null : v.trim()));

const recurrenceFields = {
  /** Hour of day (0-23) on the ORG's clock. */
  hourLocal: z.number().int().min(0).max(23),
  frequency: z.enum(SCHEDULE_FREQUENCIES),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  monthlyMode: z.enum(MONTHLY_MODES).nullable(),
  monthDay: z.number().int().min(1).max(31).nullable(),
  monthWeek: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(-1)]).nullable(),
  monthWeekday: z.number().int().min(0).max(6).nullable(),
  startDate: ymdSchema.nullable(),
  endDate: ymdSchema.nullable(),
};

/** Optional relative date window (custom analyses only; checked in the routes). */
const dateWindowFields = {
  dateFilterColumn: z
    .string()
    .regex(/^[a-z_][a-z0-9_]*$/)
    .nullable()
    .optional(),
  dateWindow: z.enum(DATE_WINDOWS).nullable().optional(),
};

export const createReportScheduleSchema = z
  .object({
  /** Exactly one of reportKey (prebuilt) / customReportId (saved analysis). */
  reportKey: z.string().min(1).optional(),
  customReportId: z.string().uuid().optional(),
  ...dateWindowFields,
  recipients: z.array(z.string().email()).min(1).max(50),
  hourLocal: recurrenceFields.hourLocal.default(7),
  frequency: recurrenceFields.frequency.default("daily"),
  weekdays: recurrenceFields.weekdays.default([]),
  monthlyMode: recurrenceFields.monthlyMode.default(null),
  monthDay: recurrenceFields.monthDay.default(null),
  monthWeek: recurrenceFields.monthWeek.default(null),
  monthWeekday: recurrenceFields.monthWeekday.default(null),
  startDate: recurrenceFields.startDate.default(null),
  endDate: recurrenceFields.endDate.default(null),
  format: z.enum(SCHEDULE_FORMATS).default("pdf"),
  emailSubject: optionalText(200, "Subject"),
  emailMessage: optionalText(5000, "Message"),
  })
  .refine((v) => (v.reportKey ? 1 : 0) + (v.customReportId ? 1 : 0) === 1, {
    message: "Pick exactly one report or saved analysis",
  });
export type CreateReportScheduleInput = z.input<typeof createReportScheduleSchema>;

export const updateReportScheduleSchema = z.object({
  recipients: z.array(z.string().email()).min(1).max(50).optional(),
  enabled: z.boolean().optional(),
  /** Admin only: become the schedule's owner (it runs as created_by). The way
   *  to revive a schedule paused because its creator was deactivated. */
  takeOver: z.literal(true).optional(),
  hourLocal: recurrenceFields.hourLocal.optional(),
  frequency: recurrenceFields.frequency.optional(),
  weekdays: recurrenceFields.weekdays.optional(),
  monthlyMode: recurrenceFields.monthlyMode.optional(),
  monthDay: recurrenceFields.monthDay.optional(),
  monthWeek: recurrenceFields.monthWeek.optional(),
  monthWeekday: recurrenceFields.monthWeekday.optional(),
  startDate: recurrenceFields.startDate.optional(),
  endDate: recurrenceFields.endDate.optional(),
  format: z.enum(SCHEDULE_FORMATS).optional(),
  ...dateWindowFields,
  emailSubject: optionalText(200, "Subject"),
  emailMessage: optionalText(5000, "Message"),
});
export type UpdateReportScheduleInput = z.input<typeof updateReportScheduleSchema>;

/** A schedule as the API returns it (DB row + computed fields). */
export interface ReportScheduleRow {
  id: string;
  /** Prebuilt report key; null when the schedule targets a saved analysis. */
  report_key: string | null;
  custom_report_id: string | null;
  date_filter_column: string | null;
  date_window: string | null;
  recipients: string[];
  enabled: boolean;
  hour_local: number;
  frequency: string;
  weekdays: number[];
  monthly_mode: string | null;
  month_day: number | null;
  month_week: number | null;
  month_weekday: number | null;
  start_date: string | null;
  end_date: string | null;
  format: string;
  email_subject: string | null;
  email_message: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_error: string | null;
  /** The person the schedule runs as (permissions are re-checked against them). */
  created_by: string | null;
  created_at: string;
  /** Computed on the ORG's clock; null = paused, ended, or one-off done. */
  next_run_at: string | null;
  /** Owner's display name / deactivated flag — filled in by the list endpoint. */
  creator_name?: string | null;
  creator_inactive?: boolean;
}

/** last_run_error stored when a schedule is paused because its creator was
 *  deactivated (same wording as the profiles trigger in
 *  20261229000510_report_schedules_pause_inactive_creator.sql). */
export const CREATOR_DEACTIVATED_PAUSE_MESSAGE =
  "Paused: the person who created this schedule was deactivated. An admin can take it over and resume it.";

/** Columns selected for ReportScheduleRow (minus the computed next_run_at). */
export const REPORT_SCHEDULE_COLUMNS =
  "id, report_key, custom_report_id, date_filter_column, date_window, recipients, enabled, hour_local, frequency, weekdays, monthly_mode, month_day, month_week, month_weekday, start_date, end_date, format, email_subject, email_message, last_run_at, last_run_status, last_run_error, created_by, created_at";
