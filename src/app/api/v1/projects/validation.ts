import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1),
  customerName: z.string().optional(),
  address: z.string().optional(),
  status: z.enum(["sold", "scheduled", "in_progress", "complete", "on_hold", "canceled"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  customerName: z.string().optional(),
  address: z.string().optional(),
  status: z.enum(["sold", "scheduled", "in_progress", "complete", "on_hold", "canceled"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().optional(),
});
