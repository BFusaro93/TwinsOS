import { z } from "zod";

export const createPmScheduleSchema = z.object({
  title: z.string().min(1),
  assetId: z.string().uuid().optional(),
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "annual"]),
  nextDueDate: z.string(),
  description: z.string().optional(),
  // Name is looked up server-side from assignedToId, not taken from the request.
  assignedToId: z.string().uuid().optional(),
});

export const updatePmScheduleSchema = z.object({
  title: z.string().min(1).optional(),
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "annual"]).optional(),
  nextDueDate: z.string().optional(),
  lastCompletedDate: z.string().optional(),
  isActive: z.boolean().optional(),
  description: z.string().optional(),
  assignedToId: z.string().uuid().optional(),
});
