import { z } from "zod";

const poLineItemSchema = z.object({
  productItemId: z.string().uuid(),
  quantity: z.number().positive(),
  unitCostCents: z.number().int().nonnegative().optional(),
  projectId: z.string().uuid().optional(),
  notes: z.string().optional(),
  taxable: z.boolean().optional(),
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
  vendorId: z.string().uuid(),
  requisitionId: z.string().uuid().optional(),
  poDate: z.string().optional(),
  // The vendor's own invoice/receipt number for this PO — distinct from
  // poNumber (this system's own sequence). Same field the app's own
  // NewPODialog lets a user set at creation (see useCreatePurchaseOrder in
  // src/lib/hooks/use-purchase-orders.ts).
  invoiceNumber: z.string().optional(),
  taxRatePercent: z.number().nonnegative().optional(),
  shippingCostCents: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
  lineItems: z.array(poLineItemSchema).min(1),
});
