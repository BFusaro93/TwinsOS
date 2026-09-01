"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, BookmarkPlus, Pencil, Plus, Save, Trash2, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getDashboardTemplate } from "@/lib/reports/dashboard-templates";
import { panelFromGraphic } from "@/lib/reports/panel-from-graphic";
import { ALL_REPORTS } from "@/lib/reports/registry";
import {
  aggregateAlias,
  aggregateLabel,
  hydrateBuilder,
  useAnalysisConfigBuilder,
} from "@/lib/hooks/use-analysis-config-builder";
import {
  useCreateDashboard,
  useCreateSavedGraphic,
  useCustomReport,
  useCustomReports,
  useDashboard,
  useDeleteDashboard,
  useGraphicLibraryItems,
  useRunReport,
  useRunVisualQuery,
  useUpdateDashboard,
} from "@/lib/hooks/use-report-center";
import { getReport } from "@/lib/reports/registry";
import { REPORT_SECTIONS } from "@/types/crm-reports";
import type { CustomReport, DashboardPanel, DashboardTab, VisualSpec, VisualType } from "@/types/crm-reports";
import { AnalysisConfigEditor } from "./AnalysisConfigEditor";
import { computePresetRange } from "./ReportFilterBar";
import { ReportTable } from "./ReportTable";
import { VisualRenderer } from "./VisualRenderer";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { LayoutDashboard } from "lucide-react";

// ============================================================
// Dashboard Builder — page-based (no drag-and-drop) editor for
// dashboard tabs/panels, built on top of the analysis engine.
// ============================================================

const SIZE_OPTIONS: { value: DashboardPanel["size"]; label: string }[] = [
  { value: "third", label: "Third" },
  { value: "half", label: "Half" },
  { value: "full", label: "Full" },
];

const VISUAL_TYPE_OPTIONS: { value: VisualType; label: string }[] = [
  { value: "kpi", label: "KPI" },
  { value: "table", label: "Table" },
  { value: "bar", label: "Bar Chart" },
  { value: "line", label: "Line Chart" },
  { value: "pie", label: "Pie Chart" },
  { value: "gauge", label: "Gauge" },
  { value: "crosstab", label: "Crosstab" },
];

const SIZE_SPAN_CLASS: Record<DashboardPanel["size"], string> = {
  third: "md:col-span-2",
  half: "md:col-span-3",
  full: "md:col-span-6",
};

function defaultTabs(): DashboardTab[] {
  return [{ id: "tab-1", name: "Overview", panels: [], useDateFilter: true }];
}

function blankPanel(): DashboardPanel {
  return {
    id: crypto.randomUUID(),
    title: "New Panel",
    size: "half",
    visual: {
      type: "kpi",
      config: { dataset: "", columns: [], filters: [], groupBy: [], aggregates: [], sortDir: "asc" },
      useTabDateRange: false,
      valueColumns: [],
    },
  };
}

/** Builds a panel from an already-saved "My Reports" analysis instead of
 *  rebuilding the query from scratch — `config` is a snapshot copied in now
 *  (refreshable later from the panel editor), `savedReportId` just tracks
 *  which analysis it came from. Carries over the analysis's own chart
 *  settings (visualType/label/value/kpi columns) too — without this, adding
 *  a saved bar/line/pie/KPI analysis to a dashboard silently downgraded it
 *  to a bare table with no series selected. */
function panelFromSavedReport(report: CustomReport): DashboardPanel {
  return {
    id: crypto.randomUUID(),
    title: report.name,
    size: "half",
    visual: {
      type: report.visualType,
      config: report.config,
      useTabDateRange: false,
      labelColumn: report.labelColumn ?? undefined,
      valueColumns: report.valueColumns,
      kpiColumn: report.kpiColumn ?? undefined,
      savedReportId: report.id,
      formatRules: report.formatRules,
      colorSpectrumColumns: report.colorSpectrumColumns,
    },
  };
}

/** Builds a panel that embeds an existing Report Center prebuilt report by
 *  key — for reports with bespoke `run` logic (e.g. date-bucketed aging
 *  reports) that can't be expressed as a plain AnalysisConfig/VisualSpec.
 *  `visual` is an inert placeholder here; DashboardPanelView renders the
 *  report instead of it whenever `reportKey` is set. */
function panelFromReport(reportKey: string, name: string): DashboardPanel {
  return {
    id: crypto.randomUUID(),
    title: name,
    size: "half",
    reportKey,
    visual: {
      type: "table",
      config: { dataset: "unused", columns: [], filters: [], groupBy: [], aggregates: [], sortDir: "asc" },
      useTabDateRange: false,
      valueColumns: [],
    },
  };
}

/** "This month" range used for panel previews, in the viewer's LOCAL
 *  calendar day — computed fresh on each call (not a module-level constant,
 *  so a long-lived tab doesn't keep previewing last month once it rolls
 *  over) using local Y/M/D components directly rather than
 *  `.toISOString()`, which converts through UTC and can shift the date by
 *  a day for timezones ahead of UTC. */
function previewDateRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: iso(from), to: iso(to) };
}

export function DashboardBuilder({ dashboardId }: { dashboardId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can, isLoading: permissionsLoading } = usePermissions();
  const { data: existing, isLoading: loadingExisting } = useDashboard(dashboardId);
  const createDashboard = useCreateDashboard();
  const updateDashboard = useUpdateDashboard();
  const deleteDashboard = useDeleteDashboard();

  const [name, setName] = useState("Untitled Dashboard");
  const [description, setDescription] = useState("");
  const [tabs, setTabs] = useState<DashboardTab[]>(() => defaultTabs());
  const [activeTabId, setActiveTabId] = useState("tab-1");
  const [editingPanel, setEditingPanel] = useState<DashboardPanel | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [tabPendingRemoval, setTabPendingRemoval] = useState<DashboardTab | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [graphicPickerOpen, setGraphicPickerOpen] = useState(false);
  const [reportPickerOpen, setReportPickerOpen] = useState(false);
  const [reportSearch, setReportSearch] = useState("");
  const { data: savedReports = [] } = useCustomReports();
  const { items: graphicItems } = useGraphicLibraryItems();

  const reportSections = useMemo(() => {
    const q = reportSearch.trim().toLowerCase();
    return REPORT_SECTIONS.map((section) => ({
      ...section,
      reports: ALL_REPORTS.filter(
        (r) =>
          r.section === section.key &&
          !r.href && // link-out reports have no data to embed
          (q === "" || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q))
      ),
    })).filter((section) => section.reports.length > 0);
  }, [reportSearch]);

  // hydrate once when editing an existing dashboard
  useEffect(() => {
    if (!existing || hydrated) return;
    setName(existing.name);
    setDescription(existing.description ?? "");
    const nextTabs = existing.config.tabs.length > 0 ? existing.config.tabs : defaultTabs();
    setTabs(nextTabs);
    setActiveTabId(nextTabs[0].id);
    setHydrated(true);
  }, [existing, hydrated]);

  // apply a starter template once, only when creating a brand-new dashboard
  useEffect(() => {
    if (dashboardId || hydrated) return;
    const templateKey = searchParams.get("template");
    const template = getDashboardTemplate(templateKey ?? undefined);
    if (template) {
      setName(template.name);
      setDescription(template.description);
      setTabs(template.config.tabs.length > 0 ? template.config.tabs : defaultTabs());
      setActiveTabId(template.config.tabs[0]?.id ?? "tab-1");
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardId]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  const updateActiveTab = (updater: (tab: DashboardTab) => DashboardTab) => {
    setTabs((prev) => prev.map((t) => (t.id === activeTab.id ? updater(t) : t)));
  };

  const handleAddTab = () => {
    const newTab: DashboardTab = {
      id: crypto.randomUUID(),
      name: `Tab ${tabs.length + 1}`,
      panels: [],
      useDateFilter: false,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const performRemoveTab = (tab: DashboardTab) => {
    // Calling setActiveTabId inside the setTabs updater was a side effect
    // in what must be a pure function — updaters can run more than once per
    // commit (e.g. under StrictMode's double-invoke), which could fire the
    // side effect twice for one removal. Compute the next list first.
    const next = tabs.filter((t) => t.id !== tab.id);
    setTabs(next);
    if (activeTabId === tab.id) setActiveTabId(next[0]?.id ?? "");
  };

  const handleRemoveTab = (tab: DashboardTab) => {
    if (tab.panels.length > 0) {
      setTabPendingRemoval(tab);
    } else {
      performRemoveTab(tab);
    }
  };

  const handleSavePanel = (panel: DashboardPanel) => {
    updateActiveTab((tab) => {
      const exists = tab.panels.some((p) => p.id === panel.id);
      return {
        ...tab,
        panels: exists
          ? tab.panels.map((p) => (p.id === panel.id ? panel : p))
          : [...tab.panels, panel],
      };
    });
    setEditingPanel(null);
  };

  const handleRemovePanel = (panelId: string) => {
    updateActiveTab((tab) => ({ ...tab, panels: tab.panels.filter((p) => p.id !== panelId) }));
  };

  const saving = createDashboard.isPending || updateDashboard.isPending;

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaveError(null);
    try {
      if (dashboardId) {
        await updateDashboard.mutateAsync({
          id: dashboardId,
          name: name.trim(),
          description: description.trim() || null,
          config: { tabs },
        });
      } else {
        const created = await createDashboard.mutateAsync({
          name: name.trim(),
          description: description.trim() || null,
          config: { tabs },
        });
        router.push(`/crm/admin/reports/dashboards/${created.id}`);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleDelete = async () => {
    if (!dashboardId) return;
    await deleteDashboard.mutateAsync(dashboardId);
    router.push("/crm/admin/reports?tab=dashboards");
  };

  if (!permissionsLoading && !can("manage_report_center")) {
    return (
      <EmptyState
        icon={LayoutDashboard}
        title="No access"
        description="You don't have permission to manage dashboards."
      />
    );
  }

  if (dashboardId && loadingExisting) {
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
          <Link href="/crm/admin/reports?tab=dashboards">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Dashboards
          </Link>
        </Button>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 w-full sm:w-80 text-base font-semibold"
              placeholder="Untitled Dashboard"
            />
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-8 w-full sm:w-80 text-sm"
              placeholder="Description (optional)"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void handleSave()} disabled={saving || !name.trim()}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {saving ? "Saving…" : dashboardId ? "Save Changes" : "Save Dashboard"}
            </Button>
            {dashboardId && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this dashboard?</AlertDialogTitle>
                    <AlertDialogDescription>
                      &quot;{name}&quot; will be removed permanently.
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

      {/* tab bar */}
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTabId(tab.id)}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
              tab.id === activeTabId
                ? "border-brand-300 bg-brand-50 text-brand-900"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            {tab.name}
            {tabs.length > 1 && (
              <span
                role="button"
                tabIndex={0}
                aria-label={`Remove ${tab.name}`}
                className="rounded-full p-0.5 hover:bg-black/10"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveTab(tab);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    handleRemoveTab(tab);
                  }
                }}
              >
                <X className="h-3 w-3" />
              </span>
            )}
          </button>
        ))}
        <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={handleAddTab}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <AlertDialog
        open={tabPendingRemoval !== null}
        onOpenChange={(open) => !open && setTabPendingRemoval(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this tab?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{tabPendingRemoval?.name}&quot; has {tabPendingRemoval?.panels.length} panel
              {tabPendingRemoval?.panels.length === 1 ? "" : "s"} that will be removed with it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (tabPendingRemoval) performRemoveTab(tabPendingRemoval);
                setTabPendingRemoval(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {activeTab && (
        <>
          {/* active tab settings */}
          <Card>
            <CardContent className="flex flex-wrap items-center gap-4 pt-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-600">Tab Name</span>
                <Input
                  value={activeTab.name}
                  onChange={(e) => {
                    const newName = e.target.value;
                    updateActiveTab((tab) => ({ ...tab, name: newName }));
                  }}
                  className="h-8 w-48 text-sm"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <Checkbox
                  checked={activeTab.useDateFilter}
                  onCheckedChange={(checked) =>
                    updateActiveTab((tab) => ({ ...tab, useDateFilter: checked === true }))
                  }
                />
                Show a shared date range filter for this tab
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <Checkbox
                  checked={!!activeTab.useRepFilter}
                  onCheckedChange={(checked) =>
                    updateActiveTab((tab) => ({ ...tab, useRepFilter: checked === true }))
                  }
                />
                Show a shared Sales Rep filter for this tab
              </label>
            </CardContent>
          </Card>

          {/* panel grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
            {activeTab.panels.map((panel) => (
              <div key={panel.id} className={SIZE_SPAN_CLASS[panel.size]}>
                <PanelPreviewCard
                  panel={panel}
                  onEdit={() => setEditingPanel(panel)}
                  onRemove={() => handleRemovePanel(panel.id)}
                />
              </div>
            ))}
          </div>
          {activeTab.panels.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Preview uses this month — viewers can pick their own range on the live dashboard.
            </p>
          )}

          {!editingPanel && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingPanel(blankPanel())}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add Panel
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add From Saved Analysis
              </Button>
              <Button variant="outline" size="sm" onClick={() => setGraphicPickerOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add From Graphics Library
              </Button>
              <Button variant="outline" size="sm" onClick={() => setReportPickerOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add From Report Center
              </Button>
            </div>
          )}

          <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Panel From Saved Analysis</DialogTitle>
              </DialogHeader>
              <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
                {savedReports.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No saved analyses yet — build one in My Reports first.
                  </p>
                )}
                {savedReports.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setEditingPanel(panelFromSavedReport(r));
                      setPickerOpen(false);
                    }}
                    className="flex flex-col rounded-md border p-3 text-left text-sm hover:bg-accent"
                  >
                    <span className="font-medium">{r.name}</span>
                    {r.description && <span className="text-xs text-muted-foreground">{r.description}</span>}
                  </button>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={graphicPickerOpen} onOpenChange={setGraphicPickerOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Panel From Graphics Library</DialogTitle>
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
                      setEditingPanel(panelFromGraphic(g.name, g.visual));
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

          <Dialog open={reportPickerOpen} onOpenChange={setReportPickerOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Panel From Report Center</DialogTitle>
              </DialogHeader>
              <Input
                value={reportSearch}
                onChange={(e) => setReportSearch(e.target.value)}
                placeholder="Search reports…"
                className="h-9 text-sm"
              />
              <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
                {reportSections.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No reports match &quot;{reportSearch}&quot;.
                  </p>
                )}
                {reportSections.map((section) => (
                  <div key={section.key} className="flex flex-col gap-1">
                    <span className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {section.label}
                    </span>
                    {section.reports.map((r) => (
                      <button
                        key={r.key}
                        onClick={() => {
                          setEditingPanel(panelFromReport(r.key, r.name));
                          setReportPickerOpen(false);
                          setReportSearch("");
                        }}
                        className="flex flex-col rounded-md border p-3 text-left text-sm hover:bg-accent"
                      >
                        <span className="font-medium">{r.name}</span>
                        <span className="text-xs text-muted-foreground">{r.description}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          {editingPanel &&
            (editingPanel.reportKey ? (
              <ReportPanelEditor
                key={editingPanel.id}
                panel={editingPanel}
                onSave={handleSavePanel}
                onCancel={() => setEditingPanel(null)}
              />
            ) : (
              <PanelEditor
                key={editingPanel.id}
                panel={editingPanel}
                tabUsesDateFilter={activeTab.useDateFilter}
                tabUsesRepFilter={!!activeTab.useRepFilter}
                onSave={handleSavePanel}
                onCancel={() => setEditingPanel(null)}
              />
            ))}
        </>
      )}
    </div>
  );
}

function PanelPreviewCard({
  panel,
  onEdit,
  onRemove,
}: {
  panel: DashboardPanel;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [saveOpen, setSaveOpen] = useState(false);
  const isReportPanel = !!panel.reportKey;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm">{panel.title}</CardTitle>
        <div className="flex items-center gap-1">
          {!isReportPanel && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Save to Graphics Library"
              onClick={() => setSaveOpen(true)}
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" aria-label="Edit panel" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Remove panel"
            className="text-red-600"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {isReportPanel ? (
          <ReportPanelPreview reportKey={panel.reportKey!} params={panel.reportParams} />
        ) : (
          <VisualPanelPreview visual={panel.visual} />
        )}
      </CardContent>
      {!isReportPanel && (
        <SaveToGraphicsLibraryDialog panel={panel} open={saveOpen} onOpenChange={setSaveOpen} />
      )}
    </Card>
  );
}

function VisualPanelPreview({ visual }: { visual: VisualSpec }) {
  const { data, isLoading, error } = useRunVisualQuery(
    visual,
    visual.useTabDateRange ? previewDateRange() : undefined
  );
  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Failed to load</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }
  if (!data) return null;
  return <VisualRenderer result={data} visual={visual} />;
}

/** Default filter values for a prebuilt report's own filter bar, resolved
 *  fresh on every render — same logic as ReportViewer.tsx's standalone page
 *  and DashboardViewer.tsx's embed, duplicated here rather than shared
 *  across files to keep the builder decoupled from the viewer. */
function reportPreviewDefaultParams(filters: { key: string; type: string; defaultValue?: string }[]): Record<string, string> {
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

function ReportPanelPreview({
  reportKey,
  params,
}: {
  reportKey: string;
  params?: Record<string, string>;
}) {
  const def = getReport(reportKey);
  const effectiveParams = useMemo(
    () => ({ ...(def ? reportPreviewDefaultParams(def.filters) : {}), ...params }),
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
  if (isFetching && !data) return <Skeleton className="h-32 w-full" />;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Failed to load</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }
  if (!data) return null;
  return (
    <div className="max-h-72 overflow-auto">
      <ReportTable result={data} formatRules={def.formatRules} />
    </div>
  );
}

function SaveToGraphicsLibraryDialog({
  panel,
  open,
  onOpenChange,
}: {
  panel: DashboardPanel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createSavedGraphic = useCreateSavedGraphic();
  const [name, setName] = useState(panel.title);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(panel.title);
      setDescription("");
      setCategory("");
      setError(null);
    }
  }, [open, panel.title]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      await createSavedGraphic.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        category: category.trim() || null,
        visual: panel.visual,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Save to Graphics Library</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="h-9 text-sm"
          />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="h-9 text-sm"
          />
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category (optional)"
            className="h-9 text-sm"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={!name.trim() || createSavedGraphic.isPending}
          >
            {createSavedGraphic.isPending ? "Saving…" : "Save Graphic"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Editor for a report-embed panel — deliberately minimal (just title/size)
 *  since the data comes entirely from the report definition, not a
 *  user-configured query. */
function ReportPanelEditor({
  panel,
  onSave,
  onCancel,
}: {
  panel: DashboardPanel;
  onSave: (panel: DashboardPanel) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(panel.title);
  const [size, setSize] = useState<DashboardPanel["size"]>(panel.size);
  const def = getReport(panel.reportKey!);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Panel Settings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-9 w-64 text-sm"
            placeholder="Panel title"
          />
          <Select value={size} onValueChange={(v) => setSize(v as DashboardPanel["size"])}>
            <SelectTrigger className="h-9 w-32 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIZE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            Embeds &quot;{def?.name ?? panel.reportKey}&quot; from the Report Center — its filters,
            exports, and schedule live on the full report page.
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <ReportPanelPreview reportKey={panel.reportKey!} params={panel.reportParams} />
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => onSave({ ...panel, title, size })}>
          Save Panel
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

interface PanelEditorProps {
  panel: DashboardPanel;
  tabUsesDateFilter: boolean;
  tabUsesRepFilter: boolean;
  onSave: (panel: DashboardPanel) => void;
  onCancel: () => void;
}

function PanelEditor({ panel, tabUsesDateFilter, tabUsesRepFilter, onSave, onCancel }: PanelEditorProps) {
  const [title, setTitle] = useState(panel.title);
  const [size, setSize] = useState<DashboardPanel["size"]>(panel.size);
  const [visualType, setVisualType] = useState<VisualType>(panel.visual.type);
  const [useTabDateRange, setUseTabDateRange] = useState(panel.visual.useTabDateRange);
  const [useTabRepFilter, setUseTabRepFilter] = useState(!!panel.visual.useTabRepFilter);
  const [relativeDateFilter, setRelativeDateFilter] = useState(
    panel.visual.relativeDateFilter ?? "none"
  );
  const [labelColumn, setLabelColumn] = useState(panel.visual.labelColumn ?? "");
  const [valueColumns, setValueColumns] = useState<string[]>(panel.visual.valueColumns);
  const [kpiColumn, setKpiColumn] = useState(panel.visual.kpiColumn ?? "");
  const [gaugeMax, setGaugeMax] = useState(panel.visual.gaugeMax?.toString() ?? "");
  const [budgetColumn, setBudgetColumn] = useState(panel.visual.budgetColumn ?? "");
  const [crosstabHeaderColumn, setCrosstabHeaderColumn] = useState(
    panel.visual.crosstabHeaderColumn ?? ""
  );
  const [stacked, setStacked] = useState(panel.visual.stacked ?? false);
  const [topN, setTopN] = useState(panel.visual.topN?.toString() ?? "");
  const [showOthers, setShowOthers] = useState(panel.visual.showOthers ?? false);
  const [savedReportId, setSavedReportId] = useState(panel.visual.savedReportId);
  const [formatRules, setFormatRules] = useState(panel.visual.formatRules);
  const [colorSpectrumColumns, setColorSpectrumColumns] = useState(panel.visual.colorSpectrumColumns);
  const { data: linkedReport } = useCustomReport(savedReportId);

  const builder = useAnalysisConfigBuilder(
    panel.visual.config.dataset ? panel.visual.config : undefined,
    () => {
      // Switching datasets invalidates any chart column references built
      // against the old one, and breaks the panel's link to its source
      // analysis (which is tied to that dataset) — reset both.
      setLabelColumn("");
      setValueColumns([]);
      setKpiColumn("");
      setSavedReportId(undefined);
      setFormatRules(undefined);
    }
  );

  const [previewVisual, setPreviewVisual] = useState<VisualSpec | undefined>(undefined);
  const {
    data: previewData,
    isLoading: previewLoading,
    error: previewError,
  } = useRunVisualQuery(previewVisual, previewVisual?.useTabDateRange ? previewDateRange() : undefined);

  const { grouped, groupBy, aggregates, columns, numericFields, fields, formulas } = builder;

  // Formula columns are always numeric, so they belong in both the general
  // output-column list (label columns, format rules) and the numeric-only
  // value-column list (chart series, gauge/budget columns, color spectrum).
  const formulaOptions = useMemo(
    () =>
      formulas
        .filter((f) => f.name && f.left && f.right)
        .map((f) => ({ value: f.name, label: f.name })),
    [formulas]
  );

  // "output columns" option set: grouped -> groupBy + aggregate aliases; else plain columns
  const outputOptions = useMemo(() => {
    const base = grouped
      ? [
          ...groupBy.map((key) => ({
            value: key,
            label: fields.find((f) => f.key === key)?.label ?? key,
          })),
          ...aggregates
            .filter((a) => a.column)
            .map((a) => ({ value: aggregateAlias(a), label: aggregateLabel(a, fields) })),
        ]
      : columns.map((key) => ({
          value: key,
          label: fields.find((f) => f.key === key)?.label ?? key,
        }));
    return [...base, ...formulaOptions];
  }, [grouped, groupBy, aggregates, columns, fields, formulaOptions]);

  // value-column option set for charts: grouped -> aggregate aliases only; else numeric fields
  const valueOptions = useMemo(() => {
    const base = grouped
      ? aggregates
          .filter((a) => a.column)
          .map((a) => ({ value: aggregateAlias(a), label: aggregateLabel(a, fields) }))
      : numericFields.map((f) => ({ value: f.key, label: f.label }));
    return [...base, ...formulaOptions];
  }, [grouped, aggregates, numericFields, fields, formulaOptions]);

  const isChart = visualType === "bar" || visualType === "line" || visualType === "pie";

  const buildVisual = (): VisualSpec | null => {
    const config = builder.buildConfig();
    if (!config) return null;
    return {
      type: visualType,
      config,
      useTabDateRange,
      useTabRepFilter: useTabRepFilter || undefined,
      relativeDateFilter:
        relativeDateFilter === "today" || relativeDateFilter === "yesterday"
          ? relativeDateFilter
          : undefined,
      labelColumn: labelColumn || undefined,
      valueColumns,
      kpiColumn: kpiColumn || undefined,
      gaugeMax:
        visualType === "gauge" && gaugeMax && Number.isFinite(Number(gaugeMax)) && Number(gaugeMax) > 0
          ? Number(gaugeMax)
          : undefined,
      budgetColumn: visualType === "gauge" && budgetColumn ? budgetColumn : undefined,
      stacked: visualType === "bar" ? stacked : undefined,
      topN:
        (visualType === "bar" || visualType === "pie") &&
        topN &&
        Number.isFinite(Number(topN)) &&
        Number(topN) > 0
          ? Math.floor(Number(topN))
          : undefined,
      showOthers: (visualType === "bar" || visualType === "pie") ? showOthers : undefined,
      crosstabHeaderColumn: visualType === "crosstab" ? crosstabHeaderColumn || undefined : undefined,
      savedReportId,
      formatRules,
      colorSpectrumColumns,
    };
  };

  function handleRefreshFromSource() {
    if (!linkedReport) return;
    hydrateBuilder(builder, linkedReport.config);
    setFormatRules(linkedReport.formatRules);
    setColorSpectrumColumns(linkedReport.colorSpectrumColumns);
    // Also pick up chart-setting changes made in My Reports since this panel
    // was linked/last refreshed — otherwise "refresh" only ever updated the
    // underlying query, silently leaving a stale visualization behind it.
    setVisualType(linkedReport.visualType);
    setLabelColumn(linkedReport.labelColumn ?? "");
    setValueColumns(linkedReport.valueColumns);
    setKpiColumn(linkedReport.kpiColumn ?? "");
  }

  function handleUnlink() {
    setSavedReportId(undefined);
  }

  const handlePreview = () => {
    const visual = buildVisual();
    if (visual) setPreviewVisual(visual);
  };

  const canSave =
    builder.canRun &&
    (visualType === "kpi" || visualType === "gauge"
      ? !!kpiColumn
      : visualType === "crosstab"
        ? !!labelColumn && !!crosstabHeaderColumn && valueColumns.length > 0
        : isChart
          ? !!labelColumn && valueColumns.length > 0
          : true);

  const handleSave = () => {
    const visual = buildVisual();
    if (!visual || !canSave) return;
    onSave({ id: panel.id, title, size, visual });
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-4">
      {savedReportId && (
        <div className="flex items-center justify-between rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
          <span>
            Linked to saved analysis{linkedReport ? `: "${linkedReport.name}"` : "…"}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={handleRefreshFromSource} disabled={!linkedReport}>
              Refresh from source
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={handleUnlink}>
              Unlink
            </Button>
          </div>
        </div>
      )}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">1. Panel Settings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-9 w-64 text-sm"
            placeholder="Panel title"
          />
          <Select value={size} onValueChange={(v) => setSize(v as DashboardPanel["size"])}>
            <SelectTrigger className="h-9 w-32 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIZE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={visualType} onValueChange={(v) => setVisualType(v as VisualType)}>
            <SelectTrigger className="h-9 w-40 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VISUAL_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {tabUsesDateFilter && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <Checkbox
                checked={useTabDateRange}
                onCheckedChange={(checked) => setUseTabDateRange(checked === true)}
              />
              Use this tab&apos;s shared date range
            </label>
          )}
          {tabUsesRepFilter && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <Checkbox
                checked={useTabRepFilter}
                onCheckedChange={(checked) => setUseTabRepFilter(checked === true)}
              />
              Use this tab&apos;s shared Sales Rep filter
            </label>
          )}
          <Select value={relativeDateFilter} onValueChange={setRelativeDateFilter}>
            <SelectTrigger className="h-9 w-44 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No relative date filter</SelectItem>
              <SelectItem value="today">Filter to today</SelectItem>
              <SelectItem value="yesterday">Filter to yesterday</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <AnalysisConfigEditor builder={builder} stepOffset={1} />

      {builder.datasetDef && isChart && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">8. Chart Fields</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-32 text-xs font-medium text-slate-600">Label Column</span>
              <Select value={labelColumn} onValueChange={setLabelColumn}>
                <SelectTrigger className="h-8 w-full sm:w-64 text-sm">
                  <SelectValue placeholder="Choose a label column…" />
                </SelectTrigger>
                <SelectContent>
                  {outputOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-600">Value Column(s)</p>
              {visualType === "pie" ? (
                <Select
                  value={valueColumns[0] ?? ""}
                  onValueChange={(v) => setValueColumns([v])}
                >
                  <SelectTrigger className="h-8 w-64 text-sm">
                    <SelectValue placeholder="Choose a value column…" />
                  </SelectTrigger>
                  <SelectContent>
                    {valueOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
                  {valueOptions.map((o) => (
                    <label
                      key={o.value}
                      className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"
                    >
                      <Checkbox
                        checked={valueColumns.includes(o.value)}
                        onCheckedChange={(checked) =>
                          setValueColumns((prev) =>
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
              )}
            </div>
            {visualType === "bar" && valueColumns.length > 1 && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <Checkbox
                  checked={stacked}
                  onCheckedChange={(checked) => setStacked(checked === true)}
                />
                Stack value columns in one bar
              </label>
            )}
            {(visualType === "bar" || visualType === "pie") && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-32 text-xs font-medium text-slate-600">Limit To</span>
                <Input
                  type="number"
                  value={topN}
                  onChange={(e) => setTopN(e.target.value)}
                  placeholder="e.g. 10 (blank = all)"
                  className="h-8 w-44 text-sm"
                />
                {topN && (
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <Checkbox
                      checked={showOthers}
                      onCheckedChange={(checked) => setShowOthers(checked === true)}
                    />
                    Group the rest into &quot;Others&quot;
                  </label>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {builder.datasetDef && visualType === "kpi" && (
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
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {builder.datasetDef && visualType === "gauge" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">8. Chart Fields</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-32 text-xs font-medium text-slate-600">Gauge Value</span>
              <Select value={kpiColumn} onValueChange={setKpiColumn}>
                <SelectTrigger className="h-8 w-64 text-sm">
                  <SelectValue placeholder="Choose a value…" />
                </SelectTrigger>
                <SelectContent>
                  {outputOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-32 text-xs font-medium text-slate-600">Budget Column</span>
              <Select
                value={budgetColumn || "__none"}
                onValueChange={(v) => setBudgetColumn(v === "__none" ? "" : v)}
              >
                <SelectTrigger className="h-8 w-64 text-sm">
                  <SelectValue placeholder="None — use a fixed max instead" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None — use a fixed max instead</SelectItem>
                  {outputOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                A column from this same query (e.g. budgeted hours) to use as the scale&apos;s max.
              </span>
            </div>
            {!budgetColumn && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-32 text-xs font-medium text-slate-600">Fixed Gauge Max</span>
                <Input
                  type="number"
                  value={gaugeMax}
                  onChange={(e) => setGaugeMax(e.target.value)}
                  placeholder="e.g. 100000"
                  className="h-8 w-40 text-sm"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {builder.datasetDef && visualType === "crosstab" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">8. Chart Fields</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-32 text-xs font-medium text-slate-600">Row Label</span>
              <Select value={labelColumn} onValueChange={setLabelColumn}>
                <SelectTrigger className="h-8 w-64 text-sm">
                  <SelectValue placeholder="Choose a row label column…" />
                </SelectTrigger>
                <SelectContent>
                  {outputOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-32 text-xs font-medium text-slate-600">Header Column</span>
              <Select value={crosstabHeaderColumn} onValueChange={setCrosstabHeaderColumn}>
                <SelectTrigger className="h-8 w-64 text-sm">
                  <SelectValue placeholder="Choose a column to pivot into headers…" />
                </SelectTrigger>
                <SelectContent>
                  {outputOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-32 text-xs font-medium text-slate-600">Value Column</span>
              <Select value={valueColumns[0] ?? ""} onValueChange={(v) => setValueColumns([v])}>
                <SelectTrigger className="h-8 w-64 text-sm">
                  <SelectValue placeholder="Choose a value to aggregate…" />
                </SelectTrigger>
                <SelectContent>
                  {valueOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Group By must include both the row label and header columns for a meaningful pivot.
            </p>
          </CardContent>
        </Card>
      )}

      {builder.datasetDef && (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-4">
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreview}
                disabled={!builder.canRun}
              >
                Preview
              </Button>
            </div>
            {previewLoading && <Skeleton className="h-32 w-full" />}
            {previewError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Preview failed</AlertTitle>
                <AlertDescription>{previewError.message}</AlertDescription>
              </Alert>
            )}
            {previewData && previewVisual && !previewLoading && !previewError && (
              <VisualRenderer result={previewData} visual={previewVisual} />
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSave} disabled={!canSave}>
          Save Panel
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
