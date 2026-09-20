import { z } from "zod";

/** next_due_date / last_completed_date are `date` columns — see jobs/validation.ts. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a YYYY-MM-DD date (no time component)");

export const createPmScheduleSchema = z.object({
  title: z.string().min(1),
  assetId: z.string().uuid().optional(),
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "annual"]),
  nextDueDate: isoDate,
  description: z.string().optional(),
  // Name is looked up server-side from assignedToId, not taken from the request.
  assignedToId: z.string().uuid().optional().describe("Assignee — a crm_employees id."),
});

export const updatePmScheduleSchema = z.object({
  title: z.string().min(1).optional(),
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "annual"]).optional(),
  nextDueDate: isoDate.optional(),
  lastCompletedDate: isoDate.nullable().optional(),
  isActive: z.boolean().optional(),
  description: z.string().nullable().optional(),
  // Nullable so an assignee can actually be removed.
  assignedToId: z.string().uuid().nullable().optional().describe("Assignee — a crm_employees id. null unassigns."),
});
