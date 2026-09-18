import { z } from "zod";

export const createJobSchema = z.object({
  clientId: z.string().uuid(),
  propertyId: z.string().uuid().optional(),
  jobType: z.enum(["recurring", "one_time", "waiting_list", "package", "snow", "project"]).optional(),
  scheduledDate: z.string().optional(),
  crewId: z.string().uuid().optional(),
  rateCents: z.number().int().nonnegative().optional(),
  notesToCrew: z.string().optional(),
  /** YYYY-MM-DD. Defaults to today (America/New_York) — drives the Sales by Date Sold reports. */
  dateSold: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateSold must be YYYY-MM-DD").optional(),
  salesRepId: z.string().uuid().optional(),
  /**
   * Optional, and only meaningful together: without a serviceId, a job is
   * created exactly as before (a bare crm_jobs row, e.g. a waiting_list
   * placeholder) — the app itself allows this. With one, this endpoint also
   * creates a matching crm_job_services line, and — if scheduledDate is set
   * — a crm_job_visits row, the same two inserts useCreateClientJob does for
   * its simplest single-service case (src/lib/hooks/use-crm-jobs.ts). Without
   * this, a job made via the API had no visit and never showed up correctly
   * on the Dispatch Board.
   */
  serviceId: z.string().uuid().optional(),
  serviceName: z.string().optional(),
  qty: z.number().positive().optional(),
  menCount: z.number().int().positive().optional(),
  budgetedHours: z.number().nonnegative().optional(),
});

export const updateJobSchema = z.object({
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled", "skipped", "hold"]).optional(),
  subStatus: z.string().optional(),
  scheduledDate: z.string().optional(),
  crewId: z.string().uuid().optional(),
  rateCents: z.number().int().nonnegative().optional(),
  notesToCrew: z.string().optional(),
  completionNotes: z.string().optional(),
});
