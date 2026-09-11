import { z } from "zod";

/**
 * Price adjustment runs — bulk re-pricing of live client work, with a preview
 * before the write and a line-level undo after it.
 *
 * The catalog bulk-price dialog and this are different tools on purpose:
 * that one moves `crm_services.default_rate_cents`, which only seeds new
 * records; this one moves the per-client snapshots that actually bill.
 */

export const ADJUST_METHODS = ["percent", "flat"] as const;
export const ROUNDING_RULES = ["cent", "quarter", "dollar", "five"] as const;
/** Contracts are deliberately absent — see the migration header for why. */
export const ADJUST_TARGETS = ["job_service", "package", "package_service"] as const;

export type AdjustTarget = (typeof ADJUST_TARGETS)[number];

export const TARGET_LABELS: Record<AdjustTarget, string> = {
  job_service: "Client job service rates",
  package: "Package monthly amounts",
  package_service: "Package service rates",
};

export const priceAdjustmentScopeSchema = z.object({
  serviceIds: z.array(z.string().uuid()).default([]),
  clientIds: z.array(z.string().uuid()).default([]),
  jobTypes: z.array(z.string()).default([]),
  packageIds: z.array(z.string().uuid()).default([]),
});

export type PriceAdjustmentScope = z.infer<typeof priceAdjustmentScopeSchema>;

const baseAdjustment = {
  method: z.enum(ADJUST_METHODS),
  /**
   * Whole percent for "percent" (5 => +5%); cents for "flat" (250 => +$2.50).
   * Zero is rejected — a run that changes nothing is a mistake, not a no-op
   * worth recording.
   */
  amount: z.number().refine((n) => n !== 0, "Amount must not be zero"),
  rounding: z.enum(ROUNDING_RULES),
  scope: priceAdjustmentScopeSchema,
  targets: z.array(z.enum(ADJUST_TARGETS)).min(1, "Pick at least one target"),
};

export const previewPriceAdjustmentSchema = z.object(baseAdjustment);

/**
 * One line the user ticked in the preview, carrying the price they were shown.
 * Apply recomputes the NEW price server-side — this says which rows move, not
 * what they move to — and skips any row whose live price no longer matches
 * `oldRateCents`, so a run can never apply an increase calculated from a
 * number that was never on screen.
 */
export const priceAdjustmentSelectionSchema = z.object({
  entityType: z.enum(ADJUST_TARGETS),
  entityId: z.string().uuid(),
  oldRateCents: z.number().int(),
});

export const applyPriceAdjustmentSchema = z.object({
  ...baseAdjustment,
  name: z.string().trim().min(1, "Name is required").max(200),
  notes: z.string().trim().max(2000).optional(),
  selected: z
    .array(priceAdjustmentSelectionSchema)
    .min(1, "Select at least one line to apply"),
});

export type PreviewPriceAdjustmentInput = z.infer<typeof previewPriceAdjustmentSchema>;
export type ApplyPriceAdjustmentInput = z.infer<typeof applyPriceAdjustmentSchema>;

export interface PriceAdjustmentCandidate {
  entityType: AdjustTarget;
  entityId: string;
  clientId: string | null;
  jobId: string | null;
  label: string;
  oldRateCents: number;
  newRateCents: number;
}

export interface PriceAdjustmentPreview {
  candidates: PriceAdjustmentCandidate[];
  /** Rows whose price moves — the only ones a run records or writes. */
  changedCount: number;
  /** Rows the filters matched but the maths leaves untouched. */
  unchangedCount: number;
  deltaCents: number;
  countsByTarget: Record<AdjustTarget, number>;
  deltaByTarget: Record<AdjustTarget, number>;
}

export interface PriceAdjustmentRun {
  id: string;
  name: string;
  method: (typeof ADJUST_METHODS)[number];
  amount: number;
  rounding: (typeof ROUNDING_RULES)[number];
  targets: AdjustTarget[];
  scope: PriceAdjustmentScope;
  status: "applied" | "reverted";
  lineCount: number;
  deltaCents: number;
  notes: string | null;
  appliedAt: string;
  revertedAt: string | null;
}
