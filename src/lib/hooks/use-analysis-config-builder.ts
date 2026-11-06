import { useMemo, useState } from "react";
import { useCustomFieldDefs } from "@/lib/hooks/use-client-custom-fields";
import {
  CUSTOM_FIELD_DATASETS,
  DATASET_MAP,
  customFieldKey,
  relationsFor,
  resolveReportField,
} from "@/lib/reports/datasets";
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
  /** Column to combine with; empty when `rightConst` is used instead. */
  right: string;
  /** A fixed number typed as text ("" = unused) — e.g. 100 for "× 100". */
  rightConst: string;
  displayType: FormulaDisplayType;
}

export interface BuilderSort {
  column: string;
  dir: "asc" | "desc";
}

/** Saved formula → builder row (right/rightConst are mutually exclusive). */
function toBuilderFormula(f: NonNullable<AnalysisConfig["formulas"]>[number]): BuilderFormula {
  return {
    name: f.name,
    left: f.left,
    operator: f.operator,
    right: f.right ?? "",
    rightConst: f.rightConst !== undefined ? String(f.rightConst) : "",
    displayType: f.displayType,
  };
}

/** Builder row → saved formula, or null while it's still incomplete. */
function toAnalysisFormula(f: BuilderFormula): NonNullable<AnalysisConfig["formulas"]>[number] | null {
  if (!f.name || !f.left) return null;
  const base = { name: f.name, left: f.left, operator: f.operator, displayType: f.displayType };
  if (f.right) return { ...base, right: f.right };
  const n = parseFloat(f.rightConst);
  if (f.rightConst.trim() !== "" && Number.isFinite(n)) return { ...base, rightConst: n };
  return null;
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
  /** Joined relation aliases (e.g. "client"). */
  joins: string[];
  /** Extra sort levels after the first (sortColumn/sortDir is level 1). */
  sorts: BuilderSort[];
  sortColumn: string;
  sortDir: "asc" | "desc";
  setJoins: (v: string[] | ((prev: string[]) => string[])) => void;
  /** Join on/off — turning one off also drops every column/filter/sort using it. */
  toggleJoin: (alias: string, on: boolean) => void;
  /** Relations this dataset can join to (empty when none). */
  availableRelations: { alias: string; label: string; dataset: string }[];
  /** The dataset's own columns only (no joined / custom). */
  baseFields: DatasetField[];
  /** Client custom fields exposed as columns for this dataset. */
  customFields: DatasetField[];
  setSorts: (v: BuilderSort[] | ((prev: BuilderSort[]) => BuilderSort[])) => void;
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
  /** Output columns a formula may reference (excludes formulas themselves). */
  outputOptions: { value: string; label: string }[];
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
      const field = resolveReportField(
        initial?.dataset ?? "",
        f.column,
        (initial?.joins ?? []).map((j) => j.alias)
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
    (initial?.formulas ?? []).map(toBuilderFormula)
  );
  const [joins, setJoins] = useState<string[]>((initial?.joins ?? []).map((j) => j.alias));
  const [sorts, setSorts] = useState<BuilderSort[]>(() => {
    const saved = initial?.sorts ?? [];
    return saved.length > 1 ? saved.slice(1).map((x) => ({ column: x.column, dir: x.dir })) : [];
  });
  const [sortColumn, setSortColumn] = useState(
    initial?.sorts?.[0]?.column ?? initial?.sortColumn ?? ""
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">(
    initial?.sorts?.[0]?.dir ?? initial?.sortDir ?? "asc"
  );

  const datasetDef = dataset ? DATASET_MAP[dataset] : undefined;
  const baseFields = useMemo(() => datasetDef?.fields ?? [], [datasetDef]);
  const { data: customFieldDefs } = useCustomFieldDefs();
  const customFields = useMemo<DatasetField[]>(() => {
    if (!CUSTOM_FIELD_DATASETS.has(dataset)) return [];
    return (customFieldDefs ?? []).map((d) => ({
      key: customFieldKey(d.id),
      label: `Custom: ${d.name}`,
      type: d.fieldType === "number" ? ("number" as const) : ("text" as const),
      totalable: d.fieldType === "number",
    }));
  }, [dataset, customFieldDefs]);
  const availableRelations = useMemo(
    () => relationsFor(dataset).map(([alias, rel]) => ({ alias, label: rel.label, dataset: rel.dataset })),
    [dataset]
  );
  const joinedFields = useMemo<DatasetField[]>(
    () =>
      joins.flatMap((alias) => {
        const rel = relationsFor(dataset).find(([a]) => a === alias)?.[1];
        const relDef = rel ? DATASET_MAP[rel.dataset] : undefined;
        if (!rel || !relDef) return [];
        return relDef.fields.map((f) => ({
          key: `${alias}.${f.key}`,
          label: `${rel.label}: ${f.label}`,
          type: f.type,
          totalable: false,
          options: f.options,
        }));
      }),
    [dataset, joins]
  );
  const fields = useMemo(
    () => [...baseFields, ...customFields, ...joinedFields],
    [baseFields, customFields, joinedFields]
  );

  const toggleJoin = (alias: string, on: boolean) => {
    if (on) {
      setJoins((prev) => (prev.includes(alias) ? prev : [...prev, alias]));
      return;
    }
    const uses = (key: string) => key.startsWith(`${alias}.`);
    setJoins((prev) => prev.filter((a) => a !== alias));
    setColumns((prev) => prev.filter((k) => !uses(k)));
    setFilters((prev) => prev.filter((f) => !uses(f.column)));
    setGroupBy((prev) => prev.filter((k) => !uses(k)));
    setAggregates((prev) => prev.filter((a) => !uses(a.column)));
    setSorts((prev) => prev.filter((x) => !uses(x.column)));
    setSortColumn((prev) => (uses(prev) ? "" : prev));
    setFormulas((prev) => prev.filter((f) => !uses(f.left) && !uses(f.right)));
  };
  // Subtotal mode keeps row-level detail (grouped under a divider header
  // with a per-group subtotal) instead of collapsing to one row per group —
  // it's a separate, plain-columns query, so it's excluded from `aggregated`.
  const subtotalMode = subtotals && groupBy.length > 0;
  const aggregated = !subtotalMode && (groupBy.length > 0 || aggregates.length > 0);

  const numericFields = useMemo(
    () => fields.filter((f) => NUMERIC_FIELD_TYPES.includes(f.type)),
    [fields]
  );

  const outputOptions = useMemo(() => {
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

  // Formula columns can be sorted on too (applied after they're computed).
  const sortOptions = useMemo(
    () => [
      ...outputOptions,
      ...formulas.filter((f) => f.name).map((f) => ({ value: f.name, label: f.name })),
    ],
    [outputOptions, formulas]
  );

  const handleDatasetChange = (next: string) => {
    setDataset(next);
    setColumns(DATASET_MAP[next]?.fields.map((f) => f.key) ?? []);
    setFilters([]);
    setGroupBy([]);
    setAggregates([]);
    setSubtotals(false);
    setFormulas([]);
    setJoins([]);
    setSorts([]);
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
      formulas: formulas
        .map(toAnalysisFormula)
        .filter((f): f is NonNullable<typeof f> => f !== null),
      joins: joins.map((alias) => ({ alias })),
      // Level 1 stays in sortColumn/sortDir (older readers); sorts carries the
      // full ordered list only when there's more than one level.
      sortColumn: sortColumn || undefined,
      sortDir,
      sorts:
        sortColumn && sorts.some((x) => x.column)
          ? [{ column: sortColumn, dir: sortDir }, ...sorts.filter((x) => x.column)]
          : undefined,
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
    joins,
    sorts,
    setJoins,
    setSorts,
    toggleJoin,
    availableRelations,
    baseFields,
    customFields,
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
    outputOptions,
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
  const joinAliases = (cfg.joins ?? []).map((j) => j.alias);
  builder.setFilters(
    (cfg.filters ?? []).map((f) => {
      const field = resolveReportField(cfg.dataset, f.column, joinAliases);
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
  builder.setFormulas((cfg.formulas ?? []).map(toBuilderFormula));
  builder.setJoins((cfg.joins ?? []).map((j) => j.alias));
  const savedSorts = cfg.sorts ?? [];
  builder.setSorts(savedSorts.slice(1).map((x) => ({ column: x.column, dir: x.dir })));
  builder.setSortColumn(savedSorts[0]?.column ?? cfg.sortColumn ?? "");
  builder.setSortDir(savedSorts[0]?.dir ?? cfg.sortDir ?? "asc");
}
