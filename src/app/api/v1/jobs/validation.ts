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
