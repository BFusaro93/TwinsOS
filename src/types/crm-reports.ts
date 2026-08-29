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
  | "bps" // basis points (10000 = 100%) — divided by 100 for display, unlike "percent" which is already scaled
  | "boolean";

export interface DatasetField {
  key: string;
  label: string;
  type: ReportFieldType;
  /** Include in the totals row. Defaults: money/hours = true, others = false. */
  totalable?: boolean;
  /** Fixed set of valid values (e.g. account_type: residential/commercial) —
   *  when present, the filter builder renders a dropdown instead of free text. */
  options?: { value: string; label: string }[];
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

export const formulaOperatorSchema = z.enum(["+", "-", "*", "/"]);
export type FormulaOperator = z.infer<typeof formulaOperatorSchema>;

/** A formula's result is always numeric, but which of these four numeric
 *  display types applies is a unit question the engine can't infer (e.g.
 *  money ÷ hours isn't money) — the user picks it explicitly, same as SA's
 *  "Display Format" field. */
export const formulaDisplayTypeSchema = z.enum(["money", "number", "hours", "percent"]);
export type FormulaDisplayType = z.infer<typeof formulaDisplayTypeSchema>;

export const analysisFormulaSchema = z.object({
  /** New computed column's key/label — must not collide with an existing
   *  output column and must be a safe SQL-free identifier (it's never
   *  interpolated into SQL; the whole formula is computed client-side in
   *  the report engine after the whitelisted crm_run_report RPC returns). */
  name: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z][a-z0-9_]*$/i, "Must start with a letter; letters, numbers, underscores only"),
  /** Left operand — must be an existing output column key (a plain selected
   *  column or an aggregate alias), validated against the analysis's own
   *  already-whitelisted output columns, not arbitrary text. */
  left: z.string().min(1),
  operator: formulaOperatorSchema,
  /** Right operand — same constraint as `left`. */
  right: z.string().min(1),
  displayType: formulaDisplayTypeSchema.default("number"),
});
export type AnalysisFormula = z.infer<typeof analysisFormulaSchema>;

export const analysisConfigSchema = z.object({
  dataset: z.string().min(1),
  columns: z.array(z.string()).default([]),
  filters: z.array(analysisFilterSchema).default([]),
  groupBy: z.array(z.string()).default([]),
  aggregates: z.array(analysisAggregateSchema).default([]),
  /** When true (and groupBy has an entry), keeps row-level detail visible —
   *  grouped under a divider header per groupBy[0] value with a subtotal row
   *  per group — instead of collapsing to one row per group. */
  subtotals: z.boolean().optional(),
  /** Calculated columns (e.g. Revenue - Cost) — computed client-side in the
   *  report engine from two existing output columns, never sent into SQL.
   *  Can't reference another formula (no chaining) in this v1. Optional
   *  (not defaulted) so the ~70 hand-written PrebuiltReportDef analysis
   *  literals across src/lib/reports/definitions/ don't all need updating —
   *  every reader already treats a missing value as `[]`. */
  formulas: z.array(analysisFormulaSchema).optional(),
  sortColumn: z.string().optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
  limit: z.number().int().positive().max(5000).optional(),
});
export type AnalysisConfig = z.infer<typeof analysisConfigSchema>;

// ---------- Conditional formatting (cell color-coding) ----------

export const formatRuleOpSchema = z.enum(["gt", "gte", "lt", "lte", "eq", "neq"]);
export type FormatRuleOp = z.infer<typeof formatRuleOpSchema>;

export const FORMAT_COLORS = [
  { value: "red", bg: "#fee2e2", text: "#991b1b" },
  { value: "yellow", bg: "#fef9c3", text: "#854d0e" },
  { value: "green", bg: "#dcfce7", text: "#166534" },
  { value: "blue", bg: "#dbeafe", text: "#1e40af" },
] as const;
export type FormatColor = (typeof FORMAT_COLORS)[number]["value"];

export const formatRuleSchema = z.object({
  column: z.string().min(1),
  op: formatRuleOpSchema,
  value: z.number(),
  color: z.enum(["red", "yellow", "green", "blue"]),
});
export type FormatRule = z.infer<typeof formatRuleSchema>;

// ---------- Dashboards (visuals built on the analysis engine) ----------

export const visualTypeSchema = z.enum(["kpi", "table", "bar", "line", "pie", "gauge", "crosstab"]);
export type VisualType = z.infer<typeof visualTypeSchema>;

export const visualSpecSchema = z.object({
  type: visualTypeSchema,
  /** Base analysis config. Does NOT include the shared tab date-range filter
   *  — that's appended at run time when useTabDateRange is true. */
  config: analysisConfigSchema,
  /** Append a gte/lte filter on the dataset's defaultDateField from the
   *  dashboard tab's shared date range control. */
  useTabDateRange: z.boolean().default(false),
  /** Append an eq filter on the dataset's defaultDateField for today's or
   *  yesterday's date, computed fresh at query time — for KPI panels like
   *  "Payments Made Today" that need a fixed relative day rather than the
   *  tab's shared (and user-adjustable) date range. Mutually exclusive with
   *  `useTabDateRange` in practice, though nothing enforces that. */
  relativeDateFilter: z.enum(["today", "yesterday"]).optional(),
  /** Category/x-axis column for bar/line/pie (a groupBy column or plain column). */
  labelColumn: z.string().optional(),
  /** One or more numeric output columns to plot as series (bar/line) or the
   *  single value (pie's slice size). */
  valueColumns: z.array(z.string()).default([]),
  /** Output column to render as the big number for a "kpi" visual, or as the
   *  needle position for a "gauge" visual. */
  kpiColumn: z.string().optional(),
  /** "gauge" visual only — the scale's upper bound (lower bound is always 0).
   *  The track renders as three equal red/yellow/green bands with the
   *  current value marked at its position along the scale. */
  gaugeMax: z.number().positive().optional(),
  /** "gauge" visual only — an output column (from the same query result row
   *  as kpiColumn) whose value is used as the scale's upper bound instead of
   *  the fixed `gaugeMax` number — e.g. a "budgeted_hours" sum next to an
   *  "actual_hours" sum, so the gauge tracks a real budget/target per period
   *  instead of a hardcoded goal. Takes priority over `gaugeMax` when set
   *  and the column resolves to a positive number. */
  budgetColumn: z.string().optional(),
  /** "bar" visual only — stack multiple value columns in one bar per label
   *  instead of rendering them as side-by-side bars. */
  stacked: z.boolean().optional(),
  /** "bar"/"pie" only — cap the chart to its top N categories (ranked by the
   *  first value column's magnitude) so a long-tail dataset doesn't render
   *  as an unreadable wall of bars/slices. */
  topN: z.number().int().positive().optional(),
  /** When `topN` is set, bucket the remaining categories into one "Others"
   *  bar/slice (summed) instead of just dropping them. */
  showOthers: z.boolean().optional(),
  /** "crosstab" visual only — the column whose distinct values become
   *  pivoted column headers. Rows come from `labelColumn`, cell values are
   *  `valueColumns[0]` summed per (label, header) pair — a client-side pivot
   *  of an already-flat, already-aggregated query result (no backend
   *  changes needed: the underlying AnalysisConfig just groups by both
   *  columns). */
  crosstabHeaderColumn: z.string().optional(),
  /** Set when this panel was added "from a saved analysis" (My Reports) —
   *  `config` is a snapshot copied in at add/refresh time, not a live
   *  reference; re-picking the same analysis (via "Refresh from source")
   *  re-copies its current config. Purely informational otherwise. */
  savedReportId: z.string().optional(),
  /** Cell color-coding for the table view — carried over from a saved
   *  analysis (or set directly), same shape as CustomReport.formatRules. */
  formatRules: z.array(formatRuleSchema).optional(),
  /** Table view only — numeric columns to continuously shade (light to dark)
   *  by each cell's magnitude relative to that column's min/max across the
   *  displayed rows, instead of (or alongside) discrete FormatRule
   *  thresholds. */
  colorSpectrumColumns: z.array(z.string()).optional(),
});
export type VisualSpec = z.infer<typeof visualSpecSchema>;

export const customReportInputSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullish(),
  config: analysisConfigSchema,
  /** How to render this saved analysis — table (default) or a chart, same
   *  visual fields a Dashboard panel has. Kept separate from `config` so
   *  the query definition stays exactly an AnalysisConfig. */
  visualType: visualTypeSchema.optional(),
  // nullish (not optional): the PATCH route only writes a field when it's
  // present at all, so a client clearing a chart's label/KPI column back to
  // "none" has to be able to send an explicit null — sending `undefined`
  // is indistinguishable from "not touching this field" once JSON-encoded
  // (JSON.stringify drops undefined keys), so the old value would never
  // actually get cleared, including the dangling reference left behind by a
  // dataset change.
  labelColumn: z.string().nullish(),
  valueColumns: z.array(z.string()).optional(),
  kpiColumn: z.string().nullish(),
  /** Cell color-coding for the table view — e.g. balance > $1000 → red. */
  formatRules: z.array(formatRuleSchema).optional(),
  /** Numeric columns to continuously shade by magnitude — see
   *  VisualSpec.colorSpectrumColumns for the same feature on dashboard
   *  panels. */
  colorSpectrumColumns: z.array(z.string()).optional(),
  /** A chart shown above this analysis (and embedded above it in PDF
   *  export) — independent of `visualType`, so even a table-type analysis
   *  can carry a graphic. Usually picked from the Graphics Library, stored
   *  as a snapshot copy (same "copy not reference" convention as a
   *  dashboard panel's `savedReportId`). */
  headerVisual: visualSpecSchema.nullish(),
  headerVisualTitle: z.string().max(120).nullish(),
});
export type CustomReportInput = z.infer<typeof customReportInputSchema>;

export interface CustomReport {
  id: string;
  name: string;
  description: string | null;
  config: AnalysisConfig;
  visualType: VisualType;
  labelColumn: string | null;
  valueColumns: string[];
  kpiColumn: string | null;
  formatRules: FormatRule[];
  colorSpectrumColumns: string[];
  headerVisual: VisualSpec | null;
  headerVisualTitle: string | null;
  createdAt: string;
  updatedAt: string;
}

export const dashboardPanelSchema = z.object({
  id: z.string(),
  title: z.string(),
  size: z.enum(["third", "half", "full"]).default("half"),
  visual: visualSpecSchema,
  /** When set, this panel embeds an existing Report Center prebuilt report
   *  (by its PrebuiltReportDef key) instead of rendering `visual` — needed
   *  for reports with bespoke `run` logic (e.g. date-bucketed aging
   *  reports) that can't be expressed as a plain AnalysisConfig. `visual`
   *  is still populated with an inert placeholder in this case, purely so
   *  every existing call site that assumes it's always present keeps
   *  working — it's simply never rendered when reportKey is set. */
  reportKey: z.string().optional(),
  /** Filter param overrides for the embedded report (keyed by the report's
   *  own ReportFilterDef keys, e.g. "crew"). Anything not set here falls
   *  back to the report's own default filter values, computed fresh on
   *  every render — so a date-range default like "this month" never goes
   *  stale in a saved dashboard. */
  reportParams: z.record(z.string()).optional(),
});
export type DashboardPanel = z.infer<typeof dashboardPanelSchema>;

export const dashboardTabSchema = z.object({
  id: z.string(),
  name: z.string(),
  panels: z.array(dashboardPanelSchema).default([]),
  /** Show a shared date-range control for this tab (applies to any panel
   *  whose visual has useTabDateRange: true). */
  useDateFilter: z.boolean().default(false),
});
export type DashboardTab = z.infer<typeof dashboardTabSchema>;

export const dashboardConfigSchema = z.object({
  tabs: z.array(dashboardTabSchema).default([]),
});
export type DashboardConfig = z.infer<typeof dashboardConfigSchema>;

export const dashboardInputSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullish(),
  config: dashboardConfigSchema,
});
export type DashboardInput = z.infer<typeof dashboardInputSchema>;

// ---------- Graphics Library (reusable panel-level visuals) ----------

export const savedGraphicInputSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullish(),
  category: z.string().max(60).nullish(),
  visual: visualSpecSchema,
});
export type SavedGraphicInput = z.infer<typeof savedGraphicInputSchema>;

export interface SavedGraphic {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  visual: VisualSpec;
  createdAt: string;
  updatedAt: string;
}

export interface Dashboard {
  id: string;
  name: string;
  description: string | null;
  config: DashboardConfig;
  /** True when this dashboard was auto-cloned from a system template
   *  (see ensureSystemDashboardsSeeded) rather than created by a user.
   *  Purely informational — the row is a normal, fully editable dashboard. */
  isSystemSeeded: boolean;
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
  /**
   * Row key to group by, rendered as a full-width divider header instead of
   * a regular column (e.g. "group_type" for breakdown reports like New
   * Client Count). A header renders whenever this key's value changes
   * between consecutive rows.
   */
  sectionColumn?: string;
  /** When true (used with sectionColumn), also render a per-group subtotal
   *  row summing each totalable column's values within that group. */
  groupSubtotals?: boolean;
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
   * For dateRange: a preset key — "this_month" | "last_month" | "last_30" |
   * "last_90" | "this_year" | "all_time". For other types: the literal
   * default value.
   */
  defaultValue?: string;
  placeholder?: string;
}
