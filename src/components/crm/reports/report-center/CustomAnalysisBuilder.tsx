"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, BarChart3, Download, FileSpreadsheet, FileText, Play, Plus, Save, Trash2, X } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePermissions } from "@/lib/hooks/use-permissions";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { downloadXLSX } from "@/lib/xlsx-export";
import { exportReportPDF } from "@/lib/reports/export-pdf";
import type { ReportExportChartInput } from "@/lib/reports/export-pdf";
import {
  aggregateAlias,
  aggregateLabel,
  hydrateBuilder,
  useAnalysisConfigBuilder,
} from "@/lib/hooks/use-analysis-config-builder";
import {
  useCreateCustomReport,
  useCustomReport,
  useDeleteCustomReport,
  useGraphicLibraryItems,
  useRunAnalysis,
  useUpdateCustomReport,
} from "@/lib/hooks/use-report-center";
import type { FormatRule, FormatRuleOp, ReportFieldType, ReportResult, VisualSpec, VisualType } from "@/types/crm-reports";
import { FORMAT_COLORS } from "@/types/crm-reports";
import { AnalysisConfigEditor } from "./AnalysisConfigEditor";
import { chartInputFromResult, HeaderVisual } from "./HeaderVisual";
import { exportCellValue, formatCellValue, ReportTable } from "./ReportTable";
import { VisualRenderer } from "./VisualRenderer";

const VISUAL_TYPE_OPTIONS: { value: VisualType; label: string }[] = [
  { value: "table", label: "Table" },
  { value: "kpi", label: "KPI" },
  { value: "bar", label: "Bar Chart" },
  { value: "line", label: "Line Chart" },
  { value: "pie", label: "Pie Chart" },
];

const FORMAT_RULE_OP_OPTIONS: { value: FormatRuleOp; label: string }[] = [
  { value: "gt", label: "> greater than" },
  { value: "gte", label: "≥ greater than or equal" },
  { value: "lt", label: "< less than" },
  { value: "lte", label: "≤ less than or equal" },
  { value: "eq", label: "= equal to" },
  { value: "neq", label: "≠ not equal to" },
];

/** CSV cells are raw, machine-readable values (E-21): money as dollars with two
 *  decimals and no symbol/thousands separators, numbers unformatted, null as
 *  an empty cell. The on-screen table keeps formatCellValue's display strings. */
function csvCellValue(value: unknown, type: ReportFieldType): string {
  if (value === null || value === undefined) return "";
  if (type === "money") return (Number(value) / 100).toFixed(2);
  const raw = exportCellValue(value, type);
  return raw === "—" ? "" : String(raw);
}

export function CustomAnalysisBuilder({ reportId }: { reportId?: string }) {
  const router = useRouter();
  const { can, isLoading: permissionsLoading } = usePermissions();
  /** Set on first save of a brand-new analysis. The URL is swapped in place
   *  (history.replaceState) instead of router.push so the component — and
   *  the preview the user just ran — stays mounted (E-20). */
  const [savedReportId, setSavedReportId] = useState<string | null>(null);
  const effectiveReportId = reportId ?? savedReportId;
  const { data: existing, isLoading: loadingExisting } = useCustomReport(reportId ?? savedReportId ?? undefined);
  const createReport = useCreateCustomReport();
  const updateReport = useUpdateCustomReport();
  const deleteReport = useDeleteCustomReport();
  const runAnalysis = useRunAnalysis();

  const [name, setName] = useState("Untitled Analysis");
  const [description, setDescription] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [visualType, setVisualType] = useState<VisualType>("table");
  const [labelColumn, setLabelColumn] = useState("");
  const [valueColumns, setValueColumns] = useState<string[]>([]);
  const [kpiColumn, setKpiColumn] = useState("");
  const [formatRules, setFormatRules] = useState<FormatRule[]>([]);
  const [colorSpectrumColumns, setColorSpectrumColumns] = useState<string[]>([]);
  const [headerVisual, setHeaderVisual] = useState<VisualSpec | undefined>(undefined);
  const [headerVisualTitle, setHeaderVisualTitle] = useState("");
  const [headerChartResult, setHeaderChartResult] = useState<ReportResult | undefined>(undefined);
  const [graphicPickerOpen, setGraphicPickerOpen] = useState(false);
  const { items: graphicItems } = useGraphicLibraryItems();

  const builder = useAnalysisConfigBuilder(undefined, () => {
    // Switching datasets invalidates any chart/format-rule column references
    // built against the old one — reset rather than leave them dangling.
    runAnalysis.reset();
    setLabelColumn("");
    setValueColumns([]);
    setKpiColumn("");
    setFormatRules([]);
    setColorSpectrumColumns([]);
  });

  // hydrate once when editing an existing analysis
  useEffect(() => {
    if (!existing || hydrated) return;
    setName(existing.name);
    setDescription(existing.description ?? "");
    hydrateBuilder(builder, existing.config);
    setVisualType(existing.visualType);
    setLabelColumn(existing.labelColumn ?? "");
    setValueColumns(existing.valueColumns);
    setKpiColumn(existing.kpiColumn ?? "");
    setFormatRules(existing.formatRules ?? []);
    setColorSpectrumColumns(existing.colorSpectrumColumns ?? []);
    setHeaderVisual(existing.headerVisual ?? undefined);
    setHeaderVisualTitle(existing.headerVisualTitle ?? "");
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, hydrated]);

  const { canRun, buildConfig, grouped, groupBy, aggregates, columns, numericFields, fields, formulas } = builder;
  const isChart = visualType === "bar" || visualType === "line" || visualType === "pie";

  // Formula columns are always numeric, so they belong in both the general
  // output-column list (format rules, crosstab/table columns) and the
  // numeric-only value-column list (chart series, color spectrum).
  const formulaOptions = formulas
    .filter((f) => f.name && f.left && f.right)
    .map((f) => ({ value: f.name, label: f.name }));

  const outputOptions = [
    ...(grouped
      ? [
          ...groupBy.map((key) => ({ value: key, label: fields.find((f) => f.key === key)?.label ?? key })),
          ...aggregates
            .filter((a) => a.column)
            .map((a) => ({ value: aggregateAlias(a), label: aggregateLabel(a, fields) })),
        ]
      : columns.map((key) => ({ value: key, label: fields.find((f) => f.key === key)?.label ?? key }))),
    ...formulaOptions,
  ];

  const valueOptions = [
    ...(grouped
      ? aggregates
          .filter((a) => a.column)
          .map((a) => ({ value: aggregateAlias(a), label: aggregateLabel(a, fields) }))
      : numericFields.map((f) => ({ value: f.key, label: f.label }))),
    ...formulaOptions,
  ];

  const handleRun = () => {
    const config = buildConfig();
    if (config) runAnalysis.mutate(config);
  };

  const addFormatRule = () => {
    setFormatRules((prev) => [
      ...prev,
      { column: outputOptions[0]?.value ?? "", op: "gt", value: 0, color: "red" },
    ]);
  };

  const updateFormatRule = (index: number, patch: Partial<FormatRule>) => {
    setFormatRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeFormatRule = (index: number) => {
    setFormatRules((prev) => prev.filter((_, i) => i !== index));
  };

  /** Format-rule values are stored in the same raw units the row data uses
   *  (money columns are cents, matching ReportTable's comparison) — this
   *  resolves a rule column's type so the UI can show/accept dollars while
   *  storing cents. Prefers the last preview run's actual column types
   *  (correct even for aggregate aliases like sum_balance_cents), falling
   *  back to the raw field/aggregate heuristic before a preview exists. */
  const columnTypeForRule = (key: string): string => {
    const resultCol = runAnalysis.data?.columns.find((c) => c.key === key);
    if (resultCol) return resultCol.type;
    if (grouped) {
      const agg = aggregates.find((a) => aggregateAlias(a) === key);
      if (agg) return agg.fn === "count" ? "number" : fields.find((f) => f.key === agg.column)?.type ?? "number";
    }
    return fields.find((f) => f.key === key)?.type ?? "text";
  };

  const visualSpec: VisualSpec | null = runAnalysis.data
    ? {
        type: visualType,
        config: buildConfig() ?? { dataset: "", columns: [], filters: [], groupBy: [], aggregates: [], sortDir: "asc" },
        useTabDateRange: false,
        labelColumn: labelColumn || undefined,
        valueColumns,
        kpiColumn: kpiColumn || undefined,
      }
    : null;

  const handleSave = async () => {
    const config = buildConfig();
    if (!config || !name.trim()) return;
    setSaveError(null);
    try {
      if (effectiveReportId) {
        await updateReport.mutateAsync({
          id: effectiveReportId,
          name: name.trim(),
          description: description.trim() || null,
          config,
          visualType,
          labelColumn: labelColumn || null,
          valueColumns,
          kpiColumn: kpiColumn || null,
          formatRules,
          colorSpectrumColumns,
          headerVisual: headerVisual ?? null,
          headerVisualTitle: headerVisual ? headerVisualTitle || null : null,
        });
      } else {
        const created = await createReport.mutateAsync({
          name: name.trim(),
          description: description.trim() || null,
          config,
          visualType,
          labelColumn: labelColumn || null,
          valueColumns,
          kpiColumn: kpiColumn || null,
          formatRules,
          colorSpectrumColumns,
          headerVisual: headerVisual ?? null,
          headerVisualTitle: headerVisual ? headerVisualTitle || null : null,
        });
        // Stay mounted: the preview results / export buttons survive the save.
        // Mark hydrated so the freshly-created record loading back in doesn't
        // re-hydrate (and reset) the builder the user is still editing.
        setHydrated(true);
        setSavedReportId(created.id);
        if (typeof window !== "undefined") {
          window.history.replaceState(null, "", `/crm/admin/reports/analysis/${created.id}`);
        }
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleDelete = async () => {
    if (!effectiveReportId) return;
    await deleteReport.mutateAsync(effectiveReportId);
    router.push("/crm/admin/reports?tab=custom");
  };

  const handleExport = () => {
    const result = runAnalysis.data;
    if (!result) return;
    downloadCSV(
      `${name.trim() || "analysis"}.csv`,
      result.columns.map((c) => c.label),
      result.rows.map((row) => result.columns.map((c) => csvCellValue(row[c.key], c.type)))
    );
  };

  const handleExportExcel = () => {
    const result = runAnalysis.data;
    if (!result) return;
    try {
      downloadXLSX(`${name.trim() || "analysis"}.xlsx`, [
        {
          name: name.trim() || "Analysis",
          headers: result.columns.map((c) => c.label),
          rows: result.rows.map((row) => result.columns.map((c) => exportCellValue(row[c.key], c.type))),
        },
      ]);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Excel export failed");
    }
  };

  const [exportingPdf, setExportingPdf] = useState(false);
  const handleExportPdf = async () => {
    const result = runAnalysis.data;
    if (!result) return;
    setExportingPdf(true);
    try {
      const charts: ReportExportChartInput[] = [];
      if (headerVisual && headerChartResult) {
        const chart = chartInputFromResult(headerVisualTitle || "Chart", headerChartResult);
        if (chart) charts.push(chart);
      }
      await exportReportPDF(
        name.trim() || "Analysis",
        [
          {
            heading: "",
            columns: result.columns.map((c) => c.label),
            rows: result.rows.map((row) => result.columns.map((c) => formatCellValue(row[c.key], c.type))),
          },
        ],
        charts.length > 0 ? charts : undefined
      );
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "PDF export failed");
    } finally {
      setExportingPdf(false);
    }
  };

  const saving = createReport.isPending || updateReport.isPending;

  if (!permissionsLoading && !can("manage_report_center")) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No access"
        description="You don't have permission to manage custom analyses."
      />
    );
  }

  if (reportId && loadingExisting) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* header */}
      <div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/crm/admin/reports?tab=custom">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            My Reports
          </Link>
        </Button>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 w-full sm:w-80 text-base font-semibold"
              placeholder="Untitled Analysis"
            />
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-8 w-full sm:w-80 text-sm"
              placeholder="Description (optional)"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={!runAnalysis.data || runAnalysis.data.rows.length === 0}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              disabled={!runAnalysis.data || runAnalysis.data.rows.length === 0}
            >
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleExportPdf()}
              disabled={!runAnalysis.data || runAnalysis.data.rows.length === 0 || exportingPdf}
            >
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              {exportingPdf ? "Exporting…" : "PDF"}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!canRun || saving || !name.trim()}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {saving ? "Saving…" : effectiveReportId ? "Save Changes" : "Save Analysis"}
            </Button>
            {effectiveReportId && (
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

      <AnalysisConfigEditor builder={builder} />

      {builder.datasetDef && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">7. Visualization</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <span className="w-32 text-xs font-medium text-slate-600">Display As</span>
              <Select value={visualType} onValueChange={(v) => setVisualType(v as VisualType)}>
                <SelectTrigger className="h-9 w-40 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISUAL_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {isChart && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">8. Chart Fields</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="w-32 text-xs font-medium text-slate-600">Label Column</span>
                  <Select value={labelColumn} onValueChange={setLabelColumn}>
                    <SelectTrigger className="h-8 w-64 text-sm">
                      <SelectValue placeholder="Choose a label column…" />
                    </SelectTrigger>
                    <SelectContent>
                      {outputOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-600">Value Column(s)</p>
                  {visualType === "pie" ? (
                    <Select value={valueColumns[0] ?? ""} onValueChange={(v) => setValueColumns([v])}>
                      <SelectTrigger className="h-8 w-64 text-sm">
                        <SelectValue placeholder="Choose a value column…" />
                      </SelectTrigger>
                      <SelectContent>
                        {valueOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
                      {valueOptions.map((o) => (
                        <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                          <Checkbox
                            checked={valueColumns.includes(o.value)}
                            onCheckedChange={(checked) =>
                              setValueColumns((prev) =>
                                checked === true ? [...prev, o.value] : prev.filter((k) => k !== o.value)
                              )
                            }
                          />
                          {o.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {visualType === "kpi" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">8. Chart Fields</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-3">
                <span className="w-32 text-xs font-medium text-slate-600">KPI Value</span>
                <Select value={kpiColumn} onValueChange={setKpiColumn}>
                  <SelectTrigger className="h-8 w-64 text-sm">
                    <SelectValue placeholder="Choose a value…" />
                  </SelectTrigger>
                  <SelectContent>
                    {outputOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">9. Conditional Formatting</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {formatRules.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Color-code cells based on a rule, e.g. &quot;Balance &gt; $1,000 → red&quot;.
                </p>
              )}
              {formatRules.map((rule, i) => {
                const ruleColType = columnTypeForRule(rule.column);
                const isMoney = ruleColType === "money";
                return (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Select
                    value={rule.column}
                    onValueChange={(v) => updateFormatRule(i, { column: v, value: 0 })}
                  >
                    <SelectTrigger className="h-8 w-48 text-sm">
                      <SelectValue placeholder="Column" />
                    </SelectTrigger>
                    <SelectContent>
                      {outputOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={rule.op}
                    onValueChange={(v) => updateFormatRule(i, { op: v as FormatRuleOp })}
                  >
                    <SelectTrigger className="h-8 w-44 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORMAT_RULE_OP_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    step={isMoney ? "0.01" : undefined}
                    placeholder={isMoney ? "Amount ($)" : "Value"}
                    value={isMoney ? rule.value / 100 : rule.value}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value);
                      const raw = Number.isNaN(n) ? 0 : n;
                      updateFormatRule(i, { value: isMoney ? Math.round(raw * 100) : raw });
                    }}
                    className="h-8 w-28 text-sm"
                  />
                  <Select
                    value={rule.color}
                    onValueChange={(v) => updateFormatRule(i, { color: v as FormatRule["color"] })}
                  >
                    <SelectTrigger className="h-8 w-32 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORMAT_COLORS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          <span className="flex items-center gap-1.5">
                            <span
                              className="h-3 w-3 rounded-full border"
                              style={{ backgroundColor: c.bg, borderColor: c.text }}
                            />
                            {c.value[0].toUpperCase() + c.value.slice(1)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeFormatRule(i)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                );
              })}
              <div>
                <Button variant="outline" size="sm" onClick={addFormatRule} disabled={outputOptions.length === 0}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Rule
                </Button>
              </div>
              {valueOptions.length > 0 && (
                <div className="border-t pt-3">
                  <p className="mb-1.5 text-xs font-medium text-slate-600">
                    Color Spectrum — shade a column light-to-dark by magnitude
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
                    {valueOptions.map((o) => (
                      <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <Checkbox
                          checked={colorSpectrumColumns.includes(o.value)}
                          onCheckedChange={(checked) =>
                            setColorSpectrumColumns((prev) =>
                              checked === true
                                ? [...prev, o.value]
                                : prev.filter((k) => k !== o.value)
                            )
                          }
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">10. Header Graphic</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                Show a chart above this analysis, embedded above it in PDF export too —
                pick one from the Graphics Library.
              </p>
              {headerVisual ? (
                <div className="flex items-center justify-between gap-3 rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
                  <span className="flex items-center gap-2">
                    {headerVisualTitle || "Untitled graphic"}
                    <Badge variant="secondary" className="text-[10px] capitalize">
                      {headerVisual.type}
                    </Badge>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[11px]"
                    onClick={() => {
                      setHeaderVisual(undefined);
                      setHeaderVisualTitle("");
                      setHeaderChartResult(undefined);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <div>
                  <Button variant="outline" size="sm" onClick={() => setGraphicPickerOpen(true)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Choose From Graphics Library
                  </Button>
                </div>
              )}
              {headerVisual && (
                <HeaderVisual
                  headerVisual={{ title: headerVisualTitle || "Chart", visual: headerVisual }}
                  onData={(_title, result) => setHeaderChartResult(result)}
                />
              )}
            </CardContent>
          </Card>

          <Dialog open={graphicPickerOpen} onOpenChange={setGraphicPickerOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Choose a Header Graphic</DialogTitle>
              </DialogHeader>
              <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
                {graphicItems.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No graphics available yet.
                  </p>
                )}
                {graphicItems.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => {
                      setHeaderVisual(g.visual);
                      setHeaderVisualTitle(g.name);
                      setHeaderChartResult(undefined);
                      setGraphicPickerOpen(false);
                    }}
                    className="flex flex-col rounded-md border p-3 text-left text-sm hover:bg-accent"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      {g.name}
                      <Badge variant="secondary" className="text-[10px]">
                        {g.isSystem ? "Built-in" : "My Graphics"}
                      </Badge>
                    </span>
                    {g.description && (
                      <span className="text-xs text-muted-foreground">{g.description}</span>
                    )}
                  </button>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">11. Run</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={handleRun} disabled={!canRun || runAnalysis.isPending}>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                {runAnalysis.isPending ? "Running…" : "Run Preview"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Preview is limited to 500 rows.
              </span>
            </CardContent>
          </Card>

          {runAnalysis.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Analysis failed</AlertTitle>
              <AlertDescription>{runAnalysis.error.message}</AlertDescription>
            </Alert>
          )}
          {runAnalysis.data && (visualType === "table" ? (
            <ReportTable
              result={runAnalysis.data}
              formatRules={formatRules}
              colorSpectrumColumns={colorSpectrumColumns}
            />
          ) : visualSpec ? (
            <Card>
              <CardContent className="pt-4">
                <VisualRenderer result={runAnalysis.data} visual={visualSpec} className="h-80" />
              </CardContent>
            </Card>
          ) : null)}
        </>
      )}
    </div>
  );
}
