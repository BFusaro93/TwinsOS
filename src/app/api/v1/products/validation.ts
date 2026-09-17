import { z } from "zod";

export const createProductSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  partNumber: z.string().optional(),
  category: z.enum(["maintenance_part", "stocked_material", "project_material"]),
  unitCostCents: z.number().int().nonnegative().optional(),
  priceCents: z.number().int().nonnegative().optional(),
  vendorId: z.string().uuid().optional(),
  isInventory: z.boolean().optional(),
  // Only meaningful when category is "maintenance_part" — mirrored into the
  // linked `parts` row (see route.ts). Ignored for other categories.
  quantityOnHand: z.number().int().nonnegative().optional(),
  minimumStock: z.number().int().nonnegative().optional(),
});

export const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  partNumber: z.string().optional(),
  category: z.enum(["maintenance_part", "stocked_material", "project_material"]).optional(),
  unitCostCents: z.number().int().nonnegative().optional(),
  priceCents: z.number().int().nonnegative().optional(),
  vendorId: z.string().uuid().optional(),
  isInventory: z.boolean().optional(),
});
