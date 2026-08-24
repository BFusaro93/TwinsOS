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

export const updateAssetSchema = z.object({
  name: z.string().min(1).optional(),
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
