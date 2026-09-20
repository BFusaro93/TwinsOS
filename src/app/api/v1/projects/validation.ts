import { z } from "zod";

/**
 * Date fields are constrained to YYYY-MM-DD, not bare strings. `projects`
 * stores them as `date`, so an ISO instant like "2026-09-18T02:00:00Z" is
 * cast by Postgres in UTC and silently lands on the *previous* day for any
 * America/New_York caller. Rejecting the format outright is the only way an
 * agent finds out.
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a YYYY-MM-DD date");

/**
 * city/state/zip and the money/`original_contract_price` fields are
 * `.optional()` and deliberately NOT `.nullable()`: those columns are NOT
 * NULL with ''/0 defaults, and an explicit NULL does not fall back to a
 * column default. Only fields backed by a nullable column are clearable.
 */
export const createProjectSchema = z.object({
  name: z.string().min(1).describe("Project name."),
  clientId: z.string().uuid().optional().describe("Landscapt client this project belongs to."),
  customerName: z.string().optional().describe("Free-text customer name, for projects with no linked client."),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  status: z.enum(["sold", "scheduled", "in_progress", "complete", "on_hold", "canceled"]).optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  notes: z.string().optional(),
  // Writes original_contract_price — contract_price itself is DB-trigger-
  // derived (original + approved change orders) and never directly settable.
  contractPriceCents: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe(
      "Original contract price, in CENTS (integer). Sets original_contract_price; the project's live contract_price is derived by a DB trigger as original + approved change orders and can never be set directly."
    ),
  estimatedCostCents: z.number().int().nonnegative().optional().describe("Estimated internal cost, in CENTS (integer)."),
  laborHours: z.number().nonnegative().optional(),
  budgetHours: z.number().nonnegative().optional(),
  laborRateCents: z.number().int().nonnegative().optional().describe("Labor rate per hour, in CENTS (integer)."),
  burdenedRateCents: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Fully-burdened labor rate per hour, in CENTS (integer)."),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  // Nullable: projects.client_id is nullable, so null unlinks the client.
  clientId: z.string().uuid().nullable().optional(),
  customerName: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  status: z.enum(["sold", "scheduled", "in_progress", "complete", "on_hold", "canceled"]).optional(),
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional(),
  notes: z.string().nullable().optional(),
  contractPriceCents: z.number().int().nonnegative().optional().describe("Original contract price, in CENTS (integer)."),
  estimatedCostCents: z.number().int().nonnegative().optional().describe("Estimated internal cost, in CENTS (integer)."),
  laborHours: z.number().nonnegative().nullable().optional(),
  budgetHours: z.number().nonnegative().nullable().optional(),
  laborRateCents: z.number().int().nonnegative().nullable().optional(),
  burdenedRateCents: z.number().int().nonnegative().nullable().optional(),
});
