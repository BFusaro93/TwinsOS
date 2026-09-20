import { z } from "zod";

const lineItemSchema = z.object({
  productItemId: z
    .string()
    .uuid()
    .describe(
      "Products-catalog entry to request. Every requisition line must reference one — free-text items are not allowed (CLAUDE.md)."
    ),
  quantity: z.number().int().positive().describe("Whole units to request."),
  unitCostCents: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Price per unit, in CENTS (integer). Defaults to the catalog item's own unit cost."),
  projectId: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Project to cost this line to. Only allowed for 'stocked_material' and 'project_material' items — a maintenance_part line is rejected (CLAUDE.md 'Project cost tracking')."
    ),
  notes: z.string().optional(),
});

/**
 * Always creates in "draft" status — moving a requisition into the approval
 * pipeline is a separate, explicit action in the app, so there is no PATCH
 * endpoint for requisitions at all.
 */
export const createRequisitionSchema = z.object({
  title: z.string().min(1),
  vendorId: z.string().uuid().optional().describe("Suggested vendor. Must belong to the calling key's organization."),
  taxRatePercent: z.number().nonnegative().optional().describe("Sales tax rate as a PERCENT (e.g. 7 for 7%), not bps."),
  shippingCostCents: z.number().int().nonnegative().optional().describe("Shipping, in CENTS (integer)."),
  discountCostCents: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Discount, in CENTS (integer). Clamped to the line-item subtotal so the total can never go negative."),
  discountReducesTax: z.boolean().optional().describe("Whether the discount comes off the taxable base as well as the total."),
  notes: z.string().optional(),
  workOrderId: z.string().uuid().optional().describe("CMMS work order that triggered this request."),
  crmJobId: z.string().uuid().optional().describe("Landscapt job that triggered this request."),
  lineItems: z.array(lineItemSchema).min(1),
});
