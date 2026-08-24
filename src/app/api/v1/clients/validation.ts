import { z } from "zod";

export const createClientSchema = z.object({
  displayName: z.string().min(1),
  accountType: z.enum(["residential", "commercial"]).optional(),
  status: z.enum(["active", "inactive", "lead", "cancelled"]).optional(),
  primaryPhone: z.string().optional(),
  primaryEmail: z.string().email().optional(),
  billingAddress: z.string().optional(),
  billingCity: z.string().optional(),
  billingState: z.string().optional(),
  billingZip: z.string().optional(),
  source: z.string().optional(),
  parentClientId: z.string().uuid().optional(),
});

export const updateClientSchema = z.object({
  displayName: z.string().min(1).optional(),
  accountType: z.enum(["residential", "commercial"]).optional(),
  status: z.enum(["active", "inactive", "lead", "cancelled"]).optional(),
  primaryPhone: z.string().optional(),
  primaryEmail: z.string().email().optional(),
  billingAddress: z.string().optional(),
  billingCity: z.string().optional(),
  billingState: z.string().optional(),
  billingZip: z.string().optional(),
  source: z.string().optional(),
});
