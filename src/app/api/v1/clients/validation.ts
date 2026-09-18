import { z } from "zod";

const clientFields = {
  displayName: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  accountNumber: z.string().optional(),
  accountType: z.enum(["residential", "commercial"]).optional(),
  status: z.enum(["active", "inactive", "lead", "cancelled"]).optional(),
  primaryPhone: z.string().optional(),
  primaryEmail: z.string().email().optional(),
  billingAddress: z.string().optional(),
  billingCity: z.string().optional(),
  billingState: z.string().optional(),
  billingZip: z.string().optional(),
  billingEmail: z.string().email().optional(),
  billingSameAsService: z.boolean().optional(),
  serviceAddress: z.string().optional(),
  serviceCity: z.string().optional(),
  serviceState: z.string().optional(),
  serviceZip: z.string().optional(),
  source: z.string().optional(),
  parentClientId: z.string().uuid().optional(),
  salesRepId: z.string().uuid().optional(),
  referredBy: z.string().optional(),
  referredByClientId: z.string().uuid().optional(),
  okToEmail: z.boolean().optional(),
  doNotMarket: z.boolean().optional(),
  smsOptIn: z.boolean().optional(),
  paymentMethod: z.string().optional(),
  billingTerms: z.string().optional(),
  invoiceFrequency: z.string().optional(),
  invoiceDelivery: z.string().optional(),
  defaultTaxRateBps: z.number().int().nonnegative().optional(),
  defaultTerms: z.string().optional(),
  defaultPaymentMethod: z.string().optional(),
  isTaxable: z.boolean().optional(),
  gateCode: z.string().optional(),
  notesToCrew: z.string().optional(),
  mapCode: z.string().optional(),
  officeNotes: z.string().optional(),
  priority: z.string().optional(),
  turfSqft: z.number().nonnegative().optional(),
  mulchBedSqft: z.number().nonnegative().optional(),
  grossSqft: z.number().nonnegative().optional(),
  linearFtPerimeter: z.number().nonnegative().optional(),
  linearFtEdging: z.number().nonnegative().optional(),
  yardsOfMulch: z.number().nonnegative().optional(),
};

export const createClientSchema = z.object(clientFields);

// parentClientId is create-only in the app too (linking/unlinking a parent
// later goes through a dedicated action, not a plain field patch).
export const updateClientSchema = z
  .object(clientFields)
  .omit({ parentClientId: true })
  .extend({ displayName: z.string().min(1).optional() });
