import { z } from "zod";

// ============================================================
// Report Center — shared types + validation schemas
// ============================================================

/** How a field renders in tables + how totals are computed. */
export type ReportFieldType =
  | "text"
  | "date"
  | "datetime"
  | "money" // integer cents
  | "number"
  | "hours"
  | "percent"
  | "boolean";

export interface DatasetField {
  key: string;
  label: string;
  type: ReportFieldType;
  /** Include in the totals row. Defaults: money/hours = true, others = false. */
  totalable?: boolean;
}

export interface ReportDataset {
  /** Stable key — matches the `rpt_*` view name in Postgres. */
  key: string;
  label: string;
  description: string;
  /** Column most date filters should apply to by default. */
  defaultDateField?: string;
  fields: DatasetField[];
}

// ---------- Custom analysis config ----------

export const filterOpSchema = z.enum([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "in",
  "is_null",
  "not_null",
]);
export type FilterOp = z.infer<typeof filterOpSchema>;

export const analysisFilterSchema = z.object({
  column: z.string().min(1),
  op: filterOpSchema,
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    .optional(),
});
export type AnalysisFilter = z.infer<typeof analysisFilterSchema>;

export const aggregateFnSchema = z.enum(["sum", "avg", "min", "max", "count"]);
export type AggregateFn = z.infer<typeof aggregateFnSchema>;

export const analysisAggregateSchema = z.object({
  /** Column key, or "*" (count only). */
  column: z.string().min(1),
  fn: aggregateFnSchema,
});
export type AnalysisAggregate = z.infer<typeof analysisAggregateSchema>;

export const analysisConfigSchema = z.object({
  dataset: z.string().min(1),
  columns: z.array(z.string()).default([]),
  filters: z.array(analysisFilterSchema).default([]),
  groupBy: z.array(z.string()).default([]),
  aggregates: z.array(analysisAggregateSchema).default([]),
  sortColumn: z.string().optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
  limit: z.number().int().positive().max(5000).optional(),
});
export type AnalysisConfig = z.infer<typeof analysisConfigSchema>;

export const customReportInputSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullish(),
  config: analysisConfigSchema,
});
export type CustomReportInput = z.infer<typeof customReportInputSchema>;

export interface CustomReport {
  id: string;
  name: string;
  description: string | null;
  config: AnalysisConfig;
  createdAt: string;
  updatedAt: string;
}

// ---------- Report results (shared shape for every report) ----------

export interface ReportColumnDef {
  key: string;
  label: string;
  type: ReportFieldType;
  totalable?: boolean;
}

export type ReportResultRow = Record<string, unknown>;

export interface ReportResult {
  columns: ReportColumnDef[];
  rows: ReportResultRow[];
  /** Sums for totalable columns, keyed by column key. */
  totals?: Record<string, number | null>;
  rowCount: number;
  generatedAt: string;
  /** SA-style footnote definitions rendered under the table. */
  notes?: string[];
}

// ---------- Pre-built report catalog metadata ----------

export type ReportSectionKey =
  | "audits"
  | "client"
  | "estimates"
  | "financial"
  | "forms"
  | "job_costing"
  | "job_hours"
  | "lead"
  | "receivables"
  | "revenue"
  | "schedule_lists"
  | "service";

export const REPORT_SECTIONS: { key: ReportSectionKey; label: string }[] = [
  { key: "audits", label: "Audits" },
  { key: "client", label: "Client" },
  { key: "estimates", label: "Estimates" },
  { key: "financial", label: "Financial" },
  { key: "forms", label: "Forms" },
  { key: "job_costing", label: "Job Costing" },
  { key: "job_hours", label: "Job Hours" },
  { key: "lead", label: "Lead" },
  { key: "receivables", label: "Receivables" },
  { key: "revenue", label: "Revenue" },
  { key: "schedule_lists", label: "Schedule Lists" },
  { key: "service", label: "Service Reports" },
];

export type ReportFilterInputType =
  | "dateRange"
  | "select"
  | "text"
  | "number"
  | "checkbox";

export interface ReportFilterOption {
  value: string;
  label: string;
}

/**
 * A filter control on a pre-built report page. A `dateRange` filter reads and
 * writes the `from` / `to` query params; every other type reads/writes its own
 * `key` param.
 */
export interface ReportFilterDef {
  key: string;
  label: string;
  type: ReportFilterInputType;
  options?: ReportFilterOption[];
  /** Load options dynamically instead of a static list. */
  optionsSource?: "services" | "salesReps" | "crews" | "paymentMethods";
  /**
   * For dateRange: a preset key — "this_month" | "last_30" | "last_90" |
   * "this_year" | "all_time". For other types: the literal default value.
   */
  defaultValue?: string;
  placeholder?: string;
}
