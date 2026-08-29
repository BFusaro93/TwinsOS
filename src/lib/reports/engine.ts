import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AnalysisConfig,
  ReportColumnDef,
  ReportResult,
  ReportResultRow,
} from "@/types/crm-reports";
import { getDataset, getDatasetField } from "@/lib/reports/datasets";

// ============================================================
// Report engine — validates analysis configs against the dataset
// catalog and executes them through the crm_run_report RPC.
// The RPC re-validates every identifier server-side; this layer
// exists to fail fast with friendly messages and to shape results.
// ============================================================

const AGG_LABELS: Record<string, string> = {
  sum: "Sum of",
  avg: "Avg of",
  min: "Min of",
  max: "Max of",
  count: "Count of",
};

/** Subtotal mode keeps row-level detail (grouped under a divider header with
 *  a per-group subtotal) instead of collapsing to one row per group — it
 *  only applies when there's actually a group column to key the sections on. */
export function isSubtotalMode(config: AnalysisConfig): boolean {
  return !!config.subtotals && config.groupBy.length > 0;
}

export function validateAnalysisConfig(config: AnalysisConfig): string | null {
  const dataset = getDataset(config.dataset);
  if (!dataset) return `Unknown dataset: ${config.dataset}`;

  const fieldKeys = new Set(dataset.fields.map((f) => f.key));
  // "Aggregated" mode covers both grouped rollup queries (one or more Group
  // By columns) and ungrouped grand-total queries (aggregates with zero
  // Group By columns — Postgres treats the whole filtered set as one group).
  // Subtotal mode is a separate, plain-columns query (grouping happens
  // client-side for display only), so it's excluded here.
  const subtotalMode = isSubtotalMode(config);
  const aggregated = !subtotalMode && (config.groupBy.length > 0 || config.aggregates.length > 0);

  if (!aggregated && config.columns.length === 0) {
    return "Select at least one column.";
  }
  for (const col of config.columns) {
    if (!fieldKeys.has(col)) return `Unknown column: ${col}`;
  }
  for (const col of config.groupBy) {
    if (!fieldKeys.has(col)) return `Unknown group column: ${col}`;
  }
  for (const agg of config.aggregates) {
    if (agg.column !== "*" && !fieldKeys.has(agg.column)) {
      return `Unknown aggregate column: ${agg.column}`;
    }
    if (agg.column === "*" && agg.fn !== "count") {
      return "Only Count can aggregate all rows (*).";
    }
  }
  for (const filter of config.filters) {
    if (!fieldKeys.has(filter.column)) {
      return `Unknown filter column: ${filter.column}`;
    }
    if (
      filter.op !== "is_null" &&
      filter.op !== "not_null" &&
      (filter.value === undefined || filter.value === "")
    ) {
      return `Filter on "${filter.column}" is missing a value.`;
    }
  }

  const baseColumnKeys = new Set(baseColumnsForAnalysis(config).map((c) => c.key));
  const formulaNames = new Set<string>();
  for (const formula of config.formulas ?? []) {
    if (baseColumnKeys.has(formula.name) || formulaNames.has(formula.name)) {
      return `Formula name "${formula.name}" conflicts with an existing column.`;
    }
    if (!baseColumnKeys.has(formula.left)) {
      return `Unknown formula column: ${formula.left}`;
    }
    if (!baseColumnKeys.has(formula.right)) {
      return `Unknown formula column: ${formula.right}`;
    }
    formulaNames.add(formula.name);
  }
  return null;
}

export function aggregateAlias(fn: string, column: string): string {
  return column === "*" ? "count_all" : `${fn}_${column}`;
}

const FORMULA_LABELS: Record<string, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };

/** Formula columns to append, resolved against the analysis's own base
 *  output columns (so a formula can only ever reference a real, already-
 *  whitelisted column/aggregate — never arbitrary text). */
function formulaColumnsFor(
  config: AnalysisConfig,
  baseColumns: ReportColumnDef[]
): ReportColumnDef[] {
  const baseByKey = new Map(baseColumns.map((c) => [c.key, c]));
  return (config.formulas ?? [])
    .filter((f) => baseByKey.has(f.left) && baseByKey.has(f.right))
    .map((f) => ({
      key: f.name,
      label: `${baseByKey.get(f.left)?.label ?? f.left} ${FORMULA_LABELS[f.operator]} ${baseByKey.get(f.right)?.label ?? f.right}`,
      type: f.displayType,
      totalable: f.displayType !== "percent",
    }));
}

/** Output column defs for an analysis config's base query — excludes
 *  formula columns (used both as the real output shape before formulas are
 *  appended, and as the whitelist formulas may reference). */
function baseColumnsForAnalysis(config: AnalysisConfig): ReportColumnDef[] {
  const subtotalMode = isSubtotalMode(config);
  const aggregated = !subtotalMode && (config.groupBy.length > 0 || config.aggregates.length > 0);
  if (!aggregated) {
    const columns = subtotalMode && !config.columns.includes(config.groupBy[0])
      ? [config.groupBy[0], ...config.columns]
      : config.columns;
    return columns.map((key) => {
      const field = getDatasetField(config.dataset, key);
      return {
        key,
        label: field?.label ?? key,
        type: field?.type ?? "text",
        totalable: field?.totalable ?? (field?.type === "money" || field?.type === "hours"),
      };
    });
  }
  const groupCols: ReportColumnDef[] = config.groupBy.map((key) => {
    const field = getDatasetField(config.dataset, key);
    return { key, label: field?.label ?? key, type: field?.type ?? "text", totalable: false };
  });
  const aggCols: ReportColumnDef[] = config.aggregates.map((agg) => {
    if (agg.column === "*") {
      return { key: "count_all", label: "Count", type: "number" as const, totalable: true };
    }
    const field = getDatasetField(config.dataset, agg.column);
    const type =
      agg.fn === "count"
        ? ("number" as const)
        : field?.type === "money" || field?.type === "hours" || field?.type === "percent"
          ? field.type
          : ("number" as const);
    return {
      key: aggregateAlias(agg.fn, agg.column),
      label: `${AGG_LABELS[agg.fn]} ${field?.label ?? agg.column}`,
      type,
      // averages/mins/maxes shouldn't be summed in a totals row
      totalable: agg.fn === "sum" || agg.fn === "count",
    };
  });
  return [...groupCols, ...aggCols];
}

/** Output column defs for an analysis config (drives table rendering + CSV)
 *  — base columns plus any calculated formula columns appended at the end. */
export function columnsForAnalysis(config: AnalysisConfig): ReportColumnDef[] {
  const base = baseColumnsForAnalysis(config);
  return [...base, ...formulaColumnsFor(config, base)];
}

/** Sum totalable columns. Null when a column has no numeric values at all. */
export function computeTotals(
  columns: ReportColumnDef[],
  rows: ReportResultRow[]
): Record<string, number | null> | undefined {
  const totalable = columns.filter((c) => c.totalable);
  if (totalable.length === 0 || rows.length === 0) return undefined;
  const totals: Record<string, number | null> = {};
  for (const col of totalable) {
    let sum = 0;
    let seen = false;
    for (const row of rows) {
      const v = row[col.key];
      if (typeof v === "number" && Number.isFinite(v)) {
        sum += v;
        seen = true;
      }
    }
    totals[col.key] = seen ? sum : null;
  }
  return totals;
}

/**
 * Execute an analysis through the crm_run_report RPC and shape the result.
 * `supabase` must be an authenticated (RLS-scoped) server client.
 */
export async function runAnalysis(
  // Route handlers pass the ssr server client; typing loosely keeps this
  // compatible with the generated-Database client without fighting rpc typings.
  supabase: SupabaseClient<never, never, never> | SupabaseClient,
  config: AnalysisConfig
): Promise<ReportResult> {
  const error = validateAnalysisConfig(config);
  if (error) throw new Error(error);

  const subtotalMode = isSubtotalMode(config);
  const aggregated = !subtotalMode && (config.groupBy.length > 0 || config.aggregates.length > 0);
  const columns = columnsForAnalysis(config);
  const { data, error: rpcError } = await (supabase as SupabaseClient).rpc(
    "crm_run_report",
    {
      p_dataset: config.dataset,
      // Subtotal mode is a plain-columns query — grouping is purely a
      // client-side display concern (divider headers + per-group subtotal
      // rows), so p_group_by/p_aggregates are omitted just like the
      // ungrouped case; only true rollup mode sends them to the RPC.
      p_columns: aggregated ? [] : columns.map((c) => c.key),
      p_filters: config.filters.map((f) => ({
        column: f.column,
        op: f.op,
        value: f.value,
      })),
      p_group_by: aggregated ? config.groupBy : null,
      p_aggregates: aggregated ? config.aggregates.map((a) => ({ column: a.column, fn: a.fn })) : [],
      p_sort_column: config.sortColumn ?? null,
      p_sort_dir: config.sortDir,
      p_limit: config.limit ?? 1000,
    }
  );
  if (rpcError) throw new Error(rpcError.message);

  const payload = data as { rows: ReportResultRow[]; row_count: number };
  let rows = payload?.rows ?? [];

  // Calculated columns — computed here (never sent into the crm_run_report
  // RPC's dynamic SQL) from two of the query's own already-whitelisted
  // output columns, validated in validateAnalysisConfig above.
  const formulas = config.formulas ?? [];
  if (formulas.length > 0) {
    rows = rows.map((row) => {
      const next: ReportResultRow = { ...row };
      for (const formula of formulas) {
        const left = Number(row[formula.left]);
        const right = Number(row[formula.right]);
        if (!Number.isFinite(left) || !Number.isFinite(right)) {
          next[formula.name] = null;
          continue;
        }
        next[formula.name] =
          formula.operator === "+" ? left + right :
          formula.operator === "-" ? left - right :
          formula.operator === "*" ? left * right :
          right === 0 ? null : left / right;
      }
      return next;
    });
  }

  // Stable secondary sort by the group column so same-group rows sit
  // together for the divider header + subtotal rendering, without
  // disturbing the user's chosen primary sort order within each group.
  if (subtotalMode) {
    const groupKey = config.groupBy[0];
    rows = [...rows].sort((a, b) =>
      String(a[groupKey] ?? "").localeCompare(String(b[groupKey] ?? ""))
    );
  }

  return {
    columns,
    rows,
    totals: computeTotals(columns, rows),
    rowCount: rows.length,
    generatedAt: new Date().toISOString(),
    sectionColumn: subtotalMode ? config.groupBy[0] : undefined,
    groupSubtotals: subtotalMode,
  };
}
