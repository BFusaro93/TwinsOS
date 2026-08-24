import { z } from "zod";

export const createJobSchema = z.object({
  clientId: z.string().uuid(),
  propertyId: z.string().uuid().optional(),
  jobType: z.enum(["recurring", "one_time", "waiting_list", "package", "snow", "project"]).optional(),
  scheduledDate: z.string().optional(),
  crewId: z.string().uuid().optional(),
  rateCents: z.number().int().nonnegative().optional(),
  notesToCrew: z.string().optional(),
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
