"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { REPORT_DATASETS } from "@/lib/reports/datasets";
import {
  FN_OPTIONS,
  FORMULA_DISPLAY_TYPE_OPTIONS,
  FORMULA_OPERATOR_OPTIONS,
  NUMERIC_FIELD_TYPES,
  OP_OPTIONS,
  filterValueInputType,
  type AnalysisConfigBuilder,
} from "@/lib/hooks/use-analysis-config-builder";
import type { AggregateFn, FilterOp, FormulaDisplayType, FormulaOperator } from "@/types/crm-reports";

/**
 * The Data / Columns / Filters / Group & Total / Sort cards shared by the
 * Custom Analysis Builder and dashboard panel editors. Purely presentational
 * over an `AnalysisConfigBuilder` — callers own Run/Save actions.
 */
export function AnalysisConfigEditor({
  builder,
  stepOffset = 0,
}: {
  builder: AnalysisConfigBuilder;
  /** Bump card numbers when embedded after other steps (e.g. visual type). */
  stepOffset?: number;
}) {
  const {
    dataset,
    columns,
    filters,
    groupBy,
    aggregates,
    subtotals,
    formulas,
    sortColumn,
    sortDir,
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
    grouped,
    subtotalMode,
    sortOptions,
  } = builder;

  const n = (i: number) => stepOffset + i;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{n(1)}. Data</CardTitle>
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
          <Card className={cn(grouped && "opacity-60")}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">{n(2)}. Columns</CardTitle>
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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">{n(3)}. Filters</CardTitle>
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
                const needsValue = filter.op !== "is_null" && filter.op !== "not_null";
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
                          prev.map((f, j) => (j === i ? { ...f, op: v as FilterOp } : f))
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
                      (filter.op === "in" ? (
                        field?.options ? (
                          <MultiSelectFilterValue
                            options={field.options}
                            value={filter.value}
                            onChange={(v) =>
                              setFilters((prev) =>
                                prev.map((f, j) => (j === i ? { ...f, value: v } : f))
                              )
                            }
                          />
                        ) : (
                          <Input
                            className="h-8 w-52 text-sm"
                            placeholder="Comma-separated values"
                            value={filter.value}
                            onChange={(e) =>
                              setFilters((prev) =>
                                prev.map((f, j) =>
                                  j === i ? { ...f, value: e.target.value } : f
                                )
                              )
                            }
                          />
                        )
                      ) : field?.type === "boolean" ? (
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
                      ) : field?.options ? (
                        <Select
                          value={filter.value}
                          onValueChange={(v) =>
                            setFilters((prev) =>
                              prev.map((f, j) => (j === i ? { ...f, value: v } : f))
                            )
                          }
                        >
                          <SelectTrigger className="h-8 w-44 text-sm">
                            <SelectValue placeholder="Value" />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
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
                      onClick={() => setFilters((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{n(4)}. Group &amp; Total</CardTitle>
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

              {groupBy.length > 0 && (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <Checkbox
                    checked={subtotals}
                    onCheckedChange={(checked) => setSubtotals(checked === true)}
                  />
                  Show subtotals per group (keep detail rows)
                </label>
              )}

              {subtotalMode ? (
                <p className="text-xs text-muted-foreground">
                  Rows stay visible, grouped under a header for each {fields.find((f) => f.key === groupBy[0])?.label ?? groupBy[0]}{" "}
                  value, with a subtotal row summing every money/hours column beneath each group.
                </p>
              ) : (
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
                      Add at least one aggregate (e.g. Count of All Rows, Sum of Revenue). With
                      no Group By columns checked, this returns a single grand-total row.
                    </p>
                  )}
                  {aggregates.map((agg, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2">
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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">{n(5)}. Formulas</CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={sortOptions.length === 0}
                onClick={() =>
                  setFormulas((prev) => [
                    ...prev,
                    {
                      name: "",
                      left: sortOptions[0]?.value ?? "",
                      operator: "+",
                      right: sortOptions[0]?.value ?? "",
                      displayType: "number",
                    },
                  ])
                }
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Formula
              </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {formulas.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Build a calculated column from two existing output columns, e.g. &quot;Revenue −
                  Cost&quot;.
                </p>
              )}
              {formulas.map((formula, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Input
                    value={formula.name}
                    onChange={(e) =>
                      setFormulas((prev) =>
                        prev.map((f, j) => (j === i ? { ...f, name: e.target.value } : f))
                      )
                    }
                    placeholder="Column name"
                    className="h-8 w-36 text-sm"
                  />
                  <span className="text-sm text-slate-500">=</span>
                  <Select
                    value={formula.left}
                    onValueChange={(v) =>
                      setFormulas((prev) => prev.map((f, j) => (j === i ? { ...f, left: v } : f)))
                    }
                  >
                    <SelectTrigger className="h-8 w-44 text-sm">
                      <SelectValue placeholder="Column" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={formula.operator}
                    onValueChange={(v) =>
                      setFormulas((prev) =>
                        prev.map((f, j) => (j === i ? { ...f, operator: v as FormulaOperator } : f))
                      )
                    }
                  >
                    <SelectTrigger className="h-8 w-36 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORMULA_OPERATOR_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={formula.right}
                    onValueChange={(v) =>
                      setFormulas((prev) => prev.map((f, j) => (j === i ? { ...f, right: v } : f)))
                    }
                  >
                    <SelectTrigger className="h-8 w-44 text-sm">
                      <SelectValue placeholder="Column" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={formula.displayType}
                    onValueChange={(v) =>
                      setFormulas((prev) =>
                        prev.map((f, j) =>
                          j === i ? { ...f, displayType: v as FormulaDisplayType } : f
                        )
                      )
                    }
                  >
                    <SelectTrigger className="h-8 w-28 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORMULA_DISPLAY_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    aria-label="Remove formula"
                    onClick={() => setFormulas((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {formulas.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Pick a display type that matches the operands&apos; units — e.g. dividing a money
                  column by an hours column isn&apos;t itself money.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{n(6)}. Sort</CardTitle>
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
              <Select value={sortDir} onValueChange={(v) => setSortDir(v as "asc" | "desc")}>
                <SelectTrigger className="h-8 w-32 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

/** "is any of" filter value picker for a field with a fixed option set —
 *  stores the selection as the same comma-joined string every other filter
 *  value uses (BuilderFilter.value is always a plain string; toAnalysisFilter
 *  splits it back into an array for the "in" op). */
function MultiSelectFilterValue({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (next: string) => void;
}) {
  const selected = value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v !== "");

  const toggle = (optionValue: string, checked: boolean) => {
    const next = checked
      ? [...selected, optionValue]
      : selected.filter((v) => v !== optionValue);
    onChange(next.join(", "));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 w-44 justify-start text-sm font-normal">
          {selected.length === 0
            ? "Choose values…"
            : `${selected.length} selected`}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {options.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent"
            >
              <Checkbox
                checked={selected.includes(o.value)}
                onCheckedChange={(checked) => toggle(o.value, checked === true)}
              />
              {o.label}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
