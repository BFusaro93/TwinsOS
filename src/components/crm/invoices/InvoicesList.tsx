"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useInvoices, useUpdateInvoiceStatus, useBulkImportInvoices } from "@/lib/hooks/use-invoices";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ImportExportMenu } from "@/components/shared/ImportExportMenu";
import { exportCSV } from "@/lib/csv";
import { cn, formatCurrency } from "@/lib/utils";
import { Plus, FileText, Search, ChevronDown, X, RotateCcw, GitMerge, ArrowUpDown, ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { InvoiceStatus, CRMInvoice } from "@/types/crm-invoices";
import { useChargeAutopayInvoice } from "@/lib/hooks/use-autopay-invoices";
import { InvoiceDetailSheet } from "./InvoiceDetailSheet";
import { NewInvoiceSheet } from "./NewInvoiceSheet";
import { MergeInvoicesDialog } from "./MergeInvoicesDialog";
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
  { key: "status",      label: "Status" },
  { key: "client",      label: "Client" },
  { key: "date",        label: "Date" },
  { key: "due",         label: "Due" },
  { key: "total",       label: "Total" },
  { key: "balance",     label: "Balance" },
  { key: "paymentType", label: "Payment Type" },
];

const STATUS_COLOR: Record<InvoiceStatus, string> = {
  draft:   "bg-slate-100 text-slate-600",
  printed: "bg-indigo-100 text-indigo-700",
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
  if (inv.balanceCents <= 0) return false;
  const effectiveDue = inv.dueDate ?? (inv.terms === "due_on_receipt" ? inv.invoiceDate : null);
  if (!effectiveDue) return false;
  return new Date(effectiveDue + "T23:59:59") < new Date();
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
  | "uninvoiced"
  | "open"
  | "past_due"
  | "to_email"
  | "to_print"
  | "to_charge_card"
  | "to_charge_ach"
  | "paid"
  | "void";

const QUICK_FILTERS: { key: QuickFilter; label: string }[] = [
  { key: "all",            label: "All Invoices" },
  { key: "uninvoiced",     label: "Uninvoiced" },
  { key: "open",           label: "Open" },
  { key: "past_due",       label: "Past Due" },
  { key: "to_email",       label: "To Email" },
  { key: "to_print",       label: "To Print" },
  { key: "to_charge_card", label: "To Charge" },
  { key: "to_charge_ach",  label: "ACH To Charge" },
  { key: "paid",           label: "Paid" },
  { key: "void",           label: "Void" },
];

// "Invoices to Charge" / "ACH Invoices to Charge" — open invoices for clients
// with a card/bank account on file for autopay (set in the client's Details
// tab or by the client themselves on the portal). Charging is manual — staff
// pick invoices from here and hit Charge, it's not an automatic background job.
function isChargeableBy(i: CRMInvoice, method: "card" | "us_bank_account") {
  return (
    i.status !== "draft" &&
    i.status !== "void" &&
    i.balanceCents > 0 &&
    i.clientSavedPaymentMethodType === method
  );
}

// A client's invoice_delivery preference ("email" | "print" | "both") gates which
// queue an invoice belongs to — a print-only client's invoices never clutter the
// email queue and vice versa. "both" clients appear in whichever queue still
// hasn't happened yet for that delivery leg.
function needsPrint(i: CRMInvoice) {
  return (i.clientInvoiceDelivery ?? "email") !== "email" && i.status === "draft";
}
function needsEmail(i: CRMInvoice) {
  return (i.clientInvoiceDelivery ?? "email") !== "print" && (i.status === "draft" || i.status === "printed");
}

// Draft invoices are "uninvoiced" — an SA-style holding area for a client's
// weekly/monthly-billed work in progress, not a real invoice yet. They never
// show in the normal invoice views (All/Open/etc.), only in their own tab,
// until finalized (moved to sent/printed) via the To Email/To Print queues.
function applyQuickFilter(invoices: CRMInvoice[], filter: QuickFilter): CRMInvoice[] {
  const today = new Date();
  switch (filter) {
    case "uninvoiced": return invoices.filter((i) => i.status === "draft");
    case "open":     return invoices.filter((i) => i.status !== "draft" && i.balanceCents > 0 && i.status !== "void");
    case "past_due": return invoices.filter((i) => i.status !== "draft" && isOverdue(i));
    case "to_email": return invoices.filter(needsEmail);
    case "to_print": return invoices.filter(needsPrint);
    case "to_charge_card": return invoices.filter((i) => isChargeableBy(i, "card"));
    case "to_charge_ach":  return invoices.filter((i) => isChargeableBy(i, "us_bank_account"));
    case "paid":     return invoices.filter((i) => i.status === "paid");
    case "void":     return invoices.filter((i) => i.status === "void");
    default:         return invoices.filter((i) => i.status !== "draft");
  }
  void today;
}

interface Props {
  clientId?: string;
}

const INVOICE_TEMPLATE_COLUMNS = [
  "clientName", "description", "invoiceDate", "dueDate", "poNumber", "status", "amount", "taxAmount",
];

export function InvoicesList({ clientId }: Props) {
  const searchParams = useSearchParams();
  // Lets the standalone /crm/accounting/invoices page be deep-linked scoped to
  // one client (e.g. clicking "Uninvoiced" on that client's Balance card) —
  // an embedded usage that already passes clientId as a prop takes precedence.
  const effectiveClientId = clientId ?? (searchParams.get("clientId") || undefined);
  const { data: invoices, isLoading, refetch: refetchInvoices } = useInvoices(effectiveClientId);
  const { mutateAsync: updateStatus } = useUpdateInvoiceStatus();
  const { mutateAsync: bulkImportInvoices } = useBulkImportInvoices();
  const [newSheetOpen, setNewSheetOpen] = useState(false);
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  useEffect(() => {
    const id = searchParams.get("open");
    if (id) setOpenInvoiceId(id);
  }, [searchParams]);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(() => {
    const f = searchParams.get("filter");
    return (QUICK_FILTERS.some((q) => q.key === f) ? f : "all") as QuickFilter;
  });
  const [search, setSearch] = useState("");
  const [activeFilterKey, setActiveFilterKey] = useState<ActiveFilterKey | null>(null);
  const [filterValue, setFilterValue] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [emailingSelected, setEmailingSelected] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [sortKey, setSortKey] = useState<string>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [visibleKeys, setVisibleKeys] = useState<string[]>(
    INVOICE_COLUMNS.map((c) => c.key)
  );

  const allInvoices = invoices ?? [];

  // Badge counts for filter tabs — reuse applyQuickFilter so a tab's count
  // always matches what clicking it actually shows.
  const counts = useMemo(() => ({
    all:        applyQuickFilter(allInvoices, "all").length,
    uninvoiced: applyQuickFilter(allInvoices, "uninvoiced").length,
    open:       applyQuickFilter(allInvoices, "open").length,
    past_due:   applyQuickFilter(allInvoices, "past_due").length,
    to_email:   applyQuickFilter(allInvoices, "to_email").length,
    to_print:   applyQuickFilter(allInvoices, "to_print").length,
    to_charge_card: applyQuickFilter(allInvoices, "to_charge_card").length,
    to_charge_ach:  applyQuickFilter(allInvoices, "to_charge_ach").length,
    paid:       applyQuickFilter(allInvoices, "paid").length,
    void:       applyQuickFilter(allInvoices, "void").length,
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
    // Sort
    list = [...list].sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      switch (sortKey) {
        case "number":  av = a.invoiceNumber; bv = b.invoiceNumber; break;
        case "client":  av = a.clientName ?? ""; bv = b.clientName ?? ""; break;
        case "date":    av = a.invoiceDate ?? ""; bv = b.invoiceDate ?? ""; break;
        case "due":     av = a.dueDate ?? "9999-99-99"; bv = b.dueDate ?? "9999-99-99"; break;
        case "total":   av = a.totalCents; bv = b.totalCents; break;
        case "balance": av = a.balanceCents; bv = b.balanceCents; break;
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [allInvoices, quickFilter, search, activeFilterKey, filterValue, sortKey, sortDir]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function SortIcon({ col }: { col: string }) {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 inline h-3 w-3 text-slate-300" />;
    return sortDir === "asc"
      ? <ArrowUp className="ml-1 inline h-3 w-3 text-slate-600" />
      : <ArrowDown className="ml-1 inline h-3 w-3 text-slate-600" />;
  }

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

  // Actually sends an email per selected invoice (via the same endpoint the
  // single-invoice "Email" button uses) — this used to just flip status to
  // "sent" with a fake success toast and never email anyone.
  async function bulkEmailSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setEmailingSelected(true);
    try {
      const results = await Promise.allSettled(
        ids.map((invoiceId) =>
          fetch("/api/crm/invoices/email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ invoiceId }),
          }).then(async (res) => {
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error ?? "Failed to email invoice");
            }
          })
        )
      );
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - succeeded;
      if (succeeded > 0) toast.success(`Emailed ${succeeded} invoice${succeeded !== 1 ? "s" : ""}`);
      if (failed > 0) toast.error(`Failed to email ${failed} invoice${failed !== 1 ? "s" : ""} — check they have a client email on file`);
      setSelectedIds(new Set());
      refetchInvoices();
    } finally {
      setEmailingSelected(false);
    }
  }

  const chargeInvoice = useChargeAutopayInvoice();
  const [chargingId, setChargingId] = useState<string | null>(null);
  const [chargingAll, setChargingAll] = useState(false);
  const onChargeTab = quickFilter === "to_charge_card" || quickFilter === "to_charge_ach";

  async function handleCharge(inv: CRMInvoice) {
    setChargingId(inv.id);
    try {
      const result = await chargeInvoice.mutateAsync({ invoiceId: inv.id });
      toast.success(
        `Charged ${inv.clientName} ${formatCurrency(result.totalChargeCents)}${
          result.feeCents > 0 ? ` (incl. ${formatCurrency(result.feeCents)} fee)` : ""
        }`
      );
      refetchInvoices();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to charge invoice #${inv.invoiceNumber}`);
    } finally {
      setChargingId(null);
    }
  }

  async function handleChargeAll() {
    if (filtered.length === 0) return;
    if (!confirm(`Charge all ${filtered.length} invoice(s) in this tab now?`)) return;
    setChargingAll(true);
    let succeeded = 0;
    let failed = 0;
    for (const inv of filtered) {
      try {
        await chargeInvoice.mutateAsync({ invoiceId: inv.id });
        succeeded++;
      } catch {
        failed++;
      }
    }
    setChargingAll(false);
    if (succeeded > 0) toast.success(`Charged ${succeeded} invoice${succeeded !== 1 ? "s" : ""}`);
    if (failed > 0) toast.error(`Failed to charge ${failed} invoice${failed !== 1 ? "s" : ""}`);
    refetchInvoices();
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

  // Client column/page-header collapse only for a genuinely embedded usage
  // (clientId passed as a real prop by a parent that already shows the
  // client context) — NOT for the ?clientId= query-string deep link from a
  // client's "Uninvoiced" balance, which should render exactly like the
  // standalone Uninvoiced tab (same columns, same header).
  const visibleColumns = clientId
    ? INVOICE_COLUMNS.filter((c) => c.key !== "client" && visibleKeys.includes(c.key))
    : INVOICE_COLUMNS.filter((c) => visibleKeys.includes(c.key));
  const colSpan = visibleColumns.length + 2; // +checkbox +actions

  return (
    <div className="flex h-full flex-col gap-4">

      {/* ── Page header ── */}
      {!clientId && (
        <PageHeader
          title="Invoices"
          description={!isLoading ? `${allInvoices.length} invoices` : undefined}
          action={
            <PermissionGate permission="acct_add_modify_invoices">
              <div className="flex items-center gap-2">
                <ImportExportMenu
                  entityLabel="Invoices"
                  templateColumns={INVOICE_TEMPLATE_COLUMNS}
                  templateFilename="invoices-template.csv"
                  requiredColumns={["clientName", "description", "amount"]}
                  onExport={() =>
                    exportCSV(
                      allInvoices.map((inv) => ({
                        clientName: inv.clientName ?? "",
                        description: inv.description,
                        invoiceDate: inv.invoiceDate,
                        dueDate: inv.dueDate ?? "",
                        poNumber: inv.poNumber ?? "",
                        status: inv.status,
                        amount: (inv.subtotalCents / 100).toFixed(2),
                        taxAmount: (inv.taxCents / 100).toFixed(2),
                      })),
                      "invoices-export.csv"
                    )
                  }
                  onImport={async (rows) => {
                    const { created, skipped } = await bulkImportInvoices(rows);
                    if (skipped > 0) {
                      toast.warning(`Imported ${created} invoice${created !== 1 ? "s" : ""}. ${skipped} row${skipped !== 1 ? "s" : ""} skipped (unmatched client, missing description, or amount).`);
                    } else {
                      toast.success(`Successfully imported ${created} invoice${created !== 1 ? "s" : ""}.`);
                    }
                  }}
                />
                <Button size="sm" onClick={() => setNewSheetOpen(true)}>
                  <Plus className="mr-1.5 h-4 w-4" /> Add Invoice
                </Button>
              </div>
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
              <Button size="sm" className="h-7 text-xs" onClick={() => setNewSheetOpen(true)}>
                <Plus className="mr-1 h-3 w-3" /> Add Invoice
              </Button>
            </PermissionGate>
          </div>
        )}
      </div>

      {/* ── Dark actions bar with quick-filter tabs (matches Payments dark bar) ── */}
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
              {onChargeTab && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={filtered.length === 0 || chargingAll}
                    onSelect={() => void handleChargeAll()}
                  >
                    {chargingAll ? "Charging…" : `Charge All (${filtered.length})`}
                  </DropdownMenuItem>
                </>
              )}
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
                disabled={selectedIds.size < 2}
                onSelect={() => setMergeOpen(true)}
                className="flex items-center gap-2"
              >
                <GitMerge className="h-3.5 w-3.5" />
                Merge Invoices
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
              {visibleColumns.map((col) => {
                const sortable = ["number","client","date","due","total","balance"].includes(col.key);
                const isRight = col.key === "total" || col.key === "balance";
                return (
                  <th
                    key={col.key}
                    className={cn("px-4 py-3", isRight ? "text-right" : "", sortable ? "cursor-pointer select-none hover:text-slate-600" : "")}
                    onClick={sortable ? () => toggleSort(col.key) : undefined}
                  >
                    {col.label}
                    {sortable && <SortIcon col={col.key} />}
                  </th>
                );
              })}
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
                        return (
                          <td key={col.key} className="px-4 py-3 max-w-[200px]" onClick={(e) => e.stopPropagation()}>
                            <Link
                              href={`/crm/clients/${inv.clientId}`}
                              className="block font-medium text-brand-600 hover:underline truncate"
                            >
                              {inv.clientName}
                            </Link>
                            {inv.clientAddress && (
                              <p className="text-[10px] text-slate-400 truncate">{inv.clientAddress}</p>
                            )}
                          </td>
                        );
                      case "status": {
                        // A draft past its would-be due date hasn't actually been sent —
                        // nobody's late on a bill they were never billed. Flag it red like
                        // a real overdue invoice, but keep the "Draft" label so it isn't
                        // confused with one that's actually been sent and is unpaid.
                        const overdue = isOverdue(inv);
                        const showOverdueLabel = overdue && inv.status !== "draft";
                        return (
                          <td key={col.key} className="px-4 py-3">
                            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", overdue ? STATUS_COLOR.overdue : STATUS_COLOR[inv.status])}>
                              {showOverdueLabel ? "overdue" : inv.status}
                            </span>
                          </td>
                        );
                      }
                      case "date":
                        return <td key={col.key} className="px-4 py-3 text-xs text-slate-500">{formatDate(inv.invoiceDate)}</td>;
                      case "due":
                        return (
                          <td key={col.key} className={cn("px-4 py-3 text-xs", isOverdue(inv) ? "text-red-600 font-medium" : "text-slate-500")}>
                            {inv.dueDate
                              ? formatDate(inv.dueDate)
                              : inv.terms === "due_on_receipt" && inv.invoiceDate
                                ? formatDate(inv.invoiceDate)
                                : "—"}
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
                      case "paymentType":
                        return (
                          <td key={col.key} className="px-4 py-3 text-xs text-slate-500">
                            {inv.preferredPaymentMethod ?? inv.clientDefaultPaymentMethod ?? "—"}
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
                      {inv.clientSavedPaymentMethodType && inv.balanceCents > 0 && inv.status !== "void" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-brand-600 hover:text-brand-700"
                          onClick={(e) => { e.stopPropagation(); void handleCharge(inv); }}
                          disabled={chargingId === inv.id || chargingAll}
                        >
                          {chargingId === inv.id && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                          Charge
                        </Button>
                      )}
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

      <NewInvoiceSheet
        open={newSheetOpen}
        onClose={() => setNewSheetOpen(false)}
        defaultClientId={effectiveClientId}
      />
      <InvoiceDetailSheet
        invoiceId={openInvoiceId}
        onOpenChange={(open) => !open && setOpenInvoiceId(null)}
      />
      {mergeOpen && (
        <MergeInvoicesDialog
          invoices={allInvoices.filter((i) => selectedIds.has(i.id))}
          onClose={() => { setMergeOpen(false); setSelectedIds(new Set()); }}
        />
      )}
    </div>
  );
}
