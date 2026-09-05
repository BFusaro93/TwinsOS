import { z } from "zod";

// ============================================================
// Landscapt KPI Scorecard — config shape stored in
// crm_kpi_scorecards.config and the wire types for its API routes.
// ============================================================

export const kpiUnitSchema = z.enum(["currency", "percent", "number", "hours", "days"]);
export type KpiUnit = z.infer<typeof kpiUnitSchema>;

/**
 * One row on the scorecard. `key` either matches a catalog metric
 * (src/lib/kpi/landscapt-kpi-catalog.ts) — in which case label/unit/
 * lowerIsBetter default from the catalog and `source` follows it — or is a
 * user-created manual metric (`custom:<uuid>`), which must carry its own
 * label and unit.
 */
export const kpiScorecardMetricSchema = z.object({
  key: z.string().min(1).max(80),
  /** Override / custom label. Required for custom metrics. */
  label: z.string().min(1).max(80).optional(),
  unit: kpiUnitSchema.optional(),
  /** Percent weight within its category. */
  weight: z.number().min(0).max(100),
  lowerIsBetter: z.boolean().optional(),
});
export type KpiScorecardMetric = z.infer<typeof kpiScorecardMetricSchema>;

export const kpiScorecardCategorySchema = z.object({
  key: z.string().min(1).max(40),
  label: z.string().min(1).max(60),
  metrics: z.array(kpiScorecardMetricSchema).max(30),
});
export type KpiScorecardCategory = z.infer<typeof kpiScorecardCategorySchema>;

export const kpiScorecardConfigSchema = z.object({
  categories: z.array(kpiScorecardCategorySchema).max(12),
});
export type KpiScorecardConfig = z.infer<typeof kpiScorecardConfigSchema>;

export const kpiScorecardInputSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  config: kpiScorecardConfigSchema,
});
export type KpiScorecardInput = z.infer<typeof kpiScorecardInputSchema>;

export interface KpiScorecard {
  id: string;
  name: string;
  config: KpiScorecardConfig;
  createdAt: string;
  updatedAt: string;
}

export interface KpiScorecardEntry {
  id: string;
  metricKey: string;
  period: string;
  targetValue: number | null;
  actualValue: number | null;
  updatedAt: string | null;
}

/** Result of the server-side computation of every auto metric for a year. */
export interface KpiComputedActuals {
  /** Calendar year, e.g. "2026". */
  period: string;
  /** metric key -> value (already in display units: dollars, %, hours, count). */
  values: Record<string, number | null>;
  computedAt: string;
}
