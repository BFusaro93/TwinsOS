import { z } from "zod";

const CATEGORY_DESCRIPTION =
  "Catalog category. 'maintenance_part' = a CMMS spare part (also mirrored into the parts inventory and receivable into stock); " +
  "'stocked_material' = landscape supply kept on hand; 'project_material' = job-specific material. " +
  "Only stocked_material and project_material lines may carry a projectId on a requisition or PO.";

export const createProductSchema = z.object({
  name: z.string().min(1).describe("Catalog item name."),
  description: z.string().optional(),
  partNumber: z
    .string()
    .optional()
    .describe(
      "Vendor/manufacturer part number. Required in practice for a maintenance_part once the org already has one blank-part-number CMMS part, because parts enforce unique part numbers (including the blank one)."
    ),
  category: z.enum(["maintenance_part", "stocked_material", "project_material"]).describe(CATEGORY_DESCRIPTION),
  unitCostCents: z.number().int().nonnegative().optional().describe("What you PAY per unit, in CENTS (integer)."),
  priceCents: z.number().int().nonnegative().optional().describe("What you CHARGE per unit, in CENTS (integer)."),
  vendorId: z.string().uuid().optional().describe("Preferred vendor. Must belong to the calling key's organization."),
  isInventory: z.boolean().optional().describe("Whether stock on hand is tracked for this item."),
  // Written to BOTH product_items and parts (for a maintenance_part), the
  // same as the app's own useCreateProduct — it used to land on parts only,
  // leaving the catalog permanently reading 0.
  quantityOnHand: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe(
      "OPENING stock count at the moment the catalog entry is created. This is not a way to receive or adjust stock later: after creation, quantity on hand only ever increases through a goods receipt against a purchase order."
    ),
  minimumStock: z.number().int().nonnegative().optional().describe("Reorder point."),
});

export const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  partNumber: z.string().optional(),
  category: z.enum(["maintenance_part", "stocked_material", "project_material"]).optional().describe(
    CATEGORY_DESCRIPTION +
      " Changing to maintenance_part creates the mirrored CMMS parts row; changing away from it retires that row."
  ),
  unitCostCents: z.number().int().nonnegative().optional().describe("What you PAY per unit, in CENTS (integer)."),
  priceCents: z.number().int().nonnegative().optional().describe("What you CHARGE per unit, in CENTS (integer)."),
  // Nullable: product_items.vendor_id is nullable, so null clears the vendor.
  vendorId: z.string().uuid().nullable().optional(),
  isInventory: z.boolean().optional(),
  // quantityOnHand is deliberately absent — stock changes only via goods
  // receipt (CLAUDE.md), never a direct catalog write.
});
