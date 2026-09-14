import { z } from "zod";

export const createPmScheduleSchema = z.object({
  title: z.string().min(1),
  assetId: z.string().uuid().optional(),
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "annual"]),
  nextDueDate: z.string(),
  description: z.string().optional(),
});

export const updatePmScheduleSchema = z.object({
  title: z.string().min(1).optional(),
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "annual"]).optional(),
  nextDueDate: z.string().optional(),
  lastCompletedDate: z.string().optional(),
  isActive: z.boolean().optional(),
  description: z.string().optional(),
});
