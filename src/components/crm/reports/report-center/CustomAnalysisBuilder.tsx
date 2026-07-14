"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Download,
  Play,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCSV } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { DATASET_MAP, REPORT_DATASETS } from "@/lib/reports/datasets";
import {
  useCreateCustomReport,
  useCustomReport,
  useDeleteCustomReport,
  useRunAnalysis,
  useUpdateCustomReport,
} from "@/lib/hooks/use-report-center";
import type {
  AggregateFn,
  AnalysisConfig,
  AnalysisFilter,
  DatasetField,
  FilterOp,
} from "@/types/crm-reports";
import { formatCellValue, ReportTable } from "./ReportTable";

// ── builder-local state shapes ────────────────────────────────────────────────

interface BuilderFilter {
  column: string;
  op: FilterOp;
  value: string;
}

interface BuilderAggregate {
  column: string;
  fn: AggregateFn;
}

const OP_OPTIONS: { value: FilterOp; label: string }[] = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "not equals" },
  { value: "gt", label: "greater than" },
  { value: "gte", label: "at least" },
  { value: "lt", label: "less than" },
  { value: "lte", label: "at most" },
  { value: "contains", label: "contains" },
  { value: "is_null", label: "is empty" },
  { value: "not_null", label: "is not empty" },
];

const FN_OPTIONS: { value: AggregateFn; label: string }[] = [
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
  { value: "count", label: "Count" },
];

const NUMERIC_FIELD_TYPES = ["money", "number", "hours", "percent"];

function aggregateAlias(agg: BuilderAggregate): string {
  return agg.column === "*" ? "count_all" : `${agg.fn}_${agg.column}`;
}

function aggregateLabel(agg: BuilderAggregate, fields: DatasetField[]): string {
  if (agg.column === "*") return "Count of All Rows";
  const field = fields.find((f) => f.key === agg.column);
  const fn = FN_OPTIONS.find((f) => f.value === agg.fn)?.label ?? agg.fn;
  return `${fn} of ${field?.label ?? agg.column}`;
}

/** Convert a builder filter (string value) into an engine filter (typed value). */
function toAnalysisFilter(
  filter: BuilderFilter,
  fields: DatasetField[]
): AnalysisFilter | null {
  if (!filter.column) return null;
  if (filter.op === "is_null" || filter.op === "not_null") {
    return { column: filter.column, op: filter.op };
  }
  if (filter.value === "") return null;
  const field = fields.find((f) => f.key === filter.column);
  if (field?.type === "money") {
    const dollars = parseFloat(filter.value);
    if (Number.isNaN(dollars)) return null;
    return { column: filter.column, op: filter.op, value: Math.round(dollars * 100) };
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

function filterValueInputType(field: DatasetField | undefined): string {
  if (!field) return "text";
  if (field.type === "date" || field.type === "datetime") return "date";
  if (NUMERIC_FIELD_TYPES.includes(field.type)) return "number";
  return "text";
}

// ── component ─────────────────────────────────────────────────────────────────

export function CustomAnalysisBuilder({ reportId }: { reportId?: string }) {
  const router = useRouter();
  const { data: existing, isLoading: loadingExisting } = useCustomReport(reportId);
  const createReport = useCreateCustomReport();
  const updateReport = useUpdateCustomReport();
  const deleteReport = useDeleteCustomReport();
  const runAnalysis = useRunAnalysis();

  const [name, setName] = useState("Untitled Analysis");
  const [description, setDescription] = useState("");
  const [dataset, setDataset] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<BuilderFilter[]>([]);
  const [groupBy, setGroupBy] = useState<string[]>([]);
  const [aggregates, setAggregates] = useState<BuilderAggregate[]>([]);
  const [sortColumn, setSortColumn] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [hydrated, setHydrated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // hydrate once when editing an existing analysis
  useEffect(() => {
    if (!existing || hydrated) return;
    const cfg = existing.config;
    setName(existing.name);
    setDescription(existing.description ?? "");
    setDataset(cfg.dataset);
    setColumns(cfg.columns ?? []);
    setFilters(
      (cfg.filters ?? []).map((f) => {
        const field = DATASET_MAP[cfg.dataset]?.fields.find(
          (df) => df.key === f.column
        );
        let value = f.value === undefined ? "" : String(f.value);
        if (field?.type === "money" && typeof f.value === "number") {
          value = String(f.value / 100);
        }
        return { column: f.column, op: f.op, value };
      })
    );
    setGroupBy(cfg.groupBy ?? []);
    setAggregates(
      (cfg.aggregates ?? []).map((a) => ({ column: a.column, fn: a.fn }))
    );
    setSortColumn(cfg.sortColumn ?? "");
    setSortDir(cfg.sortDir ?? "asc");
    setHydrated(true);
  }, [existing, hydrated]);

  const datasetDef = dataset ? DATASET_MAP[dataset] : undefined;
  const fields = useMemo(() => datasetDef?.fields ?? [], [datasetDef]);
  const grouped = groupBy.length > 0;

  const numericFields = useMemo(
    () => fields.filter((f) => NUMERIC_FIELD_TYPES.includes(f.type)),
    [fields]
  );

  // output columns available for sorting
  const sortOptions = useMemo(() => {
    if (grouped) {
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
  }, [grouped, groupBy, aggregates, columns, fields]);

  const handleDatasetChange = (next: string) => {
    setDataset(next);
    setColumns(DATASET_MAP[next]?.fields.map((f) => f.key) ?? []);
    setFilters([]);
    setGroupBy([]);
    setAggregates([]);
    setSortColumn("");
    runAnalysis.reset();
  };

  const buildConfig = (): AnalysisConfig | null => {
    if (!dataset) return null;
    return {
      dataset,
      columns: grouped ? [] : columns,
      filters: filters
        .map((f) => toAnalysisFilter(f, fields))
        .filter((f): f is AnalysisFilter => f !== null),
      groupBy,
      aggregates: aggregates.filter((a) => a.column),
      sortColumn: sortColumn || undefined,
      sortDir,
      limit: 500,
    };
  };

  const canRun =
    !!dataset && (grouped ? groupBy.length + aggregates.length > 0 : columns.length > 0);

  const handleRun = () => {
    const config = buildConfig();
    if (config) runAnalysis.mutate(config);
  };

  const handleSave = async () => {
    const config = buildConfig();
    if (!config || !name.trim()) return;
    setSaveError(null);
    try {
      if (reportId) {
        await updateReport.mutateAsync({
          id: reportId,
          name: name.trim(),
          description: description.trim() || null,
          config,
        });
      } else {
        const created = await createReport.mutateAsync({
          name: name.trim(),
          description: description.trim() || null,
          config,
        });
        router.push(`/crm/admin/reports/analysis/${created.id}`);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleDelete = async () => {
    if (!reportId) return;
    await deleteReport.mutateAsync(reportId);
    router.push("/crm/admin/reports?tab=custom");
  };

  const handleExport = () => {
    const result = runAnalysis.data;
    if (!result) return;
    downloadCSV(
      `${name.trim() || "analysis"}.csv`,
      result.columns.map((c) => c.label),
      result.rows.map((row) =>
        result.columns.map((c) => formatCellValue(row[c.key], c.type))
      )
    );
  };

  const saving = createReport.isPending || updateReport.isPending;

  if (reportId && loadingExisting) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* header */}
      <div>
        <Link
          href="/crm/admin/reports?tab=custom"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          My Reports
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 w-80 text-base font-semibold"
              placeholder="Untitled Analysis"
            />
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-8 w-80 text-sm"
              placeholder="Description (optional)"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={!runAnalysis.data || runAnalysis.data.rows.length === 0}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export CSV
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!canRun || saving || !name.trim()}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {saving ? "Saving…" : reportId ? "Save Changes" : "Save Analysis"}
            </Button>
            {reportId && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this analysis?</AlertDialogTitle>
                    <AlertDialogDescription>
                      &quot;{name}&quot; will be removed from My Reports.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-600 hover:bg-red-700"
                      onClick={() => void handleDelete()}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>

      {saveError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Save failed</AlertTitle>
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      {/* dataset */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">1. Data</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Select value={dataset} onValueChange={handleDatasetChange}>
            <SelectTrigger className="h-9 w-72 text-sm">
              <SelectValue placeholder="Select a data type…" />
            </SelectTrigger>
            <SelectContent>
              {REPORT_DATASETS.map((d) => (
                <SelectItem key={d.key} value={d.key}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {datasetDef && (
            <p className="text-xs text-muted-foreground">{datasetDef.description}</p>
          )}
        </CardContent>
      </Card>

      {datasetDef && (
        <>
          {/* columns */}
          <Card className={cn(grouped && "opacity-60")}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">2. Columns</CardTitle>
              <div className="flex items-center gap-2 text-xs">
                {grouped ? (
                  <span className="text-muted-foreground">
                    Grouping is on — output uses group columns + aggregates.
                  </span>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setColumns(fields.map((f) => f.key))}
                    >
                      Select All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setColumns([])}
                    >
                      Clear
                    </Button>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
                {fields.map((field) => (
                  <label
                    key={field.key}
                    className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"
                  >
                    <Checkbox
                      disabled={grouped}
                      checked={columns.includes(field.key)}
                      onCheckedChange={(checked) =>
                        setColumns((prev) =>
                          checked === true
                            ? [...prev, field.key]
                            : prev.filter((k) => k !== field.key)
                        )
                      }
                    />
                    {field.label}
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* filters */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">3. Filters</CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  setFilters((prev) => [
                    ...prev,
                    { column: fields[0]?.key ?? "", op: "eq", value: "" },
                  ])
                }
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Filter
              </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {filters.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No filters — the analysis includes all rows.
                </p>
              )}
              {filters.map((filter, i) => {
                const field = fields.find((f) => f.key === filter.column);
                const needsValue =
                  filter.op !== "is_null" && filter.op !== "not_null";
                return (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <Select
                      value={filter.column}
                      onValueChange={(v) =>
                        setFilters((prev) =>
                          prev.map((f, j) => (j === i ? { ...f, column: v, value: "" } : f))
                        )
                      }
                    >
                      <SelectTrigger className="h-8 w-52 text-sm">
                        <SelectValue placeholder="Column" />
                      </SelectTrigger>
                      <SelectContent>
                        {fields.map((f) => (
                          <SelectItem key={f.key} value={f.key}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={filter.op}
                      onValueChange={(v) =>
                        setFilters((prev) =>
                          prev.map((f, j) =>
                            j === i ? { ...f, op: v as FilterOp } : f
                          )
                        )
                      }
                    >
                      <SelectTrigger className="h-8 w-40 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OP_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {needsValue &&
                      (field?.type === "boolean" ? (
                        <Select
                          value={filter.value}
                          onValueChange={(v) =>
                            setFilters((prev) =>
                              prev.map((f, j) => (j === i ? { ...f, value: v } : f))
                            )
                          }
                        >
                          <SelectTrigger className="h-8 w-28 text-sm">
                            <SelectValue placeholder="Value" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Yes</SelectItem>
                            <SelectItem value="false">No</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type={filterValueInputType(field)}
                          step={field?.type === "money" ? "0.01" : undefined}
                          className="h-8 w-44 text-sm"
                          placeholder={field?.type === "money" ? "Amount ($)" : "Value"}
                          value={filter.value}
                          onChange={(e) =>
                            setFilters((prev) =>
                              prev.map((f, j) =>
                                j === i ? { ...f, value: e.target.value } : f
                              )
                            )
                          }
                        />
                      ))}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      aria-label="Remove filter"
                      onClick={() =>
                        setFilters((prev) => prev.filter((_, j) => j !== i))
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* grouping + aggregates */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">4. Group &amp; Total</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-600">Group By</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
                  {fields
                    .filter((f) => !NUMERIC_FIELD_TYPES.includes(f.type))
                    .map((field) => (
                      <label
                        key={field.key}
                        className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"
                      >
                        <Checkbox
                          checked={groupBy.includes(field.key)}
                          onCheckedChange={(checked) =>
                            setGroupBy((prev) =>
                              checked === true
                                ? [...prev, field.key]
                                : prev.filter((k) => k !== field.key)
                            )
                          }
                        />
                        {field.label}
                      </label>
                    ))}
                </div>
              </div>

              {grouped && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-600">Aggregates</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        setAggregates((prev) => [...prev, { column: "*", fn: "count" }])
                      }
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      Add Aggregate
                    </Button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {aggregates.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Add at least one aggregate (e.g. Count of All Rows, Sum of Revenue).
                      </p>
                    )}
                    {aggregates.map((agg, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Select
                          value={agg.fn}
                          onValueChange={(v) =>
                            setAggregates((prev) =>
                              prev.map((a, j) =>
                                j === i
                                  ? {
                                      fn: v as AggregateFn,
                                      column:
                                        v !== "count" && a.column === "*"
                                          ? numericFields[0]?.key ?? ""
                                          : a.column,
                                    }
                                  : a
                              )
                            )
                          }
                        >
                          <SelectTrigger className="h-8 w-32 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FN_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={agg.column}
                          onValueChange={(v) =>
                            setAggregates((prev) =>
                              prev.map((a, j) => (j === i ? { ...a, column: v } : a))
                            )
                          }
                        >
                          <SelectTrigger className="h-8 w-56 text-sm">
                            <SelectValue placeholder="Column" />
                          </SelectTrigger>
                          <SelectContent>
                            {agg.fn === "count" && (
                              <SelectItem value="*">All Rows (*)</SelectItem>
                            )}
                            {numericFields.map((f) => (
                              <SelectItem key={f.key} value={f.key}>
                                {f.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground"
                          aria-label="Remove aggregate"
                          onClick={() =>
                            setAggregates((prev) => prev.filter((_, j) => j !== i))
                          }
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* sort + run */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">5. Sort &amp; Run</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Select
                value={sortColumn || "none"}
                onValueChange={(v) => setSortColumn(v === "none" ? "" : v)}
              >
                <SelectTrigger className="h-8 w-56 text-sm">
                  <SelectValue placeholder="Sort by…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No sort</SelectItem>
                  {sortOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={sortDir}
                onValueChange={(v) => setSortDir(v as "asc" | "desc")}
              >
                <SelectTrigger className="h-8 w-32 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleRun} disabled={!canRun || runAnalysis.isPending}>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                {runAnalysis.isPending ? "Running…" : "Run Preview"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Preview is limited to 500 rows.
              </span>
            </CardContent>
          </Card>

          {/* preview */}
          {runAnalysis.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Analysis failed</AlertTitle>
              <AlertDescription>{runAnalysis.error.message}</AlertDescription>
            </Alert>
          )}
          {runAnalysis.data && <ReportTable result={runAnalysis.data} />}
        </>
      )}
    </div>
  );
}
