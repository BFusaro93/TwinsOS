import { z } from "zod";

export const createWorkOrderSchema = z.object({
  title: z.string().min(1),
  assetId: z.string().uuid().optional(),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  woType: z.enum(["reactive", "preventive"]).optional(),
  dueDate: z.string().optional(),
  category: z.string().optional(),
  // Links this WO back to the schedule that spawned it — without this a WO
  // can't represent an auto-generated preventive work order.
  pmScheduleId: z.string().uuid().optional(),
  parentWorkOrderId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  // Employee ids only — names are looked up server-side (same as assetId
  // -> assetName in the route handler), never taken from the request.
  assignedToIds: z.array(z.string().uuid()).optional(),
});

export const updateWorkOrderSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(["open", "on_hold", "in_progress", "done"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  dueDate: z.string().optional(),
  category: z.string().optional(),
  pmScheduleId: z.string().uuid().optional(),
  parentWorkOrderId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  assignedToIds: z.array(z.string().uuid()).optional(),
});
