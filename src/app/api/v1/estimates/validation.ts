import { z } from "zod";

/**
 * Deliberately narrow: no rateCents, marginBps, or any total/cost field.
 * Pricing always comes from the referenced crm_services row run through the
 * same computeLineItem()/recalcEstimateTotals() the app's own estimate
 * builder uses (see route.ts) — an agent picks WHAT to quote (client,
 * service, quantity), never the numbers themselves.
 */
export const createEstimateSchema = z.object({
  clientId: z.string().uuid(),
  serviceId: z.string().uuid(),
  qty: z.number().positive(),
  visits: z.number().int().positive().optional(),
  description: z.string().optional(),
  estimateDate: z.string().optional(),
  validUntilDate: z.string().optional(),
});
