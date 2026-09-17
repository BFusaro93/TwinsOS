import { z } from "zod";

const BILLING_FREQUENCIES = ["weekly", "biweekly", "monthly", "quarterly", "annual", "one_time"] as const;
const CONTRACT_STATUSES = ["draft", "sent", "signed", "active", "expired", "cancelled"] as const;

const contractItemSchema = z.object({
  clientId: z.string().uuid(),
  title: z.string().min(1),
  estimateId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  monthlyAmountCents: z.number().int().nonnegative().optional(),
  billingFrequency: z.enum(BILLING_FREQUENCIES).optional(),
  autoRenew: z.boolean().optional(),
  notes: z.string().optional(),
  status: z.enum(CONTRACT_STATUSES).optional(),
  signedAt: z.string().optional(),
  signedBy: z.string().optional(),
});

/**
 * Unlike the app's own contract UI (which always creates "draft" and only
 * ever stamps signed_at/signed_by via now() at status-transition time), this
 * endpoint is meant for recording contracts that were already executed
 * externally (e.g. signed in DocuSign outside the app) — so it deliberately
 * accepts a historical signedAt/signedBy and an initial status past "draft".
 * No fabrication risk: this records a fact that already happened, it
 * doesn't create a new binding agreement the way a normal in-app "New
 * Contract" would. Defaults to "active" when signedAt is given (so billing
 * starts immediately, matching an already-signed real-world contract),
 * otherwise "draft".
 *
 * Supports either one contract (top-level fields) or a bulk batch via
 * `contracts`, for entering a spreadsheet of already-signed agreements in
 * one call. If `contracts` is present, the top-level fields are ignored.
 */
export const createContractSchema = z.object({
  clientId: z.string().uuid().optional(),
  title: z.string().min(1).optional(),
  estimateId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  monthlyAmountCents: z.number().int().nonnegative().optional(),
  billingFrequency: z.enum(BILLING_FREQUENCIES).optional(),
  autoRenew: z.boolean().optional(),
  notes: z.string().optional(),
  status: z.enum(CONTRACT_STATUSES).optional(),
  signedAt: z.string().optional(),
  signedBy: z.string().optional(),
  contracts: z.array(contractItemSchema).min(1).max(50).optional(),
});

export type CreateContractItem = z.infer<typeof contractItemSchema>;
