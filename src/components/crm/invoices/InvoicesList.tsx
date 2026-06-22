"use client";

import { useMemo, useState } from "react";
import { useInvoices, useUpdateInvoiceStatus, useCreateInvoice } from "@/lib/hooks/use-invoices";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency } from "@/lib/utils";
import { Plus, FileText, Search, ChevronDown, X, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { InvoiceStatus, CRMInvoice } from "@/types/crm-invoices";
import { InvoiceDetailSheet } from "./InvoiceDetailSheet";
import { NewInvoiceDialog } from "./NewInvoiceDialog";
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

const INVOICE_COLUMNS: ColumnDef[] = [
  { key: "number",      label: "Invoice #",  locked: true },
  { key: "client",      label: "Client" },
  { key: "status",      label: "Status" },
  { key: "date",        label: "Date" },
  { key: "due",         label: "Due" },
  { key: "total",       label: "Total" },
  { key: "balance",     label: "Balance" },
];

const STATUS_COLOR: Record<InvoiceStatus, string> = {
  draft:   "bg-slate-100 text-slate-600",
  sent:    "bg-blue-100 text-blue-700",
  viewed:  "bg-purple-100 text-purple-700",
  partial: "bg-yellow-100 text-yellow-700",
  paid:    "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-600",
  void:    "bg-slate-200 text-slate-500 line-through",
};

function formatDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function isOverdue(inv: CRMInvoice) {
  if (!inv.dueDate || inv.balanceCents <= 0) return false;
  return new Date(inv.dueDate + "T23:59:59") < new Date();
}

type ActiveFilterKey =
  | "invoice_number"
  | "date"
  | "client"
  | "payment_method"
  | "status"
  | "balance";

const FILTER_BUTTONS: { key: ActiveFilterKey; label: string }[] = [
  { key: "invoice_number", label: "Invoice #" },
  { key: "date",           label: "Date" },
  { key: "client",         label: "Client" },
  { key: "payment_method", label: "Payment Method" },
  { key: "status",         label: "Status" },
  { key: "balance",        label: "Balance" },
];

type QuickFilter =
  | "all"
  | "open"
  | "past_due"
  | "to_email"
  | "to_print"
  | "paid"
  | "void";

const QUICK_FILTERS: { key: QuickFilter; label: string }[] = [
  { key: "all",      label: "All Invoices" },
  { key: "open",     label: "Open" },
  { key: "past_due", label: "Past Due" },
  { key: "to_email", label: "To Email" },
  { key: "to_print", label: "To Print" },
  { key: "paid",     label: "Paid" },
  { key: "void",     label: "Void" },
];

function applyQuickFilter(invoices: CRMInvoice[], filter: QuickFilter): CRMInvoice[] {
  const today = new Date();
  switch (filter) {
    case "open":     return invoices.filter((i) => i.balanceCents > 0 && i.status !== "void");
    case "past_due": return invoices.filter((i) => isOverdue(i));
    case "to_email": return invoices.filter((i) => i.status === "draft" || i.status === "sent");
    case "to_print": return invoices.filter((i) => i.status === "draft");
    case "paid":     return invoices.filter((i) => i.status === "paid");
    case "void":     return invoices.filter((i) => i.status === "void");
    default:         return invoices;
  }
  void today;
}

interface Props {
  clientId?: string;
}

export function InvoicesList({ clientId }: Props) {
  const { data: invoices, isLoading, refetch: refetchInvoices } = useInvoices(clientId);
  const { mutateAsync: updateStatus } = useUpdateInvoiceStatus();
  const { mutateAsync: createInvoice } = useCreateInvoice();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [search, setSearch] = useState("");
  const [activeFilterKey, setActiveFilterKey] = useState<ActiveFilterKey | null>(null);
  const [filterValue, setFilterValue] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [visibleKeys, setVisibleKeys] = useState<string[]>(
    INVOICE_COLUMNS.map((c) => c.key)
  );

  const allInvoices = invoices ?? [];

  // Badge counts for filter tabs
  const counts = useMemo(() => ({
    all:      allInvoices.length,
    open:     allInvoices.filter((i) => i.balanceCents > 0 && i.status !== "void").length,
    past_due: allInvoices.filter(isOverdue).length,
    to_email: allInvoices.filter((i) => i.status === "draft" || i.status === "sent").length,
    to_print: allInvoices.filter((i) => i.status === "draft").length,
    paid:     allInvoices.filter((i) => i.status === "paid").length,
    void:     allInvoices.filter((i) => i.status === "void").length,
  }), [allInvoices]);

  const filtered = useMemo(() => {
    let list = applyQuickFilter(allInvoices, quickFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          String(i.invoiceNumber).includes(q) ||
          (i.clientName ?? "").toLowerCase().includes(q)
      );
    }
    if (activeFilterKey && filterValue.trim()) {
      const fv = filterValue.toLowerCase();
      list = list.filter((i) => {
        switch (activeFilterKey) {
          case "invoice_number": return String(i.invoiceNumber).includes(fv);
          case "date":           return (i.invoiceDate ?? "").includes(fv);
          case "client":         return (i.clientName ?? "").toLowerCase().includes(fv);
          case "payment_method": return (i.preferredPaymentMethod ?? "").toLowerCase().includes(fv);
          case "status":         return i.status.toLowerCase().includes(fv);
          case "balance":        return String(i.balanceCents / 100).includes(fv);
          default:               return true;
        }
      });
    }
    return list;
  }, [allInvoices, quickFilter, search, activeFilterKey, filterValue]);

  async function markVoid(inv: CRMInvoice) {
    if (!confirm(`Void invoice #${inv.invoiceNumber}?`)) return;
    try {
      await updateStatus({ id: inv.id, status: "void" });
      toast.success("Invoice voided");
    } catch {
      toast.error("Failed to void invoice");
    }
  }

  async function bulkUpdateStatus(status: InvoiceStatus) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await Promise.all(ids.map((id) => updateStatus({ id, status })));
      toast.success(`${ids.length} invoice${ids.length > 1 ? "s" : ""} updated`);
      setSelectedIds(new Set());
      refetchInvoices();
    } catch {
      toast.error("Failed to update invoices");
    }
  }

  const allSelected = filtered.length > 0 && filtered.every((i) => selectedIds.has(i.id));
  const someSelected = selectedIds.size > 0;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((i) => i.id)));
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const visibleColumns = clientId
    ? INVOICE_COLUMNS.filter((c) => c.key !== "client" && visibleKeys.includes(c.key))
    : INVOICE_COLUMNS.filter((c) => visibleKeys.includes(c.key));
  const colSpan = visibleColumns.length + 2; // +checkbox +actions

  return (
    <div className="flex h-full flex-col gap-0">

      {/* ── Page header ── */}
      {!clientId && (
        <PageHeader
          title="Invoices"
          description={!isLoading ? `${allInvoices.length} invoices` : undefined}
          action={
            <PermissionGate permission="acct_add_modify_invoices">
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Add Invoice
              </Button>
            </PermissionGate>
          }
        />
      )}

      {/* ── FilterBar row ── */}
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
            <PermissionGate permission="acct_add_modify_invoices">
              <Button size="sm" className="h-7 text-xs" onClick={async () => {
                try {
                  const today = new Date().toISOString().split("T")[0];
                  const inv = await createInvoice({ clientId, description: "", invoiceDate: today });
                  setOpenInvoiceId(inv.id);
                } catch { toast.error("Failed to create invoice"); }
              }}>
                <Plus className="mr-1 h-3 w-3" /> Add Invoice
              </Button>
            </PermissionGate>
          </div>
        )}
      </div>

      {/* ── Dark actions bar with quick-filter tabs (matches Payments dark bar) ── */}
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
                onSelect={() => { toast.info(`Emailing ${selectedIds.size} invoice(s)…`); bulkUpdateStatus("sent"); }}
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
              <DropdownMenuItem
                disabled={!someSelected}
                onSelect={() => bulkUpdateStatus("sent")}
              >
                Mark as Sent
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!someSelected}
                onSelect={() => bulkUpdateStatus("paid")}
              >
                Mark as Paid
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!someSelected}
                className="text-red-600 focus:text-red-600"
                onSelect={() => {
                  if (!confirm(`Void ${selectedIds.size} invoice(s)?`)) return;
                  bulkUpdateStatus("void");
                }}
              >
                Void Selected
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={() => refetchInvoices()}
            className="flex h-7 w-7 items-center justify-center rounded border border-[#6a6a6a] bg-[#5a5a5a] text-white hover:bg-[#6a6a6a]"
            title="Refresh"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          {/* Quick-filter tabs in dark bar */}
          <div className="ml-2 flex items-center gap-1 overflow-x-auto">
            {QUICK_FILTERS.map(({ key, label }) => {
              const count = counts[key];
              return (
                <button
                  key={key}
                  onClick={() => setQuickFilter(key)}
                  className={cn(
                    "flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                    quickFilter === key
                      ? "bg-white text-slate-800"
                      : "text-slate-300 hover:text-white"
                  )}
                >
                  {label}
                  {count > 0 && (
                    <span className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      quickFilter === key
                        ? "bg-slate-200 text-slate-700"
                        : key === "past_due"
                          ? "bg-red-500/30 text-red-200"
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
          columns={clientId ? INVOICE_COLUMNS.filter((c) => c.key !== "client") : INVOICE_COLUMNS}
          visibleKeys={visibleKeys}
          onVisibleKeysChange={setVisibleKeys}
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 border-b z-10">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 accent-brand-500"
                  checked={allSelected}
                  onChange={toggleAll}
                />
              </th>
              {visibleColumns.map((col) => (
                <th key={col.key} className={cn("px-4 py-3", col.key === "total" || col.key === "balance" ? "text-right" : "")}>
                  {col.label}
                </th>
              ))}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: colSpan }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="py-16 text-center text-sm text-slate-400">
                  {search ? "No invoices match your search" : "No invoices"}
                </td>
              </tr>
            ) : (
              filtered.map((inv) => (
                <tr
                  key={inv.id}
                  className={cn(
                    "group cursor-pointer border-b hover:bg-slate-50",
                    isOverdue(inv) && "bg-red-50/40",
                    selectedIds.has(inv.id) && "bg-brand-50"
                  )}
                  onClick={() => setOpenInvoiceId(inv.id)}
                >
                  <td className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 accent-brand-500"
                      checked={selectedIds.has(inv.id)}
                      onChange={() => toggleRow(inv.id)}
                    />
                  </td>
                  {visibleColumns.map((col) => {
                    switch (col.key) {
                      case "number":
                        return (
                          <td key={col.key} className="px-4 py-3 font-mono text-xs text-slate-400">
                            #{inv.invoiceNumber}
                          </td>
                        );
                      case "client":
                        return <td key={col.key} className="px-4 py-3 text-slate-600">{inv.clientName}</td>;
                      case "status":
                        return (
                          <td key={col.key} className="px-4 py-3">
                            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", STATUS_COLOR[inv.status])}>
                              {isOverdue(inv) ? "overdue" : inv.status}
                            </span>
                          </td>
                        );
                      case "date":
                        return <td key={col.key} className="px-4 py-3 text-xs text-slate-500">{formatDate(inv.invoiceDate)}</td>;
                      case "due":
                        return (
                          <td key={col.key} className={cn("px-4 py-3 text-xs", isOverdue(inv) ? "text-red-600 font-medium" : "text-slate-500")}>
                            {inv.dueDate ? formatDate(inv.dueDate) : "—"}
                          </td>
                        );
                      case "total":
                        return <td key={col.key} className="px-4 py-3 text-right font-medium text-slate-700">{formatCurrency(inv.totalCents)}</td>;
                      case "balance":
                        return (
                          <td key={col.key} className={cn("px-4 py-3 text-right font-medium", inv.balanceCents > 0 ? "text-red-600" : "text-green-600")}>
                            {formatCurrency(inv.balanceCents)}
                          </td>
                        );
                      default: return null;
                    }
                  })}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpenInvoiceId(inv.id)}>
                        <FileText className="mr-1 h-3 w-3" /> Open
                      </Button>
                      {inv.status !== "void" && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-400 hover:text-red-500" onClick={() => markVoid(inv)}>
                          Void
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <NewInvoiceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultClientId={clientId}
        onCreated={(id) => { setDialogOpen(false); setOpenInvoiceId(id); }}
      />
      <InvoiceDetailSheet
        invoiceId={openInvoiceId}
        onOpenChange={(open) => !open && setOpenInvoiceId(null)}
      />
    </div>
  );
}
