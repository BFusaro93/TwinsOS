import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1),
  clientId: z.string().uuid().optional(),
  customerName: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  status: z.enum(["sold", "scheduled", "in_progress", "complete", "on_hold", "canceled"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().optional(),
  // Writes original_contract_price — contract_price itself is DB-trigger-
  // derived (original + approved change orders) and never directly settable.
  contractPriceCents: z.number().int().nonnegative().optional(),
  estimatedCostCents: z.number().int().nonnegative().optional(),
  laborHours: z.number().nonnegative().optional(),
  budgetHours: z.number().nonnegative().optional(),
  laborRateCents: z.number().int().nonnegative().optional(),
  burdenedRateCents: z.number().int().nonnegative().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  clientId: z.string().uuid().optional(),
  customerName: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  status: z.enum(["sold", "scheduled", "in_progress", "complete", "on_hold", "canceled"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().optional(),
  contractPriceCents: z.number().int().nonnegative().optional(),
  estimatedCostCents: z.number().int().nonnegative().optional(),
  laborHours: z.number().nonnegative().optional(),
  budgetHours: z.number().nonnegative().optional(),
  laborRateCents: z.number().int().nonnegative().optional(),
  burdenedRateCents: z.number().int().nonnegative().optional(),
});
