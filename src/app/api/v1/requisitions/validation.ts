import { z } from "zod";

const lineItemSchema = z.object({
  productItemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitCostCents: z.number().int().nonnegative().optional(),
  projectId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

export const createRequisitionSchema = z.object({
  title: z.string().min(1),
  vendorId: z.string().uuid().optional(),
  taxRatePercent: z.number().nonnegative().optional(),
  shippingCostCents: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
  workOrderId: z.string().uuid().optional(),
  lineItems: z.array(lineItemSchema).min(1),
});
