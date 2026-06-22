"use client";

import { useState, useMemo } from "react";
import { usePayments, useRecordPayment, useInvoices } from "@/lib/hooks/use-invoices";
import { useClients } from "@/lib/hooks/use-clients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { Plus, RotateCcw, Search, X } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ColumnChooser } from "@/components/shared/ColumnChooser";
import type { ColumnDef } from "@/components/shared/ColumnChooser";

const PAYMENT_COLUMNS: ColumnDef[] = [
  { key: "date",      label: "Date",           locked: true },
  { key: "reference", label: "Reference #" },
  { key: "client",    label: "Client" },
  { key: "method",    label: "Method" },
  { key: "invoice",   label: "Invoice" },
  { key: "amount",    label: "Amount" },
];
import { toast } from "sonner";
import type { CRMInvoice } from "@/types/crm-invoices";

// ── constants ─────────────────────────────────────────────────────────────────

export const PAYMENT_METHODS = [
  "ACH/E-Check",
  "AR Write-off",
  "AutoPay",
  "Cash",
  "Check",
  "Credit Card- AmEx",
  "Credit Card- Discover",
  "Credit Card- MasterCard",
  "Credit Card- Visa",
  "Other",
] as const;

// ── add payment dialog ────────────────────────────────────────────────────────

interface InvoiceAllocation {
  invoiceId: string;
  invoiceNumber: number;
  balanceCents: number;
  totalCents: number;
  invoiceDate: string;
  payInFull: boolean;
  amountCents: number;
}

function AddPaymentDialog({
  open,
  onOpenChange,
  defaultClientId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultClientId?: string;
}) {
  const { data: clients } = useClients();
  const { mutateAsync: record, isPending } = useRecordPayment();

  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [method, setMethod] = useState<string>("Check");
  const [memo, setMemo] = useState("");
  const [isPrepayment, setIsPrepayment] = useState(false);
  const [autoAllocate, setAutoAllocate] = useState(false);
  const [allocations, setAllocations] = useState<InvoiceAllocation[]>([]);

  const { data: invoices } = useInvoices(clientId || undefined);
  const openInvoices = useMemo(
    () => (invoices ?? []).filter((inv) => inv.status !== "paid" && inv.status !== "void"),
    [invoices]
  );

  // derive account balance from open invoices
  const accountBalanceCents = openInvoices.reduce((s, inv) => s + (inv.balanceCents ?? inv.totalCents), 0);

  const amountCents = Math.round(parseFloat(amount || "0") * 100);
  const amountApplied = allocations.reduce((s, a) => s + a.amountCents, 0);
  const unusedCents = Math.max(0, amountCents - amountApplied);

  // when client changes, build allocations list
  function handleClientChange(id: string) {
    setClientId(id);
    setAllocations([]);
  }

  // initialise allocations when open invoices load
  useMemo(() => {
    if (!clientId) return;
    setAllocations(
      openInvoices.map((inv) => ({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        balanceCents: inv.balanceCents ?? inv.totalCents,
        totalCents: inv.totalCents,
        invoiceDate: inv.invoiceDate,
        payInFull: false,
        amountCents: 0,
      }))
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openInvoices.length, clientId]);

  function handleAutoAllocate(checked: boolean) {
    setAutoAllocate(checked);
    if (!checked) return;
    let remaining = amountCents;
    setAllocations((prev) =>
      prev.map((a) => {
        const apply = Math.min(remaining, a.balanceCents);
        remaining -= apply;
        return { ...a, amountCents: apply, payInFull: apply >= a.balanceCents };
      })
    );
  }

  function handleAllocateClick() {
    handleAutoAllocate(true);
  }

  function togglePayInFull(idx: number, checked: boolean) {
    setAllocations((prev) =>
      prev.map((a, i) =>
        i === idx
          ? { ...a, payInFull: checked, amountCents: checked ? a.balanceCents : 0 }
          : a
      )
    );
  }

  function setAllocationAmount(idx: number, val: string) {
    const cents = Math.round(parseFloat(val || "0") * 100);
    setAllocations((prev) =>
      prev.map((a, i) =>
        i === idx ? { ...a, amountCents: cents, payInFull: cents >= a.balanceCents } : a
      )
    );
  }

  function resetForm() {
    setClientId(defaultClientId ?? "");
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setAmount("");
    setCheckNumber("");
    setMethod("Check");
    setMemo("");
    setIsPrepayment(false);
    setAutoAllocate(false);
    setAllocations([]);
  }

  async function submit(andNew: boolean) {
    if (!clientId || !amount) {
      toast.error("Client and amount are required");
      return;
    }
    const primaryAllocation = allocations.find((a) => a.amountCents > 0);
    try {
      await record({
        invoiceId: primaryAllocation?.invoiceId,
        clientId,
        amountCents,
        paymentDate,
        method,
        reference: checkNumber || undefined,
        memo: memo || undefined,
        isPrepayment,
      });
      toast.success("Payment recorded");
      if (andNew) {
        resetForm();
      } else {
        onOpenChange(false);
        resetForm();
      }
    } catch { toast.error("Failed to record payment"); }
  }

  const selectedClient = (clients ?? []).find((c) => c.id === clientId);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-lg font-semibold">Add Payment</DialogTitle>
        </DialogHeader>

        <div className="flex gap-0">
          {/* Left: form */}
          <div className="flex-1 p-6 space-y-4">
            {/* Payment Details section header */}
            <div className="rounded bg-[#4a4a4a] px-3 py-1.5 text-sm font-semibold text-white">
              Payment Details
            </div>

            <div className="grid grid-cols-[120px_1fr] items-center gap-x-4 gap-y-3">
              <Label className="text-right text-sm font-medium">Client</Label>
              {defaultClientId && selectedClient ? (
                <div className="text-sm text-slate-700">
                  {selectedClient.displayName}
                  {selectedClient.billingAddress && (
                    <span className="ml-1 text-slate-400">: {selectedClient.billingAddress}</span>
                  )}
                </div>
              ) : (
                <Select value={clientId} onValueChange={handleClientChange}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select client…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(clients ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.displayName}
                        {c.billingAddress ? ` : ${c.billingAddress}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Label className="text-right text-sm font-medium">Date</Label>
              <Input
                type="date"
                className="h-8 w-40 text-sm"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />

              <Label className="text-right text-sm font-medium">Amount</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className="h-8 w-32 text-sm"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={handleAllocateClick}
                  disabled={!clientId || !amount}
                >
                  Allocate Payment
                </Button>
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="auto-allocate"
                    checked={autoAllocate}
                    onCheckedChange={(c) => handleAutoAllocate(!!c)}
                    disabled={!clientId || !amount}
                  />
                  <Label htmlFor="auto-allocate" className="text-xs text-slate-600 cursor-pointer">
                    Auto Allocate
                  </Label>
                </div>
              </div>

              <Label className="text-right text-sm font-medium">Check #</Label>
              <Input
                className="h-8 w-40 text-sm"
                value={checkNumber}
                onChange={(e) => setCheckNumber(e.target.value)}
                placeholder=""
              />

              <Label className="text-right text-sm font-medium">Payment Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="h-8 w-56 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Label className="text-right text-sm font-medium">Memo</Label>
              <Input
                className="h-8 text-sm"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />

              <Label className="text-right text-sm font-medium">Is a pre-payment?</Label>
              <Checkbox
                checked={isPrepayment}
                onCheckedChange={(c) => setIsPrepayment(!!c)}
              />
            </div>
          </div>

          {/* Right: balance summary */}
          <div className="w-52 shrink-0 bg-[#5a5a5a] p-5 text-sm text-white rounded-tr-lg">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-300">Amount Applied:</span>
                <span className="font-medium">{formatCurrency(amountApplied)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">Unused Amount:</span>
                <span className="font-medium">{formatCurrency(unusedCents)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-500 pt-2">
                <span className="text-slate-300">Account Balance:</span>
                <span className="font-semibold">{formatCurrency(accountBalanceCents)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Unpaid invoices section */}
        {clientId && (
          <div className="border-t">
            <div className="mx-6 mt-4 mb-1 rounded bg-[#4a4a4a] px-3 py-1.5 text-sm font-semibold text-white flex items-center justify-between">
              <span>({openInvoices.length} of {openInvoices.length} in 1 page)</span>
              <span className="text-xs text-slate-300">Page Size: 30</span>
            </div>

            <div className="mx-6 mb-4 overflow-auto rounded border bg-white">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#3a3a3a] text-white">
                    <th className="w-28 px-3 py-2 text-left font-medium">Unpaid Invoice</th>
                    <th className="px-3 py-2 text-left font-medium">Pay in full</th>
                    <th className="px-3 py-2 text-right font-medium">Balance</th>
                    <th className="px-3 py-2 text-right font-medium">Date</th>
                    <th className="px-3 py-2 text-left font-medium">Job Details</th>
                  </tr>
                </thead>
                <tbody>
                  {openInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-400">
                        No open invoices
                      </td>
                    </tr>
                  ) : (
                    allocations.map((a, idx) => (
                      <tr key={a.invoiceId} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium text-slate-700">
                          #{a.invoiceNumber}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <Checkbox
                              checked={a.payInFull}
                              onCheckedChange={(c) => togglePayInFull(idx, !!c)}
                            />
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="h-6 w-20 text-xs px-1.5"
                              value={a.amountCents > 0 ? (a.amountCents / 100).toFixed(2) : ""}
                              onChange={(e) => setAllocationAmount(idx, e.target.value)}
                              placeholder="0.00"
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {formatCurrency(a.balanceCents)}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-500">
                          {new Date(a.invoiceDate + "T12:00:00").toLocaleDateString("en-US", {
                            month: "2-digit", day: "2-digit", year: "numeric",
                          })}
                        </td>
                        <td className="px-3 py-2 text-slate-500">
                          {selectedClient?.displayName ?? ""}
                          {selectedClient?.billingAddress && (
                            <div>{selectedClient.billingAddress}</div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-center gap-3 border-t bg-slate-50 px-6 py-4">
          <Button
            className="bg-slate-700 hover:bg-slate-800 text-white px-6"
            onClick={() => submit(true)}
            disabled={isPending}
          >
            Save &amp; New
          </Button>
          <Button
            className="bg-slate-700 hover:bg-slate-800 text-white px-6"
            onClick={() => submit(false)}
            disabled={isPending}
          >
            {isPending ? "Saving…" : "Save & Close"}
          </Button>
          <span className="text-slate-400 text-sm">or</span>
          <button
            className="text-brand-600 text-sm hover:underline"
            onClick={() => { resetForm(); onOpenChange(false); }}
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── filter bar ────────────────────────────────────────────────────────────────

type FilterField = "reference" | "date" | "client" | "address" | "method";

function FilterBar({
  activeFilter,
  onFilter,
  filterValue,
  onFilterValue,
}: {
  activeFilter: FilterField;
  onFilter: (f: FilterField) => void;
  filterValue: string;
  onFilterValue: (v: string) => void;
}) {
  const fields: { key: FilterField; label: string }[] = [
    { key: "reference", label: "Reference #" },
    { key: "date", label: "Date" },
    { key: "client", label: "Client" },
    { key: "address", label: "Address" },
    { key: "method", label: "Payment Method" },
  ];

  return (
    <div className="flex items-center gap-1 text-xs text-slate-600">
      {fields.map((f) => (
        <button
          key={f.key}
          onClick={() => { onFilter(f.key); onFilterValue(""); }}
          className={`px-2 py-0.5 rounded transition-colors whitespace-nowrap ${
            activeFilter === f.key
              ? "bg-brand-100 text-brand-700 font-medium"
              : "hover:bg-slate-100"
          }`}
        >
          {f.label}
        </button>
      ))}
      {activeFilter && (
        <Input
          className="ml-2 h-6 w-48 text-xs"
          placeholder={`Filter by ${fields.find((f) => f.key === activeFilter)?.label}…`}
          value={filterValue}
          onChange={(e) => onFilterValue(e.target.value)}
          autoFocus
        />
      )}
    </div>
  );
}

// ── main list ─────────────────────────────────────────────────────────────────

type Tab = "last30" | "deleted";

interface Props {
  clientId?: string;
}

export function PaymentsList({ clientId }: Props) {
  const { data: payments, isLoading, refetch } = usePayments(clientId);
  const [activeTab, setActiveTab] = useState<Tab>("last30");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterField | null>(null);
  const [filterValue, setFilterValue] = useState("");
  const [search, setSearch] = useState("");
  const [visibleKeys, setVisibleKeys] = useState<string[]>(PAYMENT_COLUMNS.map((c) => c.key));
  const [viewPayment, setViewPayment] = useState<(typeof filtered)[number] | null>(null);

  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const filtered = useMemo(() => {
    let list = payments ?? [];

    if (activeTab === "last30") {
      list = list.filter((p) => new Date(p.paymentDate) >= thirtyDaysAgo);
    } else {
      list = list.filter((p) => p.deletedAt != null);
    }

    if (activeFilter && filterValue) {
      const v = filterValue.toLowerCase();
      list = list.filter((p) => {
        switch (activeFilter) {
          case "reference": return (p.reference ?? "").toLowerCase().includes(v);
          case "date": return p.paymentDate.includes(v);
          case "client": return (p.clientName ?? "").toLowerCase().includes(v);
          case "address": return (p.clientAddress ?? "").toLowerCase().includes(v);
          case "method": return p.method.toLowerCase().includes(v);
          default: return true;
        }
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        (p.clientName ?? "").toLowerCase().includes(q) ||
        (p.reference ?? "").toLowerCase().includes(q) ||
        p.method.toLowerCase().includes(q)
      );
    }

    return list;
  }, [payments, activeTab, activeFilter, filterValue, search]);

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Page header */}
      {!clientId && (
        <PageHeader
          title="Payments"
          description={!isLoading ? `${(payments ?? []).length} payments` : undefined}
          action={
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Payment
            </Button>
          }
        />
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-1.5 border-b bg-white px-4 py-2">
        <span className="shrink-0 text-xs text-slate-500 font-medium mr-1">Select a Filter:</span>
        <div className="flex items-center gap-1 overflow-x-auto">
          {(["reference", "date", "client", "address", "method"] as FilterField[]).map((key) => {
            const label = { reference: "Reference #", date: "Date", client: "Client", address: "Address", method: "Payment Method" }[key];
            return (
              <button
                key={key}
                onClick={() => { setActiveFilter(key); setFilterValue(""); }}
                className={`px-2 py-0.5 rounded text-xs transition-colors whitespace-nowrap ${
                  activeFilter === key ? "bg-brand-100 text-brand-700 font-medium" : "hover:bg-slate-100 text-slate-600"
                }`}
              >
                {label}
              </button>
            );
          })}
          {activeFilter && (
            <>
              <Input
                className="ml-2 h-6 w-48 text-xs"
                placeholder={`Filter by ${({ reference: "Reference #", date: "Date", client: "Client", address: "Address", method: "Payment Method" }[activeFilter])}…`}
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                autoFocus
              />
              <button onClick={() => { setActiveFilter(null); setFilterValue(""); }} className="text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
        {clientId && (
          <div className="ml-auto">
            <Button size="sm" className="h-7 text-xs" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1 h-3 w-3" /> Record Payment
            </Button>
          </div>
        )}
      </div>

      {/* Dark actions bar */}
      <div className="flex items-center justify-between bg-[#3a3a3a] px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex h-7 w-7 items-center justify-center rounded border border-[#6a6a6a] bg-[#5a5a5a] text-white hover:bg-[#6a6a6a]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <div className="ml-2 flex items-center gap-1">
            {(["last30", "deleted"] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-white text-slate-800"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {tab === "last30" ? "Last 30 Days" : "Deleted"}
              </button>
            ))}
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
          columns={clientId ? PAYMENT_COLUMNS.filter((c) => c.key !== "client") : PAYMENT_COLUMNS}
          visibleKeys={visibleKeys}
          onVisibleKeysChange={setVisibleKeys}
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-xs">
          <thead className="sticky top-0 border-b bg-white">
            <tr className="text-left text-xs font-medium text-slate-500">
              <th className="px-3 py-3 cursor-pointer hover:text-slate-700">
                Date ↕
              </th>
              {!clientId && (
                <th className="min-w-[200px] px-3 py-3 cursor-pointer hover:text-slate-700">
                  Client ↑
                </th>
              )}
              <th className="px-3 py-3 text-right cursor-pointer hover:text-slate-700">
                Amount ↕
              </th>
              <th className="px-3 py-3 text-right cursor-pointer hover:text-slate-700">
                Unused Amt ↕
              </th>
              <th className="px-3 py-3 text-right cursor-pointer hover:text-slate-700">
                Refunded Amt ↕
              </th>
              <th className="px-3 py-3 cursor-pointer hover:text-slate-700">
                Reference # ↕
              </th>
              <th className="px-3 py-3 cursor-pointer hover:text-slate-700">
                Payment Method ↕
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: clientId ? 6 : 7 }).map((__, j) => (
                    <td key={j} className="px-3 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={clientId ? 6 : 7} className="py-16 text-center text-sm text-slate-400">
                  No payments recorded yet
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="cursor-pointer border-b hover:bg-slate-50" onClick={() => setViewPayment(p)}>
                  <td className="px-3 py-2.5 text-slate-700 font-medium">
                    {new Date(p.paymentDate + "T12:00:00").toLocaleDateString("en-US", {
                      month: "numeric", day: "numeric", year: "numeric",
                    })}
                  </td>
                  {!clientId && (
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-700">{p.clientName ?? "—"}</div>
                      {p.clientAddress && (
                        <div className="text-xs text-slate-400">{p.clientAddress}</div>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2.5 text-right font-medium text-slate-800">
                    {formatCurrency(p.amountCents)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600">
                    {formatCurrency(p.unusedAmountCents)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600">
                    {formatCurrency(p.refundedAmountCents)}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 text-xs">
                    {p.reference ?? ""}
                  </td>
                  <td className="px-3 py-2.5 text-slate-700 text-xs">
                    {p.method}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AddPaymentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultClientId={clientId}
      />

      {/* Payment detail dialog */}
      <Dialog open={!!viewPayment} onOpenChange={(o) => !o && setViewPayment(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment Detail</DialogTitle>
          </DialogHeader>
          {viewPayment && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-1 border-b">
                <span className="text-slate-500">Date</span>
                <span className="font-medium">{new Date(viewPayment.paymentDate + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
              </div>
              {viewPayment.clientName && (
                <div className="flex justify-between py-1 border-b">
                  <span className="text-slate-500">Client</span>
                  <span className="font-medium">{viewPayment.clientName}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b">
                <span className="text-slate-500">Amount</span>
                <span className="font-semibold text-slate-900">{formatCurrency(viewPayment.amountCents)}</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-slate-500">Method</span>
                <span>{viewPayment.method}</span>
              </div>
              {viewPayment.reference && (
                <div className="flex justify-between py-1 border-b">
                  <span className="text-slate-500">Reference #</span>
                  <span className="font-mono text-xs">{viewPayment.reference}</span>
                </div>
              )}
              {viewPayment.unusedAmountCents > 0 && (
                <div className="flex justify-between py-1 border-b">
                  <span className="text-slate-500">Unused Amount</span>
                  <span className="text-yellow-600">{formatCurrency(viewPayment.unusedAmountCents)}</span>
                </div>
              )}
              {viewPayment.refundedAmountCents > 0 && (
                <div className="flex justify-between py-1 border-b">
                  <span className="text-slate-500">Refunded</span>
                  <span className="text-red-500">{formatCurrency(viewPayment.refundedAmountCents)}</span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
