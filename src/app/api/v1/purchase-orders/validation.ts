import { z } from "zod";

const poLineItemSchema = z.object({
  productItemId: z
    .string()
    .uuid()
    .describe(
      "Products-catalog entry to order. Every PO line must reference one — free-text items are not allowed (CLAUDE.md)."
    ),
  quantity: z
    .number()
    .positive()
    .describe(
      "Units to order. Must be a whole number when the catalog item's category is 'maintenance_part' — CMMS parts inventory is integer-only."
    ),
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
  taxable: z.boolean().optional().describe("Whether this line is part of the sales-tax base. Defaults to true."),
});

/**
 * Deliberately cannot set `status`: every PO created here lands at
 * "requested" (the DB column default, same as the app's own NewPODialog),
 * never anything further along. Submitting it into the approval chain
 * (entity_type='purchase_order' in approval_flows/approval_requests) is a
 * separate, explicit action in the app — see guard_procurement_approval_status()
 * in supabase/migrations/20260806203310_guard_procurement_approval_status.sql,
 * which physically blocks any path (including this one) from setting status
 * to approved/rejected without a resolved approval chain.
 */
export const createPurchaseOrderSchema = z.object({
  vendorId: z.string().uuid().describe("Vendor to order from. Must belong to the calling key's organization."),
  requisitionId: z.string().uuid().optional().describe("Requisition this PO fulfils, if any."),
  // YYYY-MM-DD: po_date is a `date` column, so an ISO instant is cast in UTC
  // and lands on the previous day for an America/New_York operation.
  poDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "poDate must be YYYY-MM-DD")
    .optional()
    .describe("YYYY-MM-DD. Defaults to today."),
  // The vendor's own invoice/receipt number for this PO — distinct from
  // poNumber (this system's own sequence). Same field the app's own
  // NewPODialog lets a user set at creation (see useCreatePurchaseOrder in
  // src/lib/hooks/use-purchase-orders.ts).
  invoiceNumber: z.string().optional().describe("The VENDOR's invoice/receipt number — not this system's PO number."),
  taxRatePercent: z.number().nonnegative().optional().describe("Sales tax rate as a PERCENT (e.g. 7 for 7%), not bps."),
  shippingCostCents: z.number().int().nonnegative().optional().describe("Shipping, in CENTS (integer)."),
  discountCostCents: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Vendor discount, in CENTS (integer). Clamped to the line-item subtotal so the total can never go negative."),
  discountReducesTax: z.boolean().optional().describe("Whether the discount comes off the taxable base as well as the total."),
  notes: z.string().optional(),
  lineItems: z.array(poLineItemSchema).min(1),
});
