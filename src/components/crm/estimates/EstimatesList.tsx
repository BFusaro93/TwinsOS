"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEstimates } from "@/lib/hooks/use-estimates";
import { NewEstimateDialog } from "./NewEstimateDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatCurrency } from "@/lib/utils";
import { bpsToPercent } from "@/lib/estimate-calc";
import { Plus, FileText, Search, X, ChevronDown, RotateCcw } from "lucide-react";
import type { EstimateStage } from "@/types/crm-estimates";
import { useUpdateEstimateStage } from "@/lib/hooks/use-estimates";
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

const STAGE_COLOR: Record<EstimateStage, string> = {
  draft:    "bg-slate-100 text-slate-600",
  quote:    "bg-blue-100 text-blue-700",
  sent:     "bg-yellow-100 text-yellow-700",
  approved: "bg-purple-100 text-purple-700",
  won:      "bg-green-100 text-green-700",
  lost:     "bg-red-100 text-red-600",
  invoiced: "bg-teal-100 text-teal-700",
};

const STAGE_LABEL: Record<EstimateStage, string> = {
  draft:    "Draft",
  quote:    "Quote",
  sent:     "Sent",
  approved: "Approved",
  won:      "Won",
  lost:     "Lost",
  invoiced: "Invoiced",
};

type StageFilter = EstimateStage | "all";

const STAGE_TABS: { value: StageFilter; label: string }[] = [
  { value: "all",      label: "All Estimates" },
  { value: "draft",    label: "Draft" },
  { value: "quote",    label: "Quote" },
  { value: "sent",     label: "Sent" },
  { value: "approved", label: "Approved" },
  { value: "won",      label: "Won" },
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

export function EstimatesList({ clientId }: Props) {
  const router = useRouter();
  const { data: estimates, isLoading, refetch } = useEstimates(clientId);
  const { mutateAsync: updateStage } = useUpdateEstimateStage();
  const [dialogOpen,      setDialogOpen]      = useState(false);
  const [stageFilter,     setStageFilter]     = useState<StageFilter>("all");
  const [search,          setSearch]          = useState("");
  const [activeFilterKey, setActiveFilterKey] = useState<FilterKey | null>(null);
  const [filterValue,     setFilterValue]     = useState("");
  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(new Set());
  const [visibleKeys,     setVisibleKeys]     = useState<string[]>(
    ESTIMATE_COLUMNS.filter((c) => c.key !== "prob" && c.key !== "valid_until").map((c) => c.key)
  );

  const allEstimates = estimates ?? [];

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: allEstimates.length };
    for (const t of STAGE_TABS) {
      if (t.value !== "all") c[t.value] = allEstimates.filter((e) => e.stage === t.value).length;
    }
    return c;
  }, [allEstimates]);

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
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> New Estimate
            </Button>
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
      <div className="flex items-center justify-between bg-[#3a3a3a] px-4 py-2">
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
                disabled={!someSelected}
                onSelect={() => { toast.info(`Emailing ${selectedIds.size} estimate(s)…`); bulkSetStage("sent"); }}
              >
                Email Selected
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
              <DropdownMenuItem disabled={!someSelected} onSelect={() => bulkSetStage("approved")}>
                Mark as Approved
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!someSelected} onSelect={() => bulkSetStage("won")}>
                Mark as Won
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
            {STAGE_TABS.map(({ value, label }) => {
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

        <ColumnChooser
          columns={clientId ? ESTIMATE_COLUMNS.filter((c) => c.key !== "client") : ESTIMATE_COLUMNS}
          visibleKeys={visibleKeys}
          onVisibleKeysChange={setVisibleKeys}
        />
      </div>

      {/* Table */}
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
                          return <td key={col.key} className="px-3 py-2.5 text-xs font-mono text-slate-400">{e.estimateNumber ?? "—"}</td>;
                        case "stage":
                          return (
                            <td key={col.key} className="px-3 py-2.5">
                              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap", STAGE_COLOR[e.stage])}>
                                {STAGE_LABEL[e.stage]}
                              </span>
                            </td>
                          );
                        case "client":
                          return (
                            <td key={col.key} className="px-3 py-2.5 max-w-[180px]">
                              <Link href={`/crm/estimates/${e.id}`} className="block font-medium text-slate-900 hover:text-brand-600 hover:underline truncate">
                                {e.clientName ?? "—"}
                              </Link>
                              {e.clientCity && (
                                <p className="text-[10px] text-slate-400 truncate">{e.clientCity}{e.clientState ? `, ${e.clientState}` : ""}</p>
                              )}
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

      <NewEstimateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultClientId={clientId}
      />
    </div>
  );
}
