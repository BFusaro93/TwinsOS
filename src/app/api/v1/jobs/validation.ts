import { z } from "zod";

/**
 * Date fields are YYYY-MM-DD only, never a bare string. `crm_jobs`/
 * `crm_job_visits` store these as `date`, so an ISO instant like
 * "2026-09-18T02:00:00Z" is cast by Postgres in UTC and lands on the
 * PREVIOUS day for an America/New_York operation — a visit silently
 * scheduled a day early, on the dispatch board, with no error. Rejecting the
 * format is the only way the caller finds out.
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a YYYY-MM-DD date (no time component)");

export const createJobSchema = z.object({
  clientId: z.string().uuid().describe("Landscapt client this job is for. Must belong to the calling key's org."),
  propertyId: z
    .string()
    .uuid()
    .optional()
    .describe("Service property. Must belong to the SAME client as clientId, or the request is rejected."),
  jobType: z
    .enum(["recurring", "one_time", "waiting_list", "package", "snow", "project"])
    .optional()
    .describe(
      "Defaults to one_time. 'waiting_list' has no fixed date: a scheduledDate on a waiting_list job is stored as its availability window (waiting_list_start/end) and NO dispatch-board visit is created — that is the whole point of the waiting list."
    ),
  scheduledDate: isoDate
    .optional()
    .describe(
      "YYYY-MM-DD. For a dated job type this books the visit on the dispatch board. For jobType 'waiting_list' it is the START of the availability window instead (see waitingListEnd)."
    ),
  waitingListEnd: isoDate
    .optional()
    .describe("YYYY-MM-DD end of the waiting-list availability window. Only used when jobType is 'waiting_list'."),
  crewId: z.string().uuid().optional(),
  rateCents: z.number().int().nonnegative().optional().describe("Job rate, in CENTS (integer)."),
  notesToCrew: z.string().optional(),
  /** YYYY-MM-DD. Defaults to today (America/New_York) — drives the Sales by Date Sold reports. */
  dateSold: isoDate.optional(),
  salesRepId: z.string().uuid().optional(),
  /**
   * Optional, and only meaningful together: without a serviceId, a job is
   * created exactly as before (a bare crm_jobs row, e.g. a waiting_list
   * placeholder) — the app itself allows this. With one, this endpoint also
   * creates a matching crm_job_services line, and — if the job type takes a
   * fixed date and scheduledDate is set — a crm_job_visits row, the same two
   * inserts useCreateClientJob does for its simplest single-service case
   * (src/lib/hooks/use-crm-jobs.ts). Without this, a job made via the API had
   * no visit and never showed up correctly on the Dispatch Board.
   */
  serviceId: z.string().uuid().optional(),
  serviceName: z.string().optional(),
  qty: z.number().positive().optional(),
  menCount: z.number().int().positive().optional().describe("Crew size for this job. Defaults to 1."),
  budgetedHours: z
    .number()
    .nonnegative()
    .optional()
    .describe(
      "TOTAL MAN-HOURS budgeted for the job (hours on site × crew size), not hours per person. With menCount 3 and a 4-hour visit, pass 12. The per-person figure is derived from this and menCount."
    ),
});

export const updateJobSchema = z.object({
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled", "skipped", "hold"]).optional(),
  subStatus: z.string().nullable().optional(),
  scheduledDate: isoDate.nullable().optional(),
  crewId: z.string().uuid().nullable().optional(),
  rateCents: z.number().int().nonnegative().nullable().optional().describe("Job rate, in CENTS (integer)."),
  notesToCrew: z.string().nullable().optional(),
  completionNotes: z.string().nullable().optional(),
});
