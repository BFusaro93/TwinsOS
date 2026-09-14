import { useMemo, useState } from "react";
import { DATASET_MAP } from "@/lib/reports/datasets";
import type { ReportDataset } from "@/types/crm-reports";
import type {
  AggregateFn,
  AnalysisConfig,
  AnalysisFilter,
  DatasetField,
  FilterOp,
  FormulaDisplayType,
  FormulaOperator,
} from "@/types/crm-reports";

// ============================================================
// Shared builder state for an AnalysisConfig — used by both the
// full-page Custom Analysis Builder and dashboard panel editors.
// ============================================================

export interface BuilderFilter {
  column: string;
  op: FilterOp;
  value: string;
}

export interface BuilderAggregate {
  column: string;
  fn: AggregateFn;
}

export interface BuilderFormula {
  name: string;
  left: string;
  operator: FormulaOperator;
  right: string;
  displayType: FormulaDisplayType;
}

export const FORMULA_OPERATOR_OPTIONS: { value: FormulaOperator; label: string }[] = [
  { value: "+", label: "+ (add)" },
  { value: "-", label: "− (subtract)" },
  { value: "*", label: "× (multiply)" },
  { value: "/", label: "÷ (divide)" },
];

export const FORMULA_DISPLAY_TYPE_OPTIONS: { value: FormulaDisplayType; label: string }[] = [
  { value: "number", label: "Number" },
  { value: "money", label: "Money" },
  { value: "hours", label: "Hours" },
  { value: "percent", label: "Percent" },
];

export const OP_OPTIONS: { value: FilterOp; label: string }[] = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "not equals" },
  { value: "gt", label: "greater than" },
  { value: "gte", label: "at least" },
  { value: "lt", label: "less than" },
  { value: "lte", label: "at most" },
  { value: "contains", label: "contains" },
  { value: "in", label: "is any of" },
  { value: "is_null", label: "is empty" },
  { value: "not_null", label: "is not empty" },
];

export const FN_OPTIONS: { value: AggregateFn; label: string }[] = [
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
  { value: "count", label: "Count" },
];

export const NUMERIC_FIELD_TYPES = ["money", "number", "hours", "percent", "bps"];

export function aggregateAlias(agg: BuilderAggregate): string {
  return agg.column === "*" ? "count_all" : `${agg.fn}_${agg.column}`;
}

export function aggregateLabel(agg: BuilderAggregate, fields: DatasetField[]): string {
  if (agg.column === "*") return "Count of All Rows";
  const field = fields.find((f) => f.key === agg.column);
  const fn = FN_OPTIONS.find((f) => f.value === agg.fn)?.label ?? agg.fn;
  return `${fn} of ${field?.label ?? agg.column}`;
}

/** Convert a builder filter (string value) into an engine filter (typed value). */
export function toAnalysisFilter(
  filter: BuilderFilter,
  fields: DatasetField[]
): AnalysisFilter | null {
  if (!filter.column) return null;
  if (filter.op === "is_null" || filter.op === "not_null") {
    return { column: filter.column, op: filter.op };
  }
  if (filter.value === "") return null;
  const field = fields.find((f) => f.key === filter.column);
  if (filter.op === "in") {
    const parts = filter.value
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v !== "");
    if (parts.length === 0) return null;
    return { column: filter.column, op: filter.op, value: parts };
  }
  if (field?.type === "money") {
    const dollars = parseFloat(filter.value);
    if (Number.isNaN(dollars)) return null;
    return { column: filter.column, op: filter.op, value: Math.round(dollars * 100) };
  }
  if (field?.type === "bps") {
    // Displayed/entered as a percent (formatCellValue shows bps/100 with a
    // "%" suffix) but stored as basis points, same cents-vs-dollars pattern.
    const percent = parseFloat(filter.value);
    if (Number.isNaN(percent)) return null;
    return { column: filter.column, op: filter.op, value: Math.round(percent * 100) };
  }
  if (field?.type === "number" || field?.type === "hours" || field?.type === "percent") {
    const num = parseFloat(filter.value);
    if (Number.isNaN(num)) return null;
    return { column: filter.column, op: filter.op, value: num };
  }
  if (field?.type === "boolean") {
    return { column: filter.column, op: filter.op, value: filter.value === "true" };
  }
  return { column: filter.column, op: filter.op, value: filter.value };
}

export function filterValueInputType(field: DatasetField | undefined): string {
  if (!field) return "text";
  if (field.type === "date" || field.type === "datetime") return "date";
  if (NUMERIC_FIELD_TYPES.includes(field.type)) return "number";
  return "text";
}

export interface AnalysisConfigBuilder {
  dataset: string;
  columns: string[];
  filters: BuilderFilter[];
  groupBy: string[];
  aggregates: BuilderAggregate[];
  subtotals: boolean;
  formulas: BuilderFormula[];
  sortColumn: string;
  sortDir: "asc" | "desc";
  setDataset: (v: string) => void;
  setColumns: (v: string[] | ((prev: string[]) => string[])) => void;
  setFilters: (v: BuilderFilter[] | ((prev: BuilderFilter[]) => BuilderFilter[])) => void;
  setGroupBy: (v: string[] | ((prev: string[]) => string[])) => void;
  setAggregates: (
    v: BuilderAggregate[] | ((prev: BuilderAggregate[]) => BuilderAggregate[])
  ) => void;
  setSubtotals: (v: boolean) => void;
  setFormulas: (v: BuilderFormula[] | ((prev: BuilderFormula[]) => BuilderFormula[])) => void;
  setSortColumn: (v: string) => void;
  setSortDir: (v: "asc" | "desc") => void;
  handleDatasetChange: (next: string) => void;
  datasetDef: ReportDataset | undefined;
  fields: DatasetField[];
  numericFields: DatasetField[];
  /** True only for a full rollup (one row per group, detail columns dropped). */
  grouped: boolean;
  /** True when Group By + "keep detail rows" subtotals are both on. */
  subtotalMode: boolean;
  sortOptions: { value: string; label: string }[];
  canRun: boolean;
  buildConfig: () => AnalysisConfig | null;
}

/**
 * Encapsulates all state + derived values for building an AnalysisConfig
 * interactively. `onDatasetChange` fires an extra reset hook (e.g. clearing a
 * chart's label/value column choices) beyond the state this hook owns.
 */
export function useAnalysisConfigBuilder(
  initial?: AnalysisConfig,
  onDatasetChange?: (next: string) => void
): AnalysisConfigBuilder {
  const [dataset, setDataset] = useState(initial?.dataset ?? "");
  const [columns, setColumns] = useState<string[]>(initial?.columns ?? []);
  const [filters, setFilters] = useState<BuilderFilter[]>(() =>
    (initial?.filters ?? []).map((f) => {
      const field = DATASET_MAP[initial?.dataset ?? ""]?.fields.find(
        (df) => df.key === f.column
      );
      let value = f.value === undefined ? "" : String(f.value);
      if (field?.type === "money" && typeof f.value === "number") {
        value = String(f.value / 100);
      }
      return { column: f.column, op: f.op, value };
    })
  );
  const [groupBy, setGroupBy] = useState<string[]>(initial?.groupBy ?? []);
  const [aggregates, setAggregates] = useState<BuilderAggregate[]>(
    (initial?.aggregates ?? []).map((a) => ({ column: a.column, fn: a.fn }))
  );
  const [subtotals, setSubtotals] = useState(initial?.subtotals ?? false);
  const [formulas, setFormulas] = useState<BuilderFormula[]>(
    (initial?.formulas ?? []).map((f) => ({
      name: f.name,
      left: f.left,
      operator: f.operator,
      right: f.right,
      displayType: f.displayType,
    }))
  );
  const [sortColumn, setSortColumn] = useState(initial?.sortColumn ?? "");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initial?.sortDir ?? "asc");

  const datasetDef = dataset ? DATASET_MAP[dataset] : undefined;
  const fields = useMemo(() => datasetDef?.fields ?? [], [datasetDef]);
  // Subtotal mode keeps row-level detail (grouped under a divider header
  // with a per-group subtotal) instead of collapsing to one row per group —
  // it's a separate, plain-columns query, so it's excluded from `aggregated`.
  const subtotalMode = subtotals && groupBy.length > 0;
  const aggregated = !subtotalMode && (groupBy.length > 0 || aggregates.length > 0);

  const numericFields = useMemo(
    () => fields.filter((f) => NUMERIC_FIELD_TYPES.includes(f.type)),
    [fields]
  );

  const sortOptions = useMemo(() => {
    if (aggregated) {
      return [
        ...groupBy.map((key) => ({
          value: key,
          label: fields.find((f) => f.key === key)?.label ?? key,
        })),
        ...aggregates
          .filter((a) => a.column)
          .map((a) => ({ value: aggregateAlias(a), label: aggregateLabel(a, fields) })),
      ];
    }
    return columns.map((key) => ({
      value: key,
      label: fields.find((f) => f.key === key)?.label ?? key,
    }));
  }, [aggregated, groupBy, aggregates, columns, fields]);

  const handleDatasetChange = (next: string) => {
    setDataset(next);
    setColumns(DATASET_MAP[next]?.fields.map((f) => f.key) ?? []);
    setFilters([]);
    setGroupBy([]);
    setAggregates([]);
    setSubtotals(false);
    setFormulas([]);
    setSortColumn("");
    onDatasetChange?.(next);
  };

  const buildConfig = (): AnalysisConfig | null => {
    if (!dataset) return null;
    return {
      dataset,
      columns: aggregated ? [] : columns,
      filters: filters
        .map((f) => toAnalysisFilter(f, fields))
        .filter((f): f is AnalysisFilter => f !== null),
      groupBy,
      aggregates: aggregates.filter((a) => a.column),
      subtotals: subtotalMode,
      formulas: formulas.filter((f) => f.name && f.left && f.right),
      sortColumn: sortColumn || undefined,
      sortDir,
      limit: 500,
    };
  };

  const canRun =
    !!dataset &&
    (subtotalMode
      ? columns.length > 0
      : aggregated
        ? groupBy.length + aggregates.length > 0
        : columns.length > 0);

  return {
    dataset,
    columns,
    filters,
    groupBy,
    aggregates,
    subtotals,
    formulas,
    sortColumn,
    sortDir,
    setDataset,
    setColumns,
    setFilters,
    setGroupBy,
    setAggregates,
    setSubtotals,
    setFormulas,
    setSortColumn,
    setSortDir,
    handleDatasetChange,
    datasetDef,
    fields,
    numericFields,
    grouped: aggregated,
    subtotalMode,
    sortOptions,
    canRun,
    buildConfig,
  };
}

/**
 * Re-hydrate a builder's state from a saved AnalysisConfig (e.g. once an
 * existing custom report or dashboard panel loads asynchronously). Bypasses
 * handleDatasetChange since we're restoring saved fields, not resetting them.
 */
export function hydrateBuilder(builder: AnalysisConfigBuilder, cfg: AnalysisConfig) {
  builder.setDataset(cfg.dataset);
  builder.setColumns(cfg.columns ?? []);
  const fields = DATASET_MAP[cfg.dataset]?.fields ?? [];
  builder.setFilters(
    (cfg.filters ?? []).map((f) => {
      const field = fields.find((df) => df.key === f.column);
      let value = f.value === undefined ? "" : String(f.value);
      if (field?.type === "money" && typeof f.value === "number") {
        value = String(f.value / 100);
      }
      return { column: f.column, op: f.op, value };
    })
  );
  builder.setGroupBy(cfg.groupBy ?? []);
  builder.setAggregates((cfg.aggregates ?? []).map((a) => ({ column: a.column, fn: a.fn })));
  builder.setSubtotals(cfg.subtotals ?? false);
  builder.setFormulas(
    (cfg.formulas ?? []).map((f) => ({
      name: f.name,
      left: f.left,
      operator: f.operator,
      right: f.right,
      displayType: f.displayType,
    }))
  );
  builder.setSortColumn(cfg.sortColumn ?? "");
  builder.setSortDir(cfg.sortDir ?? "asc");
}
