import { z } from "zod";

/** due_date is a `date` column — see the note in jobs/validation.ts. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a YYYY-MM-DD date (no time component)");

export const createWorkOrderSchema = z.object({
  title: z.string().min(1),
  assetId: z.string().uuid().optional().describe("Asset this work order is against."),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  woType: z.enum(["reactive", "preventive"]).optional(),
  dueDate: isoDate.optional(),
  category: z.string().optional(),
  // Links this WO back to the schedule that spawned it — without this a WO
  // can't represent an auto-generated preventive work order.
  pmScheduleId: z.string().uuid().optional(),
  parentWorkOrderId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional().describe("Primary assignee — a crm_employees id."),
  // Employee ids only — names are looked up server-side (same as assetId
  // -> assetName in the route handler), never taken from the request.
  assignedToIds: z.array(z.string().uuid()).optional().describe("Additional assignees — crm_employees ids."),
});

// Nullable where the underlying column is nullable, so a caller can actually
// CLEAR a field: every PATCH field used to be `.optional()` and never
// `.nullable()`, which left no way to unassign a work order, drop its PM
// link, or remove a due date once set.
export const updateWorkOrderSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["open", "on_hold", "in_progress", "done"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  dueDate: isoDate.nullable().optional(),
  category: z.string().nullable().optional(),
  pmScheduleId: z.string().uuid().nullable().optional(),
  parentWorkOrderId: z.string().uuid().nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional().describe("Primary assignee. null unassigns."),
  assignedToIds: z.array(z.string().uuid()).optional().describe("Additional assignees. [] clears them."),
});
