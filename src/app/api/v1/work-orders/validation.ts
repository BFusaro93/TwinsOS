import { z } from "zod";

export const createWorkOrderSchema = z.object({
  title: z.string().min(1),
  assetId: z.string().uuid().optional(),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  woType: z.enum(["reactive", "preventive"]).optional(),
  dueDate: z.string().optional(),
  category: z.string().optional(),
});

export const updateWorkOrderSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(["open", "on_hold", "in_progress", "done"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  dueDate: z.string().optional(),
  category: z.string().optional(),
});
