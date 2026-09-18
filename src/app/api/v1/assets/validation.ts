import { z } from "zod";

export const createAssetSchema = z.object({
  name: z.string().min(1),
  assetTag: z.string().optional(),
  equipmentNumber: z.string().optional(),
  assetType: z.string().optional(),
  status: z.enum(["active", "inactive", "in_shop", "out_of_service", "disposed"]).optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().int().optional(),
  serialNumber: z.string().optional(),
  division: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
});

// Nullable where the column is nullable, so a caller can actually CLEAR a
// field — every PATCH field used to be `.optional()` and never
// `.nullable()`, leaving no way to blank a serial number or a note once set.
export const updateAssetSchema = z.object({
  name: z.string().min(1).optional(),
  assetTag: z.string().nullable().optional(),
  equipmentNumber: z.string().nullable().optional(),
  assetType: z.string().nullable().optional(),
  status: z.enum(["active", "inactive", "in_shop", "out_of_service", "disposed"]).optional(),
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  serialNumber: z.string().nullable().optional(),
  division: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
