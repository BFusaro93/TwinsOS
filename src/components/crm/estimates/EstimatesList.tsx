"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEstimates, useBulkImportEstimates } from "@/lib/hooks/use-estimates";
import { ImportExportMenu } from "@/components/shared/ImportExportMenu";
import { exportCSV } from "@/lib/csv";
import { NewEstimateDialog } from "./NewEstimateDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatCurrency } from "@/lib/utils";
import { bpsToPercent } from "@/lib/estimate-calc";
import { Plus, FileText, Search, X, ChevronDown, RotateCcw, Copy, List, Columns } from "lucide-react";
import type { EstimateStage } from "@/types/crm-estimates";
import { useUpdateEstimateStage } from "@/lib/hooks/use-estimates";
import { useEstimateStages } from "@/lib/hooks/use-estimate-stages";
import { EstimatesPipelineView } from "./EstimatesPipelineView";
import { DuplicateEstimateDialog } from "./DuplicateEstimateDialog";
import { DEFAULT_SUBJECT, DEFAULT_TEMPLATE_BODY } from "./SendEstimateDialog";
import { useEmailTemplates } from "@/lib/hooks/use-email-templates";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { ColumnChooser } from "@/components/shared/ColumnChooser";
import type { ColumnDef } from "@/components/shared/ColumnChooser";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ESTIMATE_COLUMNS: ColumnDef[] = [
  { key: "number",      label: "Estimate #",   locked: true },
  { key: "stage",       label: "Stage" },
  { key: "client",      label: "Client / Lead" },
  { key: "description", label: "Description" },
  { key: "date",        label: "Date" },
  { key: "valid_until", label: "Valid Until" },
  { key: "sales_rep",   label: "Sales Rep" },
  { key: "prob",        label: "Prob %" },
  { key: "income",      label: "Income" },
  { key: "gp",          label: "Gross Profit" },
  { key: "margin",      label: "Margin" },
];

// Fallbacks for when crm_estimate_stages hasn't loaded yet (or a stage_key has
// no matching row) — colors aren't stored per-org (no color column on
// crm_estimate_stages), so these stay a fixed palette keyed by stage_key.
// Labels, order, and which stages exist at all come from the DB below.
const FALLBACK_STAGE_COLOR: Record<string, string> = {
  draft:    "bg-slate-100 text-slate-600",
  quote:    "bg-blue-100 text-blue-700",
  sent:     "bg-yellow-100 text-yellow-700",
  accepted: "bg-green-100 text-green-700",
  lost:     "bg-red-100 text-red-600",
  invoiced: "bg-teal-100 text-teal-700",
};

const FALLBACK_STAGE_LABEL: Record<string, string> = {
  draft:    "Draft",
  quote:    "Quote",
  sent:     "Sent",
  accepted: "Accepted",
  lost:     "Lost",
  invoiced: "Invoiced",
};

type StageFilter = EstimateStage | "all";

const FALLBACK_STAGE_TABS: { value: StageFilter; label: string }[] = [
  { value: "all",      label: "All Estimates" },
  { value: "draft",    label: "Draft" },
  { value: "quote",    label: "Quote" },
  { value: "sent",     label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "lost",     label: "Lost" },
  { value: "invoiced", label: "Invoiced" },
];

type FilterKey = "description" | "client" | "stage" | "date" | "sales_rep";

const FILTER_BUTTONS: { key: FilterKey; label: string }[] = [
  { key: "description", label: "Description" },
  { key: "client",      label: "Client" },
  { key: "stage",       label: "Stage" },
  { key: "date",        label: "Date" },
  { key: "sales_rep",   label: "Sales Rep" },
];

function formatDate(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

interface Props {
  clientId?: string;
}

const ESTIMATE_TEMPLATE_COLUMNS = [
  "clientName", "description", "estimateDate", "validUntilDate", "poNumber", "stage",
];

export function EstimatesList({ clientId }: Props) {
  const router = useRouter();
  const { data: estimates, isLoading, refetch } = useEstimates(clientId);
  const { mutateAsync: updateStage } = useUpdateEstimateStage();
  const { mutateAsync: bulkImportEstimates } = useBulkImportEstimates();
  const { data: emailTemplates } = useEmailTemplates("estimate");
  const [emailingSelected, setEmailingSelected] = useState(false);
  const [dialogOpen,      setDialogOpen]      = useState(false);
  const [stageFilter,     setStageFilter]     = useState<StageFilter>("all");
  const [search,          setSearch]          = useState("");
  const [activeFilterKey, setActiveFilterKey] = useState<FilterKey | null>(null);
  const [filterValue,     setFilterValue]     = useState("");
  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(new Set());
  const [duplicateTarget, setDuplicateTarget] = useState<{ id: string; description: string } | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "pipeline">("list");
  const { data: estimateStages = [] } = useEstimateStages();
  const [visibleKeys,     setVisibleKeys]     = useState<string[]>(
    ESTIMATE_COLUMNS.filter((c) => c.key !== "prob" && c.key !== "valid_until").map((c) => c.key)
  );

  const allEstimates = estimates ?? [];

  // Stage tabs/labels come from the org's configurable crm_estimate_stages
  // (sorted by sort_order); fall back to the system defaults only while that
  // hook is still loading or for a stage_key with no matching row.
  const stageTabs = useMemo<{ value: StageFilter; label: string }[]>(() => {
    if (estimateStages.length === 0) return FALLBACK_STAGE_TABS;
    const sorted = [...estimateStages].sort((a, b) => a.sortOrder - b.sortOrder);
    return [
      { value: "all" as StageFilter, label: "All Estimates" },
      ...sorted.map((s) => ({ value: s.stageKey as StageFilter, label: s.name })),
    ];
  }, [estimateStages]);

  const stageLabel = useMemo(() => {
    const map: Record<string, string> = { ...FALLBACK_STAGE_LABEL };
    for (const s of estimateStages) map[s.stageKey] = s.name;
    return map;
  }, [estimateStages]);

  const stageColor = useMemo(() => {
    const map: Record<string, string> = { ...FALLBACK_STAGE_COLOR };
    for (const s of estimateStages) {
      if (!map[s.stageKey]) map[s.stageKey] = "bg-slate-100 text-slate-600";
    }
    return map;
  }, [estimateStages]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: allEstimates.length };
    for (const t of stageTabs) {
      if (t.value !== "all") c[t.value] = allEstimates.filter((e) => e.stage === t.value).length;
    }
    return c;
  }, [allEstimates, stageTabs]);

  const filtered = useMemo(() => {
    let list = stageFilter === "all" ? allEstimates : allEstimates.filter((e) => e.stage === stageFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          (e.description ?? "").toLowerCase().includes(q) ||
          (e.clientName ?? "").toLowerCase().includes(q)
      );
    }
    if (activeFilterKey && filterValue.trim()) {
      const fv = filterValue.toLowerCase();
      list = list.filter((e) => {
        switch (activeFilterKey) {
          case "description": return (e.description ?? "").toLowerCase().includes(fv);
          case "client":      return (e.clientName ?? "").toLowerCase().includes(fv);
          case "stage":       return e.stage.toLowerCase().includes(fv);
          case "date":        return (e.estimateDate ?? "").includes(fv);
          case "sales_rep":   return (e.salesRepName ?? "").toLowerCase().includes(fv);
          default:            return true;
        }
      });
    }
    return list;
  }, [allEstimates, stageFilter, search, activeFilterKey, filterValue]);

  const totalIncome  = filtered.reduce((s, e) => s + (e.revenueCents ?? 0), 0);
  const totalGP      = filtered.reduce((s, e) => s + (e.grossProfitCents ?? 0), 0);
  const avgMarginBps = totalIncome > 0 ? Math.round((totalGP / totalIncome) * 10000) : 0;

  const allSelected  = filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id));
  const someSelected = selectedIds.size > 0;

  function toggleAll() {
    if (allSelected) { setSelectedIds(new Set()); }
    else { setSelectedIds(new Set(filtered.map((e) => e.id))); }
  }
  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function bulkSetStage(stage: EstimateStage) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await Promise.all(ids.map((id) => updateStage({ id, stage })));
      toast.success(`${ids.length} estimate${ids.length > 1 ? "s" : ""} updated`);
      setSelectedIds(new Set());
      refetch();
    } catch { toast.error("Failed to update estimates"); }
  }

  // Actually sends an email per selected estimate (via the same endpoint the
  // single-estimate "Send" dialog uses) — this used to just flip the stage
  // to "sent" with a fake success toast and never email anyone.
  async function bulkEmailSelected() {
    const targets = (estimates ?? []).filter((e) => selectedIds.has(e.id));
    if (targets.length === 0) return;

    const template = emailTemplates?.find((t) => t.isDefault) ?? emailTemplates?.[0];
    const subject = template?.subject ?? DEFAULT_SUBJECT;
    const bodyHtml = template?.bodyHtml ?? DEFAULT_TEMPLATE_BODY;

    setEmailingSelected(true);
    try {
      const results = await Promise.allSettled(
        targets.map((e) =>
          fetch(`/api/crm/estimates/${e.id}/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subject, bodyHtml, expiresInDays: 30 }),
          }).then(async (res) => {
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error ?? `Failed to email estimate #${e.estimateNumber}`);
            }
          })
        )
      );
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - succeeded;
      if (succeeded > 0) toast.success(`Emailed ${succeeded} estimate${succeeded !== 1 ? "s" : ""}`);
      if (failed > 0) toast.error(`Failed to email ${failed} estimate${failed !== 1 ? "s" : ""} — check they have a client email on file`);
      setSelectedIds(new Set());
      refetch();
    } finally {
      setEmailingSelected(false);
    }
  }

  const visibleColumns = clientId
    ? ESTIMATE_COLUMNS.filter((c) => c.key !== "client" && visibleKeys.includes(c.key))
    : ESTIMATE_COLUMNS.filter((c) => visibleKeys.includes(c.key));

  const colSpan = visibleColumns.length + 2; // +checkbox +actions

  return (
    <div className="flex h-full flex-col gap-4">

      {/* ── 1. Page header ── */}
      {!clientId && (
        <PageHeader
          title="Estimates"
          description={!isLoading ? `${allEstimates.length} estimates${totalIncome > 0 ? ` · ${formatCurrency(totalIncome)} income · ${bpsToPercent(avgMarginBps)} avg margin` : ""}` : undefined}
          action={
            <div className="flex items-center gap-2">
              <ImportExportMenu
                entityLabel="Estimates"
                templateColumns={ESTIMATE_TEMPLATE_COLUMNS}
                templateFilename="estimates-template.csv"
                requiredColumns={["clientName", "description"]}
                onExport={() =>
                  exportCSV(
                    allEstimates.map((e) => ({
                      clientName: e.clientName ?? "",
                      description: e.description,
                      estimateDate: e.estimateDate,
                      validUntilDate: e.validUntilDate ?? "",
                      poNumber: e.poNumber ?? "",
                      stage: e.stage,
                    })),
                    "estimates-export.csv"
                  )
                }
                onImport={async (rows) => {
                  const { created, skipped } = await bulkImportEstimates(rows);
                  if (skipped > 0) {
                    toast.warning(`Imported ${created} estimate${created !== 1 ? "s" : ""}. ${skipped} row${skipped !== 1 ? "s" : ""} skipped (unmatched client or missing description).`);
                  } else {
                    toast.success(`Successfully imported ${created} estimate${created !== 1 ? "s" : ""}.`);
                  }
                }}
              />
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> New Estimate
              </Button>
            </div>
          }
        />
      )}

      {/* ── 2. White column filter bar ── */}
      <div className="flex items-center gap-1.5 border-b bg-white px-4 py-2">
        <span className="shrink-0 text-xs text-slate-500 font-medium mr-1">Select a Filter:</span>
        <div className="flex items-center gap-1 overflow-x-auto">
          {FILTER_BUTTONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                if (activeFilterKey === key) { setActiveFilterKey(null); setFilterValue(""); }
                else { setActiveFilterKey(key); setFilterValue(""); }
              }}
              className={cn(
                "rounded px-2 py-0.5 text-xs transition-colors whitespace-nowrap",
                activeFilterKey === key
                  ? "bg-brand-100 text-brand-700 font-medium"
                  : "hover:bg-slate-100 text-slate-600"
              )}
            >
              {label}
            </button>
          ))}
          {activeFilterKey && (
            <>
              <Input
                autoFocus
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                placeholder={`Filter by ${FILTER_BUTTONS.find((f) => f.key === activeFilterKey)?.label}…`}
                className="ml-2 h-6 w-48 text-xs"
              />
              <button onClick={() => { setActiveFilterKey(null); setFilterValue(""); }} className="text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
        {clientId && (
          <div className="ml-auto">
            <Button size="sm" className="h-7 text-xs" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1 h-3 w-3" /> New Estimate
            </Button>
          </div>
        )}
      </div>

      {/* ── 3. Dark actions bar with stage tabs + search ── */}
      <div className="flex items-center justify-between bg-[#4a4a4a] px-4 py-2">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-7 bg-[#5a5a5a] border-[#6a6a6a] text-white hover:bg-[#6a6a6a] text-xs px-3"
              >
                Actions {someSelected && <span className="ml-1 rounded-full bg-white/20 px-1.5 text-[10px]">{selectedIds.size}</span>}
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                disabled={!someSelected || emailingSelected}
                onSelect={() => void bulkEmailSelected()}
              >
                {emailingSelected ? "Emailing…" : "Email Selected"}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!someSelected}
                onSelect={() => { toast.info("Opening print view…"); window.print(); }}
              >
                Print Selected
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!someSelected} onSelect={() => bulkSetStage("sent")}>
                Mark as Sent
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!someSelected} onSelect={() => bulkSetStage("accepted")}>
                Mark as Accepted
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={selectedIds.size !== 1}
                onSelect={() => {
                  const id = Array.from(selectedIds)[0];
                  const est = filtered.find((e) => e.id === id);
                  if (est) setDuplicateTarget({ id: est.id, description: est.description ?? "" });
                }}
              >
                <Copy className="mr-2 h-3.5 w-3.5" /> Copy Estimate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!someSelected}
                className="text-red-600 focus:text-red-600"
                onSelect={() => bulkSetStage("lost")}
              >
                Mark as Lost
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={() => refetch()}
            className="flex h-7 w-7 items-center justify-center rounded border border-[#6a6a6a] bg-[#5a5a5a] text-white hover:bg-[#6a6a6a]"
            title="Refresh"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <div className="ml-2 flex items-center gap-1 overflow-x-auto">
            {stageTabs.map(({ value, label }) => {
              const count = counts[value] ?? 0;
              return (
                <button
                  key={value}
                  onClick={() => setStageFilter(value)}
                  className={cn(
                    "flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                    stageFilter === value
                      ? "bg-white text-slate-800"
                      : "text-slate-300 hover:text-white"
                  )}
                >
                  {label}
                  {count > 0 && (
                    <span className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      stageFilter === value
                        ? "bg-slate-200 text-slate-700"
                        : "bg-white/20 text-white"
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="relative ml-2">
            <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-7 w-44 pl-7 text-xs bg-white border-slate-200 focus-visible:ring-0"
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode("list")}
            title="List view"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded border transition-colors",
              viewMode === "list"
                ? "border-white bg-white text-slate-700"
                : "border-[#6a6a6a] bg-[#5a5a5a] text-white hover:bg-[#6a6a6a]"
            )}
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewMode("pipeline")}
            title="Pipeline view"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded border transition-colors",
              viewMode === "pipeline"
                ? "border-white bg-white text-slate-700"
                : "border-[#6a6a6a] bg-[#5a5a5a] text-white hover:bg-[#6a6a6a]"
            )}
          >
            <Columns className="h-3.5 w-3.5" />
          </button>
        </div>

        {viewMode === "list" && (
          <ColumnChooser
            columns={clientId ? ESTIMATE_COLUMNS.filter((c) => c.key !== "client") : ESTIMATE_COLUMNS}
            visibleKeys={visibleKeys}
            onVisibleKeysChange={setVisibleKeys}
          />
        )}
      </div>

      {/* Pipeline view */}
      {viewMode === "pipeline" && (
        <EstimatesPipelineView
          estimates={filtered}
          stages={estimateStages}
          onEstimateClick={(id) => router.push(`/crm/estimates/${id}`)}
          onStageChange={(id, stage) => updateStage({ id, stage })}
        />
      )}

      {/* Table */}
      {viewMode === "list" && (
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 border-b z-10">
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 accent-brand-500"
                  checked={allSelected}
                  onChange={toggleAll}
                />
              </th>
              {visibleColumns.map((col) => (
                <th key={col.key} className={cn(
                  "px-3 py-2.5",
                  ["prob","income","gp","margin"].includes(col.key) ? "text-right" : ""
                )}>
                  {col.label}
                </th>
              ))}
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: colSpan }).map((__, j) => (
                    <td key={j} className="px-3 py-2.5">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="py-20 text-center text-sm text-slate-400">
                  {stageFilter !== "all" || activeFilterKey || search
                    ? "No estimates match the current filters"
                    : "No estimates yet — create one to get started"}
                </td>
              </tr>
            ) : (
              filtered.map((e) => {
                const marginBps = e.revenueCents > 0
                  ? Math.round((e.grossProfitCents / e.revenueCents) * 10000)
                  : 0;
                return (
                  <tr key={e.id} className={cn(
                    "group cursor-pointer border-b hover:bg-slate-50",
                    selectedIds.has(e.id) && "bg-brand-50"
                  )} onClick={() => router.push(`/crm/estimates/${e.id}`)}>

                    <td className="w-10 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 accent-brand-500"
                        checked={selectedIds.has(e.id)}
                        onChange={() => toggleRow(e.id)}
                      />
                    </td>
                    {visibleColumns.map((col) => {
                      switch (col.key) {
                        case "number":
                          return <td key={col.key} className="px-3 py-2.5 text-xs font-mono text-slate-400">{e.estimateNumber ? `#${e.estimateNumber}` : "—"}</td>;
                        case "stage":
                          return (
                            <td key={col.key} className="px-3 py-2.5">
                              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap", stageColor[e.stage])}>
                                {stageLabel[e.stage] ?? e.stage}
                              </span>
                            </td>
                          );
                        case "client":
                          return (
                            <td key={col.key} className="px-3 py-2.5 max-w-[180px]" onClick={(ev) => ev.stopPropagation()}>
                              <Link href={`/crm/clients/${e.clientId}`} className="block font-medium text-brand-600 hover:underline truncate">
                                {e.clientName ?? "—"}
                              </Link>
                              {(() => {
                                const fullAddress = [e.clientAddress, e.clientCity, e.clientState, e.clientZip]
                                  .filter(Boolean)
                                  .join(", ");
                                return fullAddress ? (
                                  <p className="text-[10px] text-slate-400 truncate">{fullAddress}</p>
                                ) : null;
                              })()}
                            </td>
                          );
                        case "description":
                          return (
                            <td key={col.key} className="px-3 py-2.5 max-w-[200px]">
                              <Link href={`/crm/estimates/${e.id}`} className="block text-slate-700 hover:text-brand-600 hover:underline truncate text-xs">
                                {e.description || "(no description)"}
                              </Link>
                            </td>
                          );
                        case "date":
                          return <td key={col.key} className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{e.estimateDate ? formatDate(e.estimateDate) : "—"}</td>;
                        case "valid_until":
                          return <td key={col.key} className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{e.validUntilDate ? formatDate(e.validUntilDate) : "—"}</td>;
                        case "sales_rep":
                          return <td key={col.key} className="px-3 py-2.5 text-xs text-slate-600">{e.salesRepName ?? "—"}</td>;
                        case "prob":
                          return <td key={col.key} className="px-3 py-2.5 text-right text-xs text-slate-500">{e.probabilityBps > 0 ? `${(e.probabilityBps / 100).toFixed(0)}%` : "—"}</td>;
                        case "income":
                          return <td key={col.key} className="px-3 py-2.5 text-right text-xs font-medium text-slate-700">{e.revenueCents > 0 ? formatCurrency(e.revenueCents) : "—"}</td>;
                        case "gp":
                          return <td key={col.key} className="px-3 py-2.5 text-right text-xs font-medium text-slate-700">{e.grossProfitCents > 0 ? formatCurrency(e.grossProfitCents) : "—"}</td>;
                        case "margin":
                          return (
                            <td key={col.key} className={cn("px-3 py-2.5 text-right text-xs font-medium", marginBps >= 3000 ? "text-green-600" : marginBps >= 1500 ? "text-yellow-600" : marginBps > 0 ? "text-red-500" : "text-slate-400")}>
                              {marginBps !== 0 ? bpsToPercent(marginBps) : "—"}
                            </td>
                          );
                        default: return null;
                      }
                    })}
                    <td className="px-3 py-2.5">
                      <Link href={`/crm/estimates/${e.id}`}>
                        <Button variant="ghost" size="sm" className="h-7 text-xs opacity-0 group-hover:opacity-100">
                          <FileText className="mr-1 h-3.5 w-3.5" /> Open
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      )}

      <NewEstimateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultClientId={clientId}
      />

      {duplicateTarget && (
        <DuplicateEstimateDialog
          estimateId={duplicateTarget.id}
          estimateDescription={duplicateTarget.description}
          open={!!duplicateTarget}
          onCancel={() => setDuplicateTarget(null)}
          onSuccess={() => setDuplicateTarget(null)}
        />
      )}
    </div>
  );
}
