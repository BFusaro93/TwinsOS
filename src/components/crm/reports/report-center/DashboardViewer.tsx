"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Download, FileSpreadsheet, FileText, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { downloadCSV } from "@/lib/csv";
import { downloadXLSX } from "@/lib/xlsx-export";
import { exportReportPDF } from "@/lib/reports/export-pdf";
import {
  useDashboard,
  useReportFilterOptions,
  useRunReport,
  useRunVisualQuery,
} from "@/lib/hooks/use-report-center";
import { getReport } from "@/lib/reports/registry";
import { computePresetRange } from "./ReportFilterBar";
import { VisualRenderer } from "./VisualRenderer";
import { exportCellValue, formatCellValue, ReportTable } from "./ReportTable";
import type { DashboardPanel, DashboardTab, ReportResult } from "@/types/crm-reports";
import type { ReportFilterDef } from "@/types/crm-reports";

const HUB_HREF = "/crm/admin/reports?tab=dashboards";

const PANEL_SIZE_CLASSES: Record<DashboardPanel["size"], string> = {
  third: "md:col-span-2",
  half: "md:col-span-3",
  full: "md:col-span-6",
};

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function defaultDateRange(): { from: string; to: string } {
  const now = new Date();
  return {
    from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: iso(now),
  };
}

/** Default filter values for a prebuilt report's own filter bar (date-range
 *  presets like "this month" resolved fresh on every render), same logic
 *  ReportViewer.tsx's standalone page uses — kept as an inline copy here
 *  rather than importing it, since embedding needs no coupling to the rest
 *  of that page (filter bar, exports, schedule dialog). */
function reportDefaultParams(filters: ReportFilterDef[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const def of filters) {
    if (def.type === "dateRange") {
      const { from, to } = computePresetRange(def.defaultValue ?? "this_month");
      values.from = from;
      values.to = to;
    } else {
      values[def.key] = def.defaultValue ?? "";
    }
  }
  return values;
}

/** Embeds an existing Report Center prebuilt report (by key) inside a
 *  dashboard panel — needed for reports with bespoke `run` logic (e.g.
 *  date-bucketed aging reports) that can't be expressed as a plain
 *  AnalysisConfig/VisualSpec. Deliberately minimal: no filter bar or export
 *  buttons here (those stay on the full report page) — just the table and
 *  a link out. Not wired into the tab's bulk CSV/Excel/PDF export (open the
 *  full report to export it individually). */
function ReportPanelView({
  reportKey,
  params,
}: {
  reportKey: string;
  params?: Record<string, string>;
}) {
  const def = getReport(reportKey);
  const effectiveParams = useMemo(
    () => ({ ...(def ? reportDefaultParams(def.filters) : {}), ...params }),
    [def, params]
  );
  const { data, isFetching, error } = useRunReport(reportKey, effectiveParams);

  if (!def) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Report &quot;{reportKey}&quot; no longer exists.</AlertDescription>
      </Alert>
    );
  }
  if (isFetching && !data) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }
  if (!data) return null;

  return (
    <div className="flex flex-col gap-2">
      <ReportTable result={data} formatRules={def.formatRules} />
      <Link
        href={`/crm/admin/reports/r/${reportKey}`}
        className="self-start text-xs text-blue-600 hover:underline"
      >
        Open full report →
      </Link>
    </div>
  );
}

function DashboardPanelView({
  panel,
  dateRange,
  repFilter,
  onData,
}: {
  panel: DashboardPanel;
  dateRange?: { from: string; to: string };
  repFilter?: string;
  onData?: (panelId: string, result: ReportResult) => void;
}) {
  if (panel.reportKey) {
    return <ReportPanelView reportKey={panel.reportKey} params={panel.reportParams} />;
  }

  return (
    <DashboardVisualPanelView panel={panel} dateRange={dateRange} repFilter={repFilter} onData={onData} />
  );
}

function DashboardVisualPanelView({
  panel,
  dateRange,
  repFilter,
  onData,
}: {
  panel: DashboardPanel;
  dateRange?: { from: string; to: string };
  repFilter?: string;
  onData?: (panelId: string, result: ReportResult) => void;
}) {
  const { data, isFetching, error } = useRunVisualQuery(
    panel.visual,
    panel.visual.useTabDateRange ? dateRange : undefined,
    panel.visual.useTabRepFilter ? repFilter : undefined
  );

  useEffect(() => {
    if (data) onData?.(panel.id, data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, panel.id]);

  if (isFetching && !data) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  return <VisualRenderer result={data} visual={panel.visual} />;
}

function DashboardTabView({ tab, dashboardName }: { tab: DashboardTab; dashboardName: string }) {
  const [dateRange, setDateRange] = useState(defaultDateRange);
  const [repFilter, setRepFilter] = useState("");
  const { data: salesRepOptions = [] } = useReportFilterOptions(tab.useRepFilter ? "salesReps" : undefined);
  const [panelResults, setPanelResults] = useState<Record<string, ReportResult>>({});
  const [exportingPdf, setExportingPdf] = useState(false);

  // Without this, changing the date range and immediately exporting (before
  // the refetch for the new range lands) exported the PREVIOUS range's rows
  // under the NEW range's filename/title. Clear only the panels that
  // actually USE the tab's shared date range — panels that don't are
  // unaffected by this change and would otherwise wrongly disappear from
  // exports (their query doesn't refetch, so nothing would repopulate them).
  useEffect(() => {
    setPanelResults((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const panel of tab.panels) {
        if (panel.visual.useTabDateRange && panel.id in next) {
          delete next[panel.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.from, dateRange.to]);

  // Same idea as the date-range effect above, but for the tab's shared Sales
  // Rep select — only clear panels that actually filter on it.
  useEffect(() => {
    setPanelResults((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const panel of tab.panels) {
        if (panel.visual.useTabRepFilter && panel.id in next) {
          delete next[panel.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repFilter]);

  const handlePanelData = (panelId: string, result: ReportResult) => {
    setPanelResults((prev) => (prev[panelId] === result ? prev : { ...prev, [panelId]: result }));
  };

  const panelsWithData = tab.panels.filter((p) => panelResults[p.id]);
  const hasData = panelsWithData.length > 0;

  const handleExportCsv = () => {
    // A single CSV can only hold one table, so export the first panel that
    // has data — Excel/PDF exports below cover the full multi-panel case.
    const panel = panelsWithData[0];
    if (!panel) return;
    const result = panelResults[panel.id];
    downloadCSV(
      `${panel.title}.csv`,
      result.columns.map((c) => c.label),
      result.rows.map((row) => result.columns.map((c) => formatCellValue(row[c.key], c.type)))
    );
  };

  const handleExportExcel = () => {
    if (!hasData) return;
    try {
      downloadXLSX(
        `${dashboardName} - ${tab.name}.xlsx`,
        panelsWithData.map((panel) => {
          const result = panelResults[panel.id];
          return {
            name: panel.title,
            headers: result.columns.map((c) => c.label),
            rows: result.rows.map((row) => result.columns.map((c) => exportCellValue(row[c.key], c.type))),
          };
        })
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Excel export failed");
    }
  };

  const handleExportPdf = async () => {
    if (!hasData) return;
    setExportingPdf(true);
    try {
      await exportReportPDF(
        `${dashboardName} - ${tab.name}`,
        panelsWithData.map((panel) => {
          const result = panelResults[panel.id];
          return {
            heading: panel.title,
            columns: result.columns.map((c) => c.label),
            rows: result.rows.map((row) => result.columns.map((c) => formatCellValue(row[c.key], c.type))),
          };
        })
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF export failed");
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
        <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!hasData}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          CSV
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={!hasData}>
          <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
          Excel
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleExportPdf()}
          disabled={!hasData || exportingPdf}
        >
          <FileText className="mr-1.5 h-3.5 w-3.5" />
          {exportingPdf ? "Exporting…" : "PDF"}
        </Button>
      </div>
      {tab.useDateFilter && (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-lg border bg-white p-3 shadow-sm">
          <span className="pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Filter By
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">From</span>
            <input
              type="date"
              className="h-8 w-36 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
              value={dateRange.from}
              onChange={(e) =>
                setDateRange((prev) => ({ ...prev, from: e.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">To</span>
            <input
              type="date"
              className="h-8 w-36 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
              value={dateRange.to}
              onChange={(e) =>
                setDateRange((prev) => ({ ...prev, to: e.target.value }))
              }
            />
          </div>
        </div>
      )}

      {tab.useRepFilter && (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-lg border bg-white p-3 shadow-sm">
          <span className="pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Sales Rep
          </span>
          <Select value={repFilter || "all"} onValueChange={(v) => setRepFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="h-8 w-56 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sales Reps</SelectItem>
              {salesRepOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
        {tab.panels.map((panel) => (
          <div key={panel.id} className={PANEL_SIZE_CLASSES[panel.size]}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{panel.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <DashboardPanelView panel={panel} dateRange={dateRange} repFilter={repFilter} onData={handlePanelData} />
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardViewer({ dashboardId }: { dashboardId: string }) {
  const router = useRouter();
  const { data: dashboard, isLoading, isError } = useDashboard(dashboardId);

  const tabs = useMemo(() => dashboard?.config.tabs ?? [], [dashboard]);
  const [activeTab, setActiveTab] = useState<string | undefined>(undefined);
  const currentTab = activeTab ?? tabs[0]?.id;

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="md:col-span-2">
              <Skeleton className="h-40 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError || !dashboard) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="text-base font-semibold text-slate-900">
          Dashboard not found
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          This dashboard may have been deleted.
        </p>
        <Link
          href={HUB_HREF}
          className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Dashboards
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title={dashboard.name}
        description={dashboard.description ?? undefined}
        className="print:hidden"
        action={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(HUB_HREF)}
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Back
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/crm/admin/reports/dashboards/${dashboardId}/edit`}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Link>
            </Button>
          </>
        }
      />

      {tabs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-white py-16 text-center">
          <p className="text-sm font-medium text-slate-700">
            This dashboard has no tabs yet
          </p>
          <p className="text-sm text-slate-500">
            Edit this dashboard to add tabs and panels.
          </p>
        </div>
      ) : (
        <Tabs
          value={currentTab}
          onValueChange={setActiveTab}
          className="flex flex-1 flex-col overflow-hidden"
        >
          {tabs.length > 1 && (
            <div className="overflow-x-auto border-b">
              <TabsList className="h-10 min-w-max justify-start gap-1 rounded-none bg-transparent p-0">
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-brand-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                  >
                    {tab.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          )}
          {tabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="mt-4 flex-1 overflow-auto">
              <DashboardTabView tab={tab} dashboardName={dashboard.name} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
