import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AnalysisConfig,
  AnalysisFormula,
  ReportColumnDef,
  ReportFieldType,
  ReportResult,
  ReportResultRow,
} from "@/types/crm-reports";
import {
  getDataset,
  isCustomFieldKey,
  relationsFor,
  resolveReportField,
  type ResolvedField,
} from "@/lib/reports/datasets";

/** The org's client custom-field defs keyed by lowercase def id — only needed
 *  to label/type "cf:<id>" columns. */
export type CustomFieldDefs = Map<string, { name: string; type: "text" | "number" }>;

/** Every column key an analysis refers to (outside formulas), for custom-field lookup. */
function referencedKeys(config: AnalysisConfig): string[] {
  return [
    ...config.columns,
    ...config.groupBy,
    ...config.aggregates.map((a) => a.column),
    ...config.filters.map((f) => f.column),
    ...(config.sorts ?? []).map((x) => x.column),
    ...(config.sortColumn ? [config.sortColumn] : []),
  ];
}

async function loadCustomFieldDefs(
  supabase: SupabaseClient<never, never, never> | SupabaseClient,
  config: AnalysisConfig
): Promise<CustomFieldDefs | undefined> {
  const ids = [...new Set(referencedKeys(config).filter(isCustomFieldKey).map((k) => k.slice(3).toLowerCase()))];
  if (ids.length === 0) return undefined;
  const { data } = await (supabase as SupabaseClient)
    .from("crm_custom_field_defs")
    .select("id, name, field_type")
    .in("id", ids)
    .is("deleted_at", null);
  const map: CustomFieldDefs = new Map();
  for (const row of (data ?? []) as { id: string; name: string; field_type: string }[]) {
    map.set(row.id.toLowerCase(), { name: row.name, type: row.field_type === "number" ? "number" : "text" });
  }
  return map;
}

function joinAliases(config: AnalysisConfig): string[] {
  return (config.joins ?? []).map((j) => j.alias);
}

// ============================================================
// Report engine — validates analysis configs against the dataset
// catalog and executes them through the crm_run_report RPC.
// The RPC re-validates every identifier server-side; this layer
// exists to fail fast with friendly messages and to shape results.
// ============================================================

/** crm_run_report clamps p_limit to this many rows server-side. */
export const RPC_ROW_CAP = 5000;

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

export function validateAnalysisConfig(config: AnalysisConfig, customFields?: CustomFieldDefs): string | null {
  const dataset = getDataset(config.dataset);
  if (!dataset) return `Unknown dataset: ${config.dataset}`;

  const aliases = joinAliases(config);
  const allowedAliases = new Set(relationsFor(config.dataset).map(([alias]) => alias));
  for (const alias of aliases) {
    if (!allowedAliases.has(alias)) return `"${alias}" can't be joined to ${dataset.label}.`;
  }
  if (new Set(aliases).size !== aliases.length) return "A related dataset can only be joined once.";
  const known = (key: string) => !!resolveReportField(config.dataset, key, aliases, customFields);

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
    if (!known(col)) return `Unknown column: ${col}`;
  }
  for (const col of config.groupBy) {
    if (!known(col)) return `Unknown group column: ${col}`;
  }
  for (const agg of config.aggregates) {
    if (agg.column !== "*" && !known(agg.column)) {
      return `Unknown aggregate column: ${agg.column}`;
    }
    if (agg.column === "*" && agg.fn !== "count") {
      return "Only Count can aggregate all rows (*).";
    }
  }
  for (const filter of config.filters) {
    if (!known(filter.column)) {
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

  const baseColumnKeys = new Set(baseColumnsForAnalysis(config, customFields).map((c) => c.key));
  // A formula may build on the base columns and on any formula defined ABOVE it
  // (chaining), never on itself or a later one.
  const available = new Set(baseColumnKeys);
  for (const formula of config.formulas ?? []) {
    if (baseColumnKeys.has(formula.name) || (config.formulas ?? []).filter((f) => f.name === formula.name).length > 1) {
      return `Formula name "${formula.name}" conflicts with an existing column.`;
    }
    if (!available.has(formula.left)) {
      return `Unknown formula column: ${formula.left}`;
    }
    const hasRight = formula.right !== undefined && formula.right !== "";
    const hasConst = formula.rightConst !== undefined;
    if (hasRight === hasConst) {
      return `Formula "${formula.name}" needs either a column or a number on the right.`;
    }
    if (hasRight && !available.has(formula.right as string)) {
      return `Unknown formula column: ${formula.right}`;
    }
    if (hasConst && formula.operator === "/" && formula.rightConst === 0) {
      return `Formula "${formula.name}" divides by zero.`;
    }
    available.add(formula.name);
  }
  const outputKeys = new Set([...available]);
  for (const sort of config.sorts ?? []) {
    if (!outputKeys.has(sort.column)) return `Unknown sort column: ${sort.column}`;
  }
  return null;
}

export function aggregateAlias(fn: string, column: string): string {
  return column === "*" ? "count_all" : `${fn}_${column}`;
}

const FORMULA_LABELS: Record<string, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };

/** Formula columns to append, resolved in order against the analysis's own base
 *  output columns plus the formulas above them (so a formula can only ever
 *  reference a real, already-whitelisted column/aggregate or an earlier
 *  formula — never arbitrary text). */
function formulaColumnsFor(
  config: AnalysisConfig,
  baseColumns: ReportColumnDef[]
): ReportColumnDef[] {
  const byKey = new Map(baseColumns.map((c) => [c.key, c]));
  const out: ReportColumnDef[] = [];
  for (const f of config.formulas ?? []) {
    const hasRight = f.right !== undefined && f.right !== "";
    if (!byKey.has(f.left) || (hasRight ? !byKey.has(f.right as string) : f.rightConst === undefined)) continue;
    const leftLabel = byKey.get(f.left)?.label ?? f.left;
    const rightLabel = hasRight ? (byKey.get(f.right as string)?.label ?? (f.right as string)) : String(f.rightConst);
    const col: ReportColumnDef = {
      key: f.name,
      label: `${leftLabel} ${FORMULA_LABELS[f.operator]} ${rightLabel}`,
      type: f.displayType,
      // Only additive column-with-column formulas (a sum/difference of two
      // totalable-ish quantities) can be summed down a totals row; a product,
      // ratio, or anything with a fixed number in it (rate, margin, per-hour,
      // "plus 25") summed across rows is meaningless.
      totalable: hasRight && (f.operator === "+" || f.operator === "-") && f.displayType !== "percent",
    };
    byKey.set(col.key, col);
    out.push(col);
  }
  return out;
}

/** Evaluate one formula against a row (which already holds every earlier
 *  formula's value, so formulas chain). A `/` formula displayed as a percent is
 *  scaled ×100 here because the "percent" field type is already-scaled 0–100
 *  everywhere else (formatCellValue appends "%" without scaling). */
function evaluateFormula(formula: AnalysisFormula, row: ReportResultRow): number | null {
  // Number(null) is 0 — a missing operand must stay missing (blank), not
  // silently become 0 / "0%".
  const rawLeft = row[formula.left];
  if (rawLeft === null || rawLeft === undefined || rawLeft === "") return null;
  const left = Number(rawLeft);
  if (!Number.isFinite(left)) return null;
  let right: number;
  if (formula.rightConst !== undefined) {
    right = formula.rightConst;
  } else {
    const rawRight = row[formula.right ?? ""];
    if (rawRight === null || rawRight === undefined || rawRight === "") return null;
    right = Number(rawRight);
    if (!Number.isFinite(right)) return null;
  }
  switch (formula.operator) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/": {
      if (right === 0) return null;
      const ratio = left / right;
      return formula.displayType === "percent" ? ratio * 100 : ratio;
    }
  }
}

/** Client-side multi-level sort — used when any sort key is a formula column
 *  (the RPC only sorts by its own output columns and silently ignores anything
 *  else, so a formula sort has to happen after formulas are computed). Nulls
 *  last regardless of direction (matching the RPC's `nulls last`). */
function sortRowsBy(rows: ReportResultRow[], sorts: { column: string; dir: "asc" | "desc" }[]): ReportResultRow[] {
  return [...rows].sort((a, b) => {
    for (const { column, dir } of sorts) {
      const sign = dir === "desc" ? -1 : 1;
      const av = a[column];
      const bv = b[column];
      const aNull = av === null || av === undefined;
      const bNull = bv === null || bv === undefined;
      if (aNull && bNull) continue;
      if (aNull) return 1;
      if (bNull) return -1;
      const cmp =
        typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      if (cmp !== 0) return sign * cmp;
    }
    return 0;
  });
}

/** The analysis's effective sort keys: the multi-level `sorts` when set, else
 *  the single legacy sortColumn/sortDir. */
function effectiveSorts(config: AnalysisConfig): { column: string; dir: "asc" | "desc" }[] {
  if (config.sorts && config.sorts.length > 0) return config.sorts;
  return config.sortColumn ? [{ column: config.sortColumn, dir: config.sortDir }] : [];
}

function toColumnDef(field: ResolvedField | undefined, key: string): ReportColumnDef {
  return {
    key,
    label: field?.label ?? key,
    type: field?.type ?? "text",
    totalable: field?.totalable ?? (field?.type === "money" || field?.type === "hours"),
  };
}

/** Output column defs for an analysis config's base query — excludes
 *  formula columns (used both as the real output shape before formulas are
 *  appended, and as the whitelist formulas may reference). */
function baseColumnsForAnalysis(config: AnalysisConfig, customFields?: CustomFieldDefs): ReportColumnDef[] {
  const aliases = joinAliases(config);
  const field = (key: string) => resolveReportField(config.dataset, key, aliases, customFields);
  const subtotalMode = isSubtotalMode(config);
  const aggregated = !subtotalMode && (config.groupBy.length > 0 || config.aggregates.length > 0);
  if (!aggregated) {
    const columns = subtotalMode && !config.columns.includes(config.groupBy[0])
      ? [config.groupBy[0], ...config.columns]
      : config.columns;
    return columns.map((key) => toColumnDef(field(key), key));
  }
  const groupCols: ReportColumnDef[] = config.groupBy.map((key) => ({
    ...toColumnDef(field(key), key),
    totalable: false,
  }));
  const aggCols: ReportColumnDef[] = config.aggregates.map((agg) => {
    if (agg.column === "*") {
      return { key: "count_all", label: "Count", type: "number" as const, totalable: true };
    }
    const resolved = field(agg.column);
    const fieldType: ReportFieldType = resolved?.type ?? "text";
    const type: ReportFieldType =
      agg.fn === "count"
        ? "number"
        : agg.fn === "min" || agg.fn === "max"
          // min/max return one of the column's own values, so a date/text
          // column stays date/text — rendering it as "number" gave "NaN".
          ? fieldType
          : fieldType === "money" || fieldType === "hours" || fieldType === "percent" || fieldType === "bps"
            // sum/avg keep the unit (cents, hours, already-scaled %, bps)
            ? fieldType
            : "number";
    return {
      key: aggregateAlias(agg.fn, agg.column),
      label: `${AGG_LABELS[agg.fn]} ${resolved?.label ?? agg.column}`,
      type,
      // averages/mins/maxes shouldn't be summed in a totals row; a joined
      // column repeats per base row, so its sum would double count.
      totalable: (agg.fn === "sum" || agg.fn === "count") && resolved?.source !== "joined",
    };
  });
  return [...groupCols, ...aggCols];
}

/** Output column defs for an analysis config (drives table rendering + CSV)
 *  — base columns plus any calculated formula columns appended at the end. */
export function columnsForAnalysis(config: AnalysisConfig, customFields?: CustomFieldDefs): ReportColumnDef[] {
  const base = baseColumnsForAnalysis(config, customFields);
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
  const customFields = await loadCustomFieldDefs(supabase, config);
  const error = validateAnalysisConfig(config, customFields);
  if (error) throw new Error(error);

  const subtotalMode = isSubtotalMode(config);
  const aggregated = !subtotalMode && (config.groupBy.length > 0 || config.aggregates.length > 0);
  const columns = columnsForAnalysis(config, customFields);
  const formulas = config.formulas ?? [];
  const formulaNames = new Set(formulas.map((f) => f.name));
  const sorts = effectiveSorts(config);
  // Sort keys that are formula columns can't be ordered by the RPC.
  const sortsOnFormula = sorts.some((x) => formulaNames.has(x.column));
  // Plain-column query keys only: the RPC doesn't know the formula columns.
  const baseKeys = columns.filter((c) => !formulaNames.has(c.key)).map((c) => c.key);

  const { data, error: rpcError } = await (supabase as SupabaseClient).rpc(
    "crm_run_report",
    {
      p_dataset: config.dataset,
      // Subtotal mode is a plain-columns query — grouping is purely a
      // client-side display concern (divider headers + per-group subtotal
      // rows), so p_group_by/p_aggregates are omitted just like the
      // ungrouped case; only true rollup mode sends them to the RPC.
      p_columns: aggregated ? [] : baseKeys,
      p_filters: config.filters.map((f) => ({
        column: f.column,
        op: f.op,
        value: f.value,
      })),
      p_group_by: aggregated ? config.groupBy : null,
      p_aggregates: aggregated ? config.aggregates.map((a) => ({ column: a.column, fn: a.fn })) : [],
      p_sort_column: config.sortColumn && !formulaNames.has(config.sortColumn) ? config.sortColumn : null,
      p_sort_dir: config.sortDir,
      p_sorts: sorts.length > 0 && !sortsOnFormula ? sorts : null,
      p_joins: (config.joins ?? []).map((j) => ({ alias: j.alias })),
      // Default to the RPC's own hard cap (it clamps to 5000 anyway) so a
      // report isn't silently cut at 1000 rows with no indication.
      p_limit: config.limit ?? RPC_ROW_CAP,
    }
  );
  if (rpcError) throw new Error(rpcError.message);

  const payload = data as {
    rows: ReportResultRow[];
    row_count: number;
    /** Rows matched before LIMIT — newer RPC versions only; undefined = unknown. */
    total_count?: number | null;
  };
  let rows = payload?.rows ?? [];
  const totalCount =
    typeof payload?.total_count === "number" && Number.isFinite(payload.total_count)
      ? payload.total_count
      : undefined;
  // With an older RPC that doesn't report total_count, a result that fills the
  // row cap is assumed partial — totals and formula sorts then only cover the
  // returned rows, and the UI says so ("partial — first N rows").
  const requestedLimit = Math.min(config.limit ?? RPC_ROW_CAP, RPC_ROW_CAP);
  const truncated =
    totalCount !== undefined ? totalCount > rows.length : rows.length >= requestedLimit;

  // Calculated columns — computed here (never sent into the crm_run_report
  // RPC's dynamic SQL) from the query's own already-whitelisted output columns
  // and earlier formulas, validated in validateAnalysisConfig above. Each
  // formula sees the previous ones' results because they're written onto the
  // same row object in order.
  if (formulas.length > 0) {
    rows = rows.map((row) => {
      const next: ReportResultRow = { ...row };
      for (const formula of formulas) {
        next[formula.name] = evaluateFormula(formula, next);
      }
      return next;
    });
    // A formula sort is applied here instead, over the whole key list so mixed
    // base/formula multi-level sorts keep their order.
    if (sortsOnFormula) rows = sortRowsBy(rows, sorts);
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
    totalCount,
    truncated,
    generatedAt: new Date().toISOString(),
    sectionColumn: subtotalMode ? config.groupBy[0] : undefined,
    groupSubtotals: subtotalMode,
  };
}
