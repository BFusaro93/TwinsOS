import { z } from "zod";

export const createPartSchema = z.object({
  name: z.string().min(1),
  partNumber: z
    .string()
    .optional()
    .describe("Must be unique within the organization — including the blank one, which only one part may hold."),
  description: z.string().optional(),
  category: z.string().optional(),
  minimumStock: z.number().int().nonnegative().optional().describe("Reorder point."),
  unitCostCents: z.number().int().nonnegative().optional().describe("What you PAY per unit, in CENTS (integer)."),
  vendorId: z.string().uuid().optional().describe("Preferred vendor. Must belong to the calling key's organization."),
});

// quantityOnHand is deliberately excluded — it's only ever changed via the
// GoodsReceipt → Parts inventory flow (see CLAUDE.md), never a direct API write.
// vendorId is nullable so the vendor can actually be cleared.
export const updatePartSchema = z.object({
  name: z.string().min(1).optional(),
  partNumber: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  minimumStock: z.number().int().nonnegative().optional().describe("Reorder point."),
  unitCostCents: z.number().int().nonnegative().optional().describe("What you PAY per unit, in CENTS (integer)."),
  vendorId: z.string().uuid().nullable().optional(),
});
