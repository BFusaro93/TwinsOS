import { z } from "zod";

const w9StatusEnum = z.enum(["not_requested", "requested", "received", "expired"]);

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
  w9ReceivedDate: z.string().optional(),
  w9ExpirationDate: z.string().optional(),
});

export const updateVendorSchema = z.object({
  name: z.string().min(1).optional(),
  contactName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
  vendorType: z.string().optional(),
  isActive: z.boolean().optional(),
  w9Status: w9StatusEnum.optional(),
  w9ReceivedDate: z.string().optional(),
  w9ExpirationDate: z.string().optional(),
});
