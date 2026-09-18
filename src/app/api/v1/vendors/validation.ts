import { z } from "zod";

const w9StatusEnum = z.enum(["not_requested", "requested", "received", "expired"]);
/** w9_received_date / w9_expiration_date are `date` columns — see jobs/validation.ts. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a YYYY-MM-DD date (no time component)");

export const createVendorSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
  vendorType: z.string().optional(),
  w9Status: w9StatusEnum.optional(),
  w9ReceivedDate: isoDate.optional(),
  w9ExpirationDate: isoDate.optional(),
});

// Nullable where the column is nullable, so a caller can clear a field.
export const updateVendorSchema = z.object({
  name: z.string().min(1).optional(),
  contactName: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  vendorType: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  w9Status: w9StatusEnum.optional(),
  w9ReceivedDate: isoDate.nullable().optional(),
  w9ExpirationDate: isoDate.nullable().optional(),
});
