import { z } from "zod";

export const createPartSchema = z.object({
  name: z.string().min(1),
  partNumber: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  minimumStock: z.number().int().nonnegative().optional(),
  unitCostCents: z.number().int().nonnegative().optional(),
  vendorId: z.string().uuid().optional(),
});

// quantityOnHand is deliberately excluded — it's only ever changed via the
// GoodsReceipt → Parts inventory flow (see CLAUDE.md), never a direct API write.
export const updatePartSchema = z.object({
  name: z.string().min(1).optional(),
  partNumber: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  minimumStock: z.number().int().nonnegative().optional(),
  unitCostCents: z.number().int().nonnegative().optional(),
  vendorId: z.string().uuid().optional(),
});
