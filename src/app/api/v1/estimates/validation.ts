import { z } from "zod";

/**
 * Deliberately narrow: no rateCents, marginBps, or any total/cost field.
 * Pricing always comes from the referenced crm_services row run through the
 * same computeLineItem()/recalcEstimateTotals() the app's own estimate
 * builder uses (see route.ts) — an agent picks WHAT to quote (client,
 * service, quantity), never the numbers themselves.
 */
// YYYY-MM-DD that is also a real calendar date (rejects 2026-02-31 and
// "232026-09-01", which Postgres would otherwise store or 500 on).
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be YYYY-MM-DD")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Invalid calendar date");

export const createEstimateSchema = z.object({
  clientId: z.string().uuid(),
  serviceId: z.string().uuid(),
  qty: z.number().positive(),
  visits: z.number().int().positive().optional(),
  description: z.string().optional(),
  estimateDate: calendarDate.optional(),
  validUntilDate: calendarDate.optional(),
  // Attribution only, not a pricing field — safe to expose under the same
  // "narrow, no caller-supplied dollar figures" rule the rest of this
  // schema follows.
  salesRepId: z.string().uuid().optional(),
});
