"use client";

import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useInvoice,
  useUpsertInvoiceLineItem,
  useDeleteInvoiceLineItem,
  useUpdateInvoiceStatus,
  useUpdateInvoiceFinancials,
  useUpdateInvoiceHeader,
  useRecordPayment,
  useSetInvoiceLock,
  useAssignInvoiceNumber,
  useDeleteInvoice,
  LINE_ITEM_MUTATION_KEY,
  useVoidInvoice,
} from "@/lib/hooks/use-invoices";
import { useCRMServices } from "@/lib/hooks/use-crm-jobs";
import { useSelectableEmployees } from "@/lib/hooks/use-employees";
import { useOrgSettings } from "@/lib/hooks/use-org-settings";
import { useDiscounts } from "@/lib/hooks/use-crm-discounts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, formatCurrency } from "@/lib/utils";
import { parseCurrencyToCents } from "@/components/shared/CurrencyInput";
import { Plus, Trash2, Save, DollarSign, CreditCard, ChevronDown, Mail, Printer, Lock, Unlock, Search, MoreVertical, Ban } from "lucide-react";
import { toast } from "sonner";
import type { InvoiceStatus, InvoiceLineItem, PaymentMethod, CRMPayment } from "@/types/crm-invoices";
import type { DiscountType, CRMDiscount } from "@/types/crm-discounts";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import { LineItemDiscountPopover, type LineItemDiscountPatch } from "@/components/shared/LineItemDiscountPopover";
import { ChargeCardDialog } from "@/components/crm/invoices/ChargeCardDialog";
import { useConnectStatus } from "@/lib/hooks/use-crm-card-payments";
import { InvoiceEmailDialog } from "@/components/crm/invoices/InvoiceEmailDialog";
import { Textarea } from "@/components/ui/textarea";
import { getDisplayInvoiceStatus } from "@/lib/invoice-status";

// ── constants ─────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<InvoiceStatus, string> = {
  draft:   "bg-slate-100 text-slate-600",
  printed: "bg-indigo-100 text-indigo-700",
  sent:    "bg-blue-100 text-blue-700",
  viewed:  "bg-purple-100 text-purple-700",
  partial: "bg-yellow-100 text-yellow-700",
  paid:    "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-600",
  void:    "bg-slate-200 text-slate-500",
};

const STATUSES: InvoiceStatus[] = ["draft","printed","sent","viewed","partial","paid","overdue","void"];

export const TERMS_OPTIONS = [
  { value: "due_on_receipt", label: "Due on Receipt", days: 0 },
  { value: "net_10",  label: "Net 10",  days: 10 },
  { value: "net_15",  label: "Net 15",  days: 15 },
  { value: "net_30",  label: "Net 30",  days: 30 },
  { value: "net_45",  label: "Net 45",  days: 45 },
  { value: "net_60",  label: "Net 60",  days: 60 },
  { value: "net_90",  label: "Net 90",  days: 90 },
];

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "Check",                    label: "Check" },
  { value: "Cash",                     label: "Cash" },
  { value: "Credit Card- Visa",        label: "Credit Card (Visa)" },
  { value: "Credit Card- MasterCard",  label: "Credit Card (MC)" },
  { value: "Credit Card- AmEx",        label: "Credit Card (AmEx)" },
  { value: "Credit Card- Discover",    label: "Credit Card (Discover)" },
  { value: "ACH/E-Check",              label: "ACH / E-Check" },
  { value: "AutoPay",                  label: "AutoPay" },
  { value: "Other",                    label: "Other" },
  // Non-cash: reduces the invoice balance without any money received.
  // Excluded from cash-basis reporting (rpt_payments.is_cash = false).
  { value: "AR Write-off",             label: "AR Write-off (non-cash)" },
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function fmtDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── inline editable field ─────────────────────────────────────────────────────

function InlineEdit({
  value, onSave, type = "text", className, placeholder, disabled = false,
}: {
  value: string;
  onSave: (v: string) => void;
  type?: "text" | "date" | "number";
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);

  useEffect(() => { setLocal(value); }, [value]);

  // Locked invoices must not be editable through this field — render it as
  // plain, non-interactive text instead of the edit-trigger button, matching
  // "Save Invoice" and every other locked-state control on this page.
  if (disabled) {
    return (
      <span className={cn("block px-1 py-0.5 text-left", !value && "text-slate-400 italic", className)}>
        {type === "date" ? (value ? fmtDate(value) : (placeholder ?? "—")) : (value || (placeholder ?? "—"))}
      </span>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "rounded px-1 py-0.5 text-left hover:bg-slate-100 focus:outline-none focus:ring-1 focus:ring-brand-400 cursor-text",
          !value && "text-slate-400 italic",
          className
        )}
      >
        {type === "date" ? (value ? fmtDate(value) : (placeholder ?? "Click to set")) : (value || (placeholder ?? "Click to set"))}
      </button>
    );
  }

  return (
    <input
      autoFocus
      type={type}
      value={local}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { setEditing(false); if (local !== value) onSave(local); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { setEditing(false); if (local !== value) onSave(local); }
        if (e.key === "Escape") { setEditing(false); setLocal(value); }
      }}
      className={cn(
        "rounded border border-brand-400 bg-white px-1 py-0.5 text-xs focus:outline-none",
        className
      )}
    />
  );
}

// ── line item row ─────────────────────────────────────────────────────────────

function LineItemRow({
  item, invoiceId, taxRateBps, discounts, locked = false,
}: {
  item: InvoiceLineItem; invoiceId: string; taxRateBps: number; discounts: CRMDiscount[]; locked?: boolean;
}) {
  const [row, setRow] = useState(item);
  const [dirty, setDirty] = useState(false);
  const [rateStr, setRateStr] = useState(() => (item.rateCents / 100).toFixed(2));
  // Bumped on every keystroke. A save that started BEFORE later edits must not
  // clear `dirty` when it lands (that let the refetch-sync effect below wipe a
  // rate the user was still typing — D-15's "typed values lost").
  const editSeq = useRef(0);
  const { mutateAsync: upsert, isPending } = useUpsertInvoiceLineItem();
  const { mutateAsync: remove, isPending: removing } = useDeleteInvoiceLineItem();

  // Re-sync local draft from the refetched prop when this row isn't mid-edit —
  // otherwise an invalidation triggered by another row's save/delete (or a
  // second tab editing the same invoice) leaves this row frozen on stale data
  // forever, since there was previously no sync effect at all.
  useEffect(() => {
    if (!dirty) {
      setRow(item);
      setRateStr((item.rateCents / 100).toFixed(2));
    }
  }, [item, dirty]);

  function update<K extends keyof InvoiceLineItem>(k: K, v: InvoiceLineItem[K]) {
    setRow((p) => {
      const n = { ...p, [k]: v };
      n.totalCents = Math.round(Number(n.qty) * n.rateCents);
      // A flat discount can't exceed the line's own (possibly now-smaller) total
      n.discountCents = Math.min(n.discountCents, n.totalCents);
      return n;
    });
    editSeq.current += 1;
    setDirty(true);
  }

  /** Clear `dirty` only if no further edits happened while the save was in flight. */
  function settleIfUnchanged(seqAtSave: number) {
    if (editSeq.current === seqAtSave) setDirty(false);
  }

  function buildUpsertPayload(r: InvoiceLineItem) {
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      qty: r.qty,
      rate_cents: r.rateCents,
      total_cents: r.totalCents,
      discount_cents: r.discountCents,
      discount_type: r.discountType,
      discount_value: r.discountValue,
      applied_discount_id: r.appliedDiscountId,
      is_taxable: r.isTaxable,
      sort_order: r.sortOrder,
      service_date: r.serviceDate ?? null,
      hours: r.hours ?? null,
      men: r.men ?? null,
    };
  }

  async function saveDiscount(patch: LineItemDiscountPatch) {
    const next = { ...row, ...patch };
    setRow(next);
    try {
      await upsert({ invoiceId, item: buildUpsertPayload(next) });
    } catch {
      setRow(row);
      toast.error("Failed to update discount");
    }
  }

  async function save() {
    if (!dirty) return;
    const seq = editSeq.current;
    try {
      await upsert({ invoiceId, item: buildUpsertPayload(row) });
      settleIfUnchanged(seq);
    } catch { toast.error("Save failed"); }
  }

  async function saveRow(r: InvoiceLineItem) {
    const seq = editSeq.current;
    try {
      await upsert({ invoiceId, item: buildUpsertPayload(r) });
      settleIfUnchanged(seq);
    } catch { toast.error("Save failed"); }
  }

  async function toggleTaxable() {
    const next = { ...row, isTaxable: !row.isTaxable };
    setRow(next);
    try {
      await upsert({ invoiceId, item: buildUpsertPayload(next) });
    } catch {
      setRow(row);
      toast.error("Failed to update taxable setting");
    }
  }

  async function handleDelete() {
    try {
      await remove({ id: row.id, invoiceId });
    } catch { toast.error("Failed to delete item"); }
  }

  return (
    <tr className="group border-b text-xs hover:bg-slate-50">
      {/* Service name */}
      <td className="w-36 px-3 py-2 font-medium text-slate-700 align-middle">
        {row.name ?? <span className="italic text-slate-300">—</span>}
      </td>
      {/* Description */}
      <td className="px-3 py-2">
        <input
          value={row.description}
          onChange={(e) => update("description", e.target.value)}
          onBlur={save}
          placeholder="Description…"
          disabled={locked}
          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-slate-700 hover:border-slate-200 focus:border-brand-400 focus:outline-none focus:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </td>
      {/* Service date */}
      <td className="w-28 px-2 py-2 align-middle">
        <input
          type="date"
          value={row.serviceDate ?? ""}
          onChange={(e) => {
            const updated = { ...row, serviceDate: e.target.value || null };
            setRow(updated);
            setDirty(true);
          }}
          onBlur={save}
          disabled={locked}
          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-slate-500 hover:border-slate-200 focus:border-brand-400 focus:outline-none focus:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </td>
      {/* Taxable */}
      <td className="w-12 px-2 py-2 text-center align-middle">
        <button
          type="button"
          onClick={toggleTaxable}
          disabled={locked}
          title={row.isTaxable ? "Taxable — click to remove" : "Non-taxable — click to apply"}
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed",
            row.isTaxable
              ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
              : "bg-slate-100 text-slate-400 hover:bg-slate-200"
          )}
        >
          {row.isTaxable ? "Tax" : "Non"}
        </button>
      </td>
      {/* Hours */}
      <td className="w-16 px-2 py-2 align-middle">
        <input
          type="number"
          step="0.25"
          min="0"
          value={row.hours ?? ""}
          placeholder="—"
          onChange={(e) => {
            const updated = { ...row, hours: e.target.value ? Number(e.target.value) : null };
            setRow(updated);
            setDirty(true);
          }}
          onBlur={save}
          disabled={locked}
          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-xs text-slate-600 placeholder-slate-300 hover:border-slate-200 focus:border-brand-400 focus:outline-none focus:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </td>
      {/* Men */}
      <td className="w-12 px-2 py-2 align-middle">
        <input
          type="number"
          min="0"
          value={row.men ?? ""}
          placeholder="—"
          onChange={(e) => {
            const updated = { ...row, men: e.target.value ? Number(e.target.value) : null };
            setRow(updated);
            setDirty(true);
          }}
          onBlur={save}
          disabled={locked}
          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-xs text-slate-600 placeholder-slate-300 hover:border-slate-200 focus:border-brand-400 focus:outline-none focus:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </td>
      {/* Qty */}
      <td className="w-14 px-2 py-2 align-middle">
        <input
          type="number"
          value={row.qty}
          onChange={(e) => update("qty", Number(e.target.value))}
          onBlur={save}
          disabled={locked}
          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-xs hover:border-slate-200 focus:border-brand-400 focus:outline-none focus:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </td>
      {/* Rate */}
      <td className="w-24 px-2 py-2 align-middle">
        <input
          type="text"
          inputMode="decimal"
          value={rateStr}
          onChange={(e) => {
            setRateStr(e.target.value);
            // Typing a rate is an edit too — without this, a sibling save
            // finishing mid-keystroke re-synced the row and wiped the rate.
            editSeq.current += 1;
            setDirty(true);
          }}
          onBlur={() => {
            const cents = parseCurrencyToCents(rateStr);
            setRateStr((cents / 100).toFixed(2));
            const totalCents = Math.round(row.qty * cents);
            const updated = { ...row, rateCents: cents, totalCents, discountCents: Math.min(row.discountCents, totalCents) };
            setRow(updated);
            saveRow(updated);
          }}
          disabled={locked}
          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-xs hover:border-slate-200 focus:border-brand-400 focus:outline-none focus:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </td>
      {/* Total */}
      <td className="w-24 px-2 py-2 text-right tabular-nums align-middle">
        {row.discountCents > 0 ? (
          <div className="flex flex-col items-end leading-tight">
            <span className="text-[10px] text-slate-300 line-through">{formatCurrency(row.totalCents)}</span>
            <span className="font-medium text-slate-700">{formatCurrency(row.totalCents - row.discountCents)}</span>
          </div>
        ) : (
          <span className="font-medium text-slate-700">{formatCurrency(row.totalCents)}</span>
        )}
      </td>
      {/* Discount / Delete / save indicator */}
      <td className="w-16 px-2 py-2 align-middle">
        <div className="flex items-center justify-end gap-0.5">
          <LineItemDiscountPopover
            discountCents={row.discountCents}
            discountType={row.discountType}
            discountValue={row.discountValue}
            appliedDiscountId={row.appliedDiscountId}
            lineTotalCents={row.totalCents}
            discounts={discounts}
            onSave={saveDiscount}
            disabled={locked}
          />
          {removing ? (
            <span className="text-[10px] text-slate-400">…</span>
          ) : (
            <button
              type="button"
              onClick={handleDelete}
              disabled={locked}
              className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {isPending && !removing && <span className="text-[10px] text-slate-400">…</span>}
        {dirty && !isPending && !locked && (
          <button type="button" onClick={save} className="text-[10px] text-brand-500 hover:underline">save</button>
        )}
      </td>
    </tr>
  );
}

// ── record payment dialog ─────────────────────────────────────────────────────

function RecordPaymentDialog({
  invoiceId, clientId, balanceCents, open, onOpenChange,
}: {
  invoiceId: string; clientId: string; balanceCents: number; open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const [amount, setAmount] = useState((balanceCents/100).toFixed(2));
  const [date, setDate] = useState(todayStr());
  const [method, setMethod] = useState<PaymentMethod>("Check");
  const [ref, setRef] = useState("");
  const { mutateAsync: record, isPending } = useRecordPayment();

  const amountCents = parseCurrencyToCents(amount);
  // Never apply more than the invoice is owed (D-18: an $80 check on a $55
  // invoice used to apply all $80 and lose the $25). The overage stays on
  // the payment as unused credit on the client's account.
  const appliedCents = Math.min(amountCents, Math.max(0, balanceCents));
  const overageCents = Math.max(0, amountCents - appliedCents);
  const isWriteOff = method === "AR Write-off";

  async function submit() {
    if (!amountCents || amountCents <= 0) { toast.error("Enter a valid amount"); return; }
    if (isWriteOff && overageCents > 0) {
      toast.error(`A write-off can't exceed the invoice balance (${formatCurrency(balanceCents)})`);
      return;
    }
    try {
      await record({
        clientId,
        amountCents,
        paymentDate: date,
        method,
        reference: ref || undefined,
        allocations: invoiceId && appliedCents > 0 ? [{ invoiceId, amountCents: appliedCents }] : [],
      });
      toast.success(overageCents > 0
        ? `Payment recorded — ${formatCurrency(appliedCents)} applied, ${formatCurrency(overageCents)} kept as account credit`
        : "Payment recorded");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to record payment");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Enter Payment</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>Amount</Label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
              <Input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} className="pl-6" />
            </div>
            {overageCents > 0 && (
              <p className={cn("text-xs", isWriteOff ? "text-red-600" : "text-amber-600")}>
                {isWriteOff
                  ? `Exceeds the invoice balance of ${formatCurrency(balanceCents)}.`
                  : `${formatCurrency(appliedCents)} will be applied to this invoice; ${formatCurrency(overageCents)} stays as unused credit on the client's account.`}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Reference / Check #</Label>
            <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={isPending}>{isPending ? "Saving…" : "Record Payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── payment detail dialog ─────────────────────────────────────────────────────

function PaymentDetailDialog({ payment, open, onOpenChange }: {
  payment: CRMPayment | null; open: boolean; onOpenChange: (o: boolean) => void;
}) {
  if (!payment) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Payment Detail</DialogTitle></DialogHeader>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm py-2">
          <dt className="text-slate-400">Amount</dt><dd className="font-semibold text-green-600">{formatCurrency(payment.amountCents)}</dd>
          <dt className="text-slate-400">Date</dt><dd>{new Date(payment.paymentDate + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</dd>
          <dt className="text-slate-400">Method</dt><dd className="capitalize">{payment.method}</dd>
          <dt className="text-slate-400">Reference</dt><dd>{payment.reference ?? "—"}</dd>
          {payment.memo && <><dt className="text-slate-400">Memo</dt><dd>{payment.memo}</dd></>}
        </dl>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── main detail ───────────────────────────────────────────────────────────────

export function InvoiceDetail({
  invoiceId,
  onClose,
  onDiscard,
  onSaved,
}: {
  invoiceId: string;
  onClose?: () => void;
  onDiscard?: () => void;
  onSaved?: () => void;
}) {
  const { data: invoice, isLoading, error: invoiceError } = useInvoice(invoiceId);
  const { mutateAsync: upsertItem } = useUpsertInvoiceLineItem();
  const { mutateAsync: updateStatus } = useUpdateInvoiceStatus();
  const { mutateAsync: updateFinancials } = useUpdateInvoiceFinancials();
  const { mutateAsync: updateHeader } = useUpdateInvoiceHeader();
  const { mutateAsync: setLock } = useSetInvoiceLock();
  const { mutateAsync: assignNumber } = useAssignInvoiceNumber();
  const { mutateAsync: deleteInvoice } = useDeleteInvoice();
  const { mutateAsync: voidInvoice } = useVoidInvoice();
  const { data: savedServices } = useCRMServices();
  const { data: orgSettings } = useOrgSettings();
  const { data: employees } = useSelectableEmployees();
  const salesReps = (employees ?? []).filter((e) => e.isSalesRep);
  const { data: discounts = [] } = useDiscounts();
  const activeDiscounts = discounts.filter((d) => d.isActive);
  const { data: connectStatus } = useConnectStatus();
  const cardPaymentsReady = connectStatus?.chargesEnabled ?? false;

  const [activeTab, setActiveTab] = useState<"invoice" | "audit">("invoice");
  const [lineItemPickerOpen, setLineItemPickerOpen] = useState(false);
  const [lineItemSearch, setLineItemSearch] = useState("");
  const lineItemSearchRef = useRef<HTMLInputElement>(null);
  // In-flight guard for addLineItem: the picker's click handler can fire again
  // (double click, or a second click while the row hasn't rendered yet) and
  // each call used to insert another blank row — the "3 empty $0 rows" of D-15.
  const addingLineItemRef = useRef(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [chargeCardOpen, setChargeCardOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<CRMPayment | null>(null);
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [taxRateBps, setTaxRateBps] = useState(0);
  const [discountCents, setDiscountCents] = useState(0);
  const [discountStr, setDiscountStr] = useState("0.00");
  const [discountType, setDiscountType] = useState<DiscountType | null>(null);
  const [discountValue, setDiscountValue] = useState<number | null>(null);
  const [appliedDiscountId, setAppliedDiscountId] = useState<string | null>(null);
  const [terms, setTerms] = useState("due_on_receipt");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState<number | "">("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmVoidOpen, setConfirmVoidOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");

  useEffect(() => {
    if (!invoice) return;
    const orgDefaultBps = Math.round((orgSettings?.taxRatePercent ?? 0) * 100);
    const resolved = invoice.taxRateBps > 0
      ? invoice.taxRateBps
      : (invoice.clientDefaultTaxRateBps ?? 0) > 0
        ? (invoice.clientDefaultTaxRateBps ?? 0)
        : orgDefaultBps;
    setTaxRateBps(resolved);
    const resolvedTerms = invoice.terms ?? invoice.clientDefaultTerms ?? "due_on_receipt";
    setTerms(resolvedTerms);
    setInvoiceDate(invoice.invoiceDate ?? "");
    // For "due on receipt" invoices that have no explicit due_date saved, derive it from the invoice date
    const resolvedDue = invoice.dueDate
      ? invoice.dueDate
      : resolvedTerms === "due_on_receipt" && invoice.invoiceDate
        ? invoice.invoiceDate
        : "";
    setDueDate(resolvedDue);
    setInvoiceNumber(invoice.invoiceNumber ?? "");
    setDiscountCents(invoice.discountCents);
    setDiscountStr((invoice.discountCents / 100).toFixed(2));
    setDiscountType(invoice.discountType);
    setDiscountValue(invoice.discountValue);
    setAppliedDiscountId(invoice.appliedDiscountId);
    setNotesDraft(invoice.notes ?? "");
  }, [invoice?.id]);

  function handleTermsChange(newTerms: string) {
    setTerms(newTerms);
    if (invoiceDate) {
      const opt = TERMS_OPTIONS.find((t) => t.value === newTerms);
      if (opt) setDueDate(addDays(invoiceDate, opt.days));
    }
  }

  function handleInvoiceDateChange(newDate: string) {
    setInvoiceDate(newDate);
    const opt = TERMS_OPTIONS.find((t) => t.value === terms);
    if (opt && newDate) setDueDate(addDays(newDate, opt.days));
  }

  if (isLoading) return (
    <div className="flex flex-col gap-4 p-8">
      <Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" />
    </div>
  );
  if (!invoice) return (
    <div className="p-8 text-sm text-slate-500">
      {invoiceError ? `Error: ${(invoiceError as Error).message}` : "Invoice not found."}
    </div>
  );

  // The nested crm_invoice_line_items embed in useInvoice() has no .order()
  // applied, so PostgREST returns rows in unspecified order — sort explicitly
  // by sort_order to match the printed PDF (src/app/api/crm/invoices/[id]/pdf/route.ts).
  const lineItems = [...(invoice.lineItems ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const payments = invoice.payments ?? [];
  const hasTax = taxRateBps > 0;

  // Net of each line's own discount; the document-level discount below
  // is a separate reduction stacked on top of that.
  const netLineCents = (li: InvoiceLineItem) => li.totalCents - li.discountCents;
  const subtotal = lineItems.reduce((s, li) => s + netLineCents(li), 0);
  // Tax base is net of the document-level discount — see
  // use-invoices.ts's useUpdateInvoiceFinancials for why (charging tax on
  // the pre-discount amount overcharges the customer).
  const taxableSubtotal = lineItems.filter((li) => li.isTaxable).reduce((s, li) => s + netLineCents(li), 0);
  const taxableBase = Math.max(0, taxableSubtotal - discountCents);
  const previewTax = hasTax ? Math.round((taxableBase * taxRateBps) / 10000) : 0;
  const previewTotal = subtotal - discountCents + previewTax;
  const previewBalance = Math.max(0, previewTotal - invoice.amountPaidCents);

  function applyNamedDiscount(discountId: string) {
    const d = activeDiscounts.find((item) => item.id === discountId);
    if (!d) return;
    const cents = d.discountType === "percent"
      ? Math.round(subtotal * ((d.percentBps ?? 0) / 10000))
      : (d.flatCents ?? 0);
    setDiscountCents(cents);
    setDiscountStr((cents / 100).toFixed(2));
    setDiscountType(d.discountType);
    setDiscountValue(d.discountType === "percent" ? (d.percentBps ?? 0) : (d.flatCents ?? 0));
    setAppliedDiscountId(d.id);
  }

  // A manual edit to the raw $ amount decouples it from whatever saved
  // discount preset produced it — treat it as a plain flat amount.
  function handleDiscountStrChange(v: string) {
    setDiscountStr(v);
    setDiscountType("flat");
    setDiscountValue(Math.round((parseFloat(v) || 0) * 100));
    setAppliedDiscountId(null);
  }

  async function addLineItem(name?: string, description = "", rateCents = 0, isTaxable = false) {
    if (addingLineItemRef.current) return;
    addingLineItemRef.current = true;
    try {
      await upsertItem({
        invoiceId: invoice!.id,
        item: {
          name: name ?? null,
          description,
          qty: 1,
          rate_cents: rateCents,
          total_cents: rateCents,
          is_taxable: isTaxable,
          sort_order: lineItems.length,
        },
      });
    } catch { toast.error("Failed to add item"); }
    finally { addingLineItemRef.current = false; }
  }

  /**
   * Row saves are fire-on-blur, so clicking Save right after typing races the
   * row's own upsert. Wait for any in-flight line-item mutations, then read the
   * invoice back so validation and totals use what's actually persisted.
   */
  async function settledLineItems(): Promise<InvoiceLineItem[]> {
    const deadline = Date.now() + 5000;
    while (queryClient.isMutating({ mutationKey: LINE_ITEM_MUTATION_KEY }) > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 75));
    }
    await queryClient.invalidateQueries({ queryKey: ["crm-invoices", "detail", invoice!.id] });
    const fresh = queryClient.getQueryData<{ lineItems?: InvoiceLineItem[] }>(["crm-invoices", "detail", invoice!.id]);
    return [...(fresh?.lineItems ?? lineItems)].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  async function handleEmailSent() {
    // The dialog already toasts the send result — just lock the invoice.
    await setLock({ id: invoice!.id, locked: true });
  }

  function handlePrint() {
    const win = window.open(`/api/crm/invoices/${invoice!.id}/pdf`, "_blank");
    if (win) win.addEventListener("load", () => win.print(), { once: true });
    // A printed invoice has gone out to the client on paper even though no
    // email was sent — move it out of "draft" the same way emailing does, so
    // auto-invoicing (visits/[visitId]/complete) treats the period as closed
    // and starts a new draft instead of appending more visits to this one.
    const wasDraft = invoice!.status === "draft";
    Promise.all([
      setLock({ id: invoice!.id, locked: true }),
      wasDraft ? updateStatus({ id: invoice!.id, status: "printed" }) : Promise.resolve(),
    ])
      .then(() => toast.info("Invoice locked after print"))
      .catch(() => {});
  }

  function handleDownloadPDF() {
    window.open(`/api/crm/invoices/${invoice!.id}/pdf`, "_blank");
  }

  async function handleToggleLock() {
    try {
      const next = !invoice!.locked;
      await setLock({ id: invoice!.id, locked: next });
      toast.success(next ? "Invoice locked" : "Invoice unlocked");
    } catch { toast.error("Failed to update lock"); }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const savedLines = await settledLineItems();
      const isBlankLine = (li: InvoiceLineItem) =>
        !(li.description ?? "").trim() && !(li.name ?? "").trim() && (li.totalCents ?? 0) === 0;
      if (savedLines.length === 0 || savedLines.every(isBlankLine)) {
        toast.error("Add at least one line item with a description or amount before saving this invoice");
        return;
      }
      const netLine = (li: InvoiceLineItem) => li.totalCents - li.discountCents;
      const savedSubtotal = savedLines.reduce((s, li) => s + netLine(li), 0);
      const savedTaxable = savedLines.filter((li) => li.isTaxable).reduce((s, li) => s + netLine(li), 0);
      const savedTax = Math.round((Math.max(0, savedTaxable - discountCents) * taxRateBps) / 10000);
      const savedTotal = savedSubtotal - discountCents + savedTax;

      // If this is a fresh draft (no number yet), assign one now
      if (invoice!.invoiceNumber == null) {
        await assignNumber({ id: invoice!.id, clientId: invoice!.clientId, amountCents: savedTotal });
      }
      await Promise.all([
        updateFinancials({
          id: invoice!.id,
          lineItems: savedLines,
          taxRateBps,
          discountCents,
          discountType,
          discountValue,
          appliedDiscountId,
          terms,
        }),
        updateHeader({
          id: invoice!.id,
          patch: {
            // invoiceNumber can be "" (untouched) or a validated positive number
            // (see InlineEdit's onSave above) — never send a bare Number(falsy
            // value), which coerces null/"" to 0 and would overwrite a real
            // invoice number with a literal zero.
            invoice_number: typeof invoiceNumber === "number" && invoiceNumber > 0 ? invoiceNumber : undefined,
            invoice_date: invoiceDate || invoice!.invoiceDate,
            due_date: dueDate || null,
            terms,
          },
        }),
      ]);
      toast.success("Invoice saved");
      onSaved?.();
    } catch { toast.error("Save failed"); }
    finally { setSaving(false); }
  }

  async function handleDiscard() {
    if (!invoice) { onDiscard?.(); return; }
    try {
      await deleteInvoice({ id: invoice.id, clientId: invoice.clientId });
    } catch {
      toast.error("Failed to discard draft — it was not deleted");
      return;
    }
    onDiscard?.();
  }

  async function handleDelete() {
    if (!invoice) return;
    setDeleting(true);
    try {
      await deleteInvoice({ id: invoice.id, clientId: invoice.clientId });
      toast.success("Invoice deleted");
      setConfirmDeleteOpen(false);
      onDiscard?.();
    } catch { toast.error("Failed to delete invoice"); }
    finally { setDeleting(false); }
  }

  async function handleVoid() {
    if (!invoice) return;
    setVoiding(true);
    try {
      await voidInvoice({ id: invoice.id, clientId: invoice.clientId });
      toast.success("Invoice voided");
      setConfirmVoidOpen(false);
    } catch { toast.error("Failed to void invoice"); }
    finally { setVoiding(false); }
  }

  const displayAddress = invoice.serviceAddress ?? invoice.clientAddress;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top action bar */}
      <div className="flex items-center justify-between border-b bg-white px-8 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-base font-semibold text-slate-900">
              {invoice.invoiceNumber != null ? `Invoice #${invoice.invoiceNumber}` : "Draft Invoice"}
            </h1>
            <p className="text-xs text-slate-400">{invoice.clientName}</p>
          </div>
          <Badge className={cn("text-[10px] capitalize", STATUS_COLOR[getDisplayInvoiceStatus(invoice)])}>
            {getDisplayInvoiceStatus(invoice)}
          </Badge>
          {invoice.invoiceNumber == null && (
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-semibold text-yellow-700">
              Unsaved — click Save to assign invoice #
            </span>
          )}
          {invoice.locked && (
            <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              <Lock className="h-3 w-3" /> Locked
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onDiscard && invoice.invoiceNumber == null && (
            <Button variant="ghost" size="sm" className="h-8 text-xs text-slate-500 hover:text-red-600"
              onClick={handleDiscard}>
              Discard
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8 text-xs"
            onClick={handleToggleLock}
            title={invoice.locked ? "Unlock invoice to make changes" : "Lock invoice"}>
            {invoice.locked
              ? <><Unlock className="mr-1 h-3.5 w-3.5 text-amber-500" /> Unlock</>
              : <><Lock className="mr-1 h-3.5 w-3.5 text-slate-400" /> Lock</>
            }
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs"
            onClick={() => setPaymentOpen(true)}
            disabled={invoice.status === "void" || invoice.balanceCents <= 0}>
            <DollarSign className="mr-1 h-3.5 w-3.5 text-green-500" /> Enter Payment
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs"
            onClick={() => setChargeCardOpen(true)}
            disabled={invoice.status === "void" || invoice.balanceCents <= 0 || !cardPaymentsReady}
            title={cardPaymentsReady ? undefined : "Connect your Stripe account in Settings > Accounting to accept card payments"}>
            <CreditCard className="mr-1 h-3.5 w-3.5 text-brand-500" /> Collect Payment
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs"
            onClick={handlePrint}>
            <Printer className="mr-1 h-3.5 w-3.5 text-slate-500" /> Print
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs"
            onClick={() => setEmailDialogOpen(true)}
            disabled={invoice.status === "void"}>
            <Mail className="mr-1 h-3.5 w-3.5 text-blue-500" /> Email
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={handleSave} disabled={saving || invoice.locked}>
            <Save className="mr-1 h-3.5 w-3.5" />{saving ? "Saving…" : "Save Invoice"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8">
                <MoreVertical className="h-3.5 w-3.5 text-slate-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={handleDownloadPDF}>
                <Printer className="mr-2 h-3.5 w-3.5 text-slate-500" /> Download PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {invoice.status !== "void" && (
                <DropdownMenuItem onSelect={() => setConfirmVoidOpen(true)}>
                  <Ban className="mr-2 h-3.5 w-3.5 text-slate-500" /> Void Invoice
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600"
                onSelect={() => setConfirmDeleteOpen(true)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete Invoice
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Void confirmation */}
      <Dialog open={confirmVoidOpen} onOpenChange={setConfirmVoidOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Void Invoice?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            {invoice.invoiceNumber != null
              ? `Invoice #${invoice.invoiceNumber} will be marked void and its balance removed from the client's account.`
              : "This draft invoice will be marked void."}
            {" "}The record and any payment history stay intact for your audit trail.
            {invoice.amountPaidCents > 0 && (
              <span className="mt-2 block font-medium text-red-600">
                This invoice has {formatCurrency(invoice.amountPaidCents)} in recorded payments. Voiding it will
                not reverse those payments — refund them first if that money needs to go back to the client.
              </span>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmVoidOpen(false)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={handleVoid} disabled={voiding}>
              {voiding ? "Voiding…" : "Void Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Invoice?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            {invoice.invoiceNumber != null
              ? `This will delete Invoice #${invoice.invoiceNumber}.`
              : "This will delete this draft invoice."}
            {invoice.amountPaidCents > 0 && (
              <span className="mt-2 block font-medium text-red-600">
                This invoice has {formatCurrency(invoice.amountPaidCents)} in recorded payments. Deleting it will
                not reverse those payments — consider voiding it instead.
              </span>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tabs */}
      <div className="flex border-b bg-white px-8">
        {(["invoice", "audit"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "border-b-2 px-4 py-2.5 text-xs font-medium capitalize transition-colors",
              activeTab === tab
                ? "border-brand-500 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            {tab === "audit" ? "Audit Trail" : "Invoice"}
          </button>
        ))}
      </div>

      {activeTab === "audit" ? (
        <div className="flex-1 overflow-auto bg-white">
          <AuditTrailTab recordType="invoice" recordId={invoice.id} />
        </div>
      ) : (
        <div className="flex-1 overflow-auto bg-slate-50">
          {/* Green title bar */}
          <div className="bg-brand-500 px-8 py-3 flex items-center gap-3">
            <span className="text-white text-sm font-semibold">
              Invoice #
              <InlineEdit
                value={invoiceNumber === "" ? (invoice.invoiceNumber != null ? String(invoice.invoiceNumber) : "") : String(invoiceNumber)}
                onSave={(v) => {
                  const n = Number(v);
                  setInvoiceNumber(v.trim() !== "" && Number.isFinite(n) && n > 0 ? n : (invoice.invoiceNumber ?? ""));
                }}
                type="number"
                className="ml-1 w-20 bg-brand-700 text-white text-sm font-semibold border-brand-500"
                disabled={invoice.locked}
              />
            </span>
            {invoice.clientName && (
              <span className="text-brand-200 text-xs">for {invoice.clientName}</span>
            )}
            <Select
              value={invoice.status}
              disabled={invoice.locked}
              onValueChange={(v) => {
                // Voiding needs to zero the balance and resync the client's total,
                // so route it through the confirm dialog instead of a bare status write.
                if (v === "void") { setConfirmVoidOpen(true); return; }
                updateStatus({ id: invoice.id, status: v });
              }}
            >
              <SelectTrigger className="h-6 w-28 text-xs bg-brand-700 border-brand-500 text-white ml-auto disabled:opacity-60 disabled:cursor-not-allowed">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Header — two-column boxed layout */}
          <div className="px-8 py-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Left: Bill To + Service Address */}
            <div className="rounded-lg border bg-white p-4 shadow-sm space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Bill To</p>
              {invoice.clientName && (
                <p className="font-semibold text-slate-800 text-sm">{invoice.clientName}</p>
              )}
              {displayAddress && (
                <p className="text-xs text-slate-500 whitespace-pre-line leading-relaxed">{displayAddress}</p>
              )}
              <div className="pt-1 border-t">
                <p className="text-[10px] font-medium text-slate-400 mb-1">Service Address Override</p>
                <InlineEdit
                  value={invoice.serviceAddress ?? ""}
                  onSave={(v) => updateHeader({ id: invoice.id, patch: { service_address: v || null } })}
                  className="text-xs text-slate-600 w-full"
                  placeholder="Click to set a different service address…"
                  disabled={invoice.locked}
                />
              </div>
            </div>

            {/* Right: Invoice Details */}
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-3">Invoice Details</p>
              <table className="w-full text-xs">
                <tbody>
                  <tr className="border-b border-slate-50">
                    <td className="py-2 pr-4 text-slate-400 w-32 font-medium">Invoice #</td>
                    <td className="py-2 text-slate-700">
                      <InlineEdit
                        value={invoiceNumber === "" ? (invoice.invoiceNumber != null ? String(invoice.invoiceNumber) : "") : String(invoiceNumber)}
                        onSave={(v) => setInvoiceNumber(Number(v) || invoice.invoiceNumber)}
                        type="number"
                        className="w-28"
                        disabled={invoice.locked}
                      />
                    </td>
                  </tr>
                  <tr className="border-b border-slate-50">
                    <td className="py-2 pr-4 text-slate-400 font-medium">Invoice Date</td>
                    <td className="py-2 text-slate-700">
                      <InlineEdit value={invoiceDate} onSave={handleInvoiceDateChange} type="date" className="w-32" disabled={invoice.locked} />
                    </td>
                  </tr>
                  <tr className="border-b border-slate-50">
                    <td className="py-2 pr-4 text-slate-400 font-medium">Terms</td>
                    <td className="py-2">
                      <Select value={terms} onValueChange={handleTermsChange} disabled={invoice.locked}>
                        <SelectTrigger className="h-7 text-xs w-40 border border-slate-200 shadow-none disabled:opacity-60 disabled:cursor-not-allowed">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TERMS_OPTIONS.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                  <tr className="border-b border-slate-50">
                    <td className="py-2 pr-4 text-slate-400 font-medium">Due Date</td>
                    <td className="py-2 text-slate-700">
                      <InlineEdit value={dueDate} onSave={setDueDate} type="date" className="w-32" disabled={invoice.locked} />
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 text-slate-400 font-medium">Tax Rate</td>
                    <td className="py-2">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          disabled={invoice.locked}
                          onClick={() => {
                            const fallback = (invoice.clientDefaultTaxRateBps ?? 0) > 0
                              ? invoice.clientDefaultTaxRateBps!
                              : Math.round((orgSettings?.taxRatePercent ?? 7) * 100);
                            setTaxRateBps(hasTax ? 0 : fallback);
                          }}
                          className={cn(
                            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed",
                            hasTax ? "bg-amber-500" : "bg-slate-200"
                          )}
                        >
                          <span className={cn(
                            "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                            hasTax ? "translate-x-4" : "translate-x-0.5"
                          )} />
                        </button>
                        {hasTax ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number" step="0.25" min="0" max="30"
                              value={(taxRateBps / 100).toFixed(2)}
                              onChange={(e) => setTaxRateBps(Math.round(parseFloat(e.target.value || "0") * 100))}
                              className="h-7 w-24 text-right text-xs"
                              disabled={invoice.locked}
                            />
                            <span className="text-slate-500 font-medium">%</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">No tax</span>
                        )}
                      </div>
                    </td>
                  </tr>
                  <tr className="border-b border-slate-50">
                    <td className="py-2 pr-4 text-slate-400 font-medium align-top">Discount</td>
                    <td className="py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 font-medium">$</span>
                        <Input
                          type="number" step="0.01" min="0"
                          value={discountStr}
                          onChange={(e) => handleDiscountStrChange(e.target.value)}
                          onBlur={() => setDiscountCents(Math.round((parseFloat(discountStr) || 0) * 100))}
                          className="h-7 w-24 text-right text-xs"
                          disabled={invoice.locked}
                        />
                        {activeDiscounts.length > 0 && (
                          <Select onValueChange={applyNamedDiscount} disabled={invoice.locked}>
                            <SelectTrigger className="h-7 w-48 text-xs disabled:opacity-60 disabled:cursor-not-allowed">
                              <SelectValue placeholder="Apply a saved discount…" />
                            </SelectTrigger>
                            <SelectContent>
                              {activeDiscounts.map((d) => (
                                <SelectItem key={d.id} value={d.id} className="text-xs">
                                  {d.name} — {d.discountType === "percent"
                                    ? `${((d.percentBps ?? 0) / 100).toFixed(2)}%`
                                    : formatCurrency(d.flatCents ?? 0)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </td>
                  </tr>
                  <tr className="border-b border-slate-50">
                    <td className="py-2 pr-4 text-slate-400 font-medium">PO #</td>
                    <td className="py-2 text-slate-700">
                      <InlineEdit
                        value={invoice.poNumber ?? ""}
                        onSave={(v) => updateHeader({ id: invoice.id, patch: { po_number: v || null } })}
                        className="w-36"
                        placeholder="Click to add…"
                        disabled={invoice.locked}
                      />
                    </td>
                  </tr>
                  <tr className="border-b border-slate-50">
                    <td className="py-2 pr-4 text-slate-400 font-medium">Sales Rep</td>
                    <td className="py-2">
                      <Select
                        value={invoice.salesRepId ?? ""}
                        onValueChange={(v) => updateHeader({ id: invoice.id, patch: { sales_rep_id: v || null } })}
                        disabled={invoice.locked}
                      >
                        <SelectTrigger className="h-7 text-xs w-44 border border-slate-200 shadow-none disabled:opacity-60 disabled:cursor-not-allowed">
                          <SelectValue placeholder="Assign sales rep…" />
                        </SelectTrigger>
                        <SelectContent>
                          {salesReps.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.firstName} {e.lastName}
                            </SelectItem>
                          ))}
                          {invoice.salesRepId && !salesReps.some((e) => e.id === invoice.salesRepId) && (
                            <SelectItem value={invoice.salesRepId}>
                              {invoice.salesRepName ?? "Unknown"}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 text-slate-400 font-medium">Payment Method</td>
                    <td className="py-2">
                      <Select
                        value={invoice.preferredPaymentMethod ?? invoice.clientDefaultPaymentMethod ?? ""}
                        onValueChange={(v) => updateHeader({ id: invoice.id, patch: { preferred_payment_method: v || null } })}
                        disabled={invoice.locked}
                      >
                        <SelectTrigger className="h-7 text-xs w-44 border border-slate-200 shadow-none disabled:opacity-60 disabled:cursor-not-allowed">
                          <SelectValue placeholder="Select method…" />
                        </SelectTrigger>
                        <SelectContent>
                          {METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes — shown on the invoice PDF/email below the line items */}
          <div className="mx-8 mb-5 rounded-lg border bg-white p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Notes</p>
            <Textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={() => {
                if (notesDraft !== (invoice.notes ?? "")) {
                  updateHeader({ id: invoice.id, patch: { notes: notesDraft || null } });
                }
              }}
              placeholder="Add a note that will appear on this invoice's PDF and email…"
              className="min-h-[70px] text-xs"
            />
          </div>

          {/* Line items */}
          <div className="mx-8 mb-5 rounded-lg border bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-brand-500 text-white">
                <tr>
                  <th className="w-36 px-3 py-2.5 text-left font-semibold">Service</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Description</th>
                  <th className="w-28 px-2 py-2.5 text-left font-semibold">Date</th>
                  <th className="w-12 px-2 py-2.5 text-center font-semibold">Tax</th>
                  <th className="w-16 px-2 py-2.5 text-right font-semibold">Hours</th>
                  <th className="w-12 px-2 py-2.5 text-right font-semibold">Men</th>
                  <th className="w-14 px-2 py-2.5 text-right font-semibold">Qty</th>
                  <th className="w-24 px-2 py-2.5 text-right font-semibold">Rate</th>
                  <th className="w-24 px-2 py-2.5 text-right font-semibold">Total</th>
                  <th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li) => (
                  <LineItemRow key={li.id} item={li} invoiceId={invoice.id} taxRateBps={taxRateBps} discounts={activeDiscounts} locked={invoice.locked} />
                ))}
                {lineItems.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400 text-xs">
                      No line items yet — add one below
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Add item + totals */}
            <div className="border-t p-4 flex items-start justify-between gap-4 bg-slate-50">
              <Popover
                open={lineItemPickerOpen && !invoice.locked}
                onOpenChange={(o) => {
                  if (invoice.locked) return;
                  setLineItemPickerOpen(o);
                  if (!o) setLineItemSearch("");
                  else setTimeout(() => lineItemSearchRef.current?.focus(), 50);
                }}
              >
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs" disabled={invoice.locked}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add Line Item
                    <ChevronDown className="ml-1 h-3 w-3 text-slate-400" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-0">
                  {/* Search input */}
                  <div className="flex items-center gap-2 border-b px-3 py-2">
                    <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <input
                      ref={lineItemSearchRef}
                      value={lineItemSearch}
                      onChange={(e) => setLineItemSearch(e.target.value)}
                      placeholder="Search services…"
                      className="flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400"
                    />
                  </div>
                  {/* Results */}
                  <div className="max-h-60 overflow-y-auto py-1">
                    {(savedServices ?? [])
                      .filter((svc) =>
                        !lineItemSearch ||
                        svc.name.toLowerCase().includes(lineItemSearch.toLowerCase())
                      )
                      .map((svc) => (
                        <button
                          key={svc.id}
                          className="flex w-full items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 text-left"
                          onClick={() => {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            addLineItem(svc.name, svc.name, svc.defaultRateCents ?? 0, (svc as any).isTaxable ?? false);
                            setLineItemPickerOpen(false);
                            setLineItemSearch("");
                          }}
                        >
                          <span className="font-medium text-slate-800">{svc.name}</span>
                          <div className="flex items-center gap-2 ml-2 shrink-0">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {(svc as any).isTaxable && (
                              <span className="text-[10px] text-amber-600 bg-amber-50 rounded px-1">Tax</span>
                            )}
                            {(svc.defaultRateCents ?? 0) > 0 && (
                              <span className="text-slate-400">${((svc.defaultRateCents ?? 0) / 100).toFixed(2)}</span>
                            )}
                          </div>
                        </button>
                      ))}
                    {(savedServices ?? []).filter((svc) =>
                      !lineItemSearch || svc.name.toLowerCase().includes(lineItemSearch.toLowerCase())
                    ).length === 0 && lineItemSearch && (
                      <p className="px-3 py-2 text-xs text-slate-400">No services match &ldquo;{lineItemSearch}&rdquo;</p>
                    )}
                    <div className="border-t mt-1 pt-1">
                      <button
                        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-slate-500 hover:bg-slate-50"
                        onClick={() => {
                          addLineItem(undefined, "");
                          setLineItemPickerOpen(false);
                          setLineItemSearch("");
                        }}
                      >
                        <Plus className="h-3 w-3" /> Blank line item
                      </button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Totals */}
              <div className="text-xs text-right space-y-1 min-w-[220px]">
                <div className="flex justify-between gap-8">
                  <span className="text-slate-400">Subtotal</span>
                  <span className="tabular-nums font-medium">{formatCurrency(subtotal)}</span>
                </div>
                {discountCents > 0 && (
                  <div className="flex justify-between gap-8">
                    <span className="text-slate-400">Discount</span>
                    <span className="tabular-nums text-red-500">−{formatCurrency(discountCents)}</span>
                  </div>
                )}
                {hasTax && (
                  <div className="flex justify-between gap-8">
                    <span className="text-amber-600">Tax ({(taxRateBps/100).toFixed(2)}%)</span>
                    <span className="tabular-nums text-amber-600">{formatCurrency(previewTax)}</span>
                  </div>
                )}
                <div className="flex justify-between gap-8 border-t pt-1 font-bold text-sm">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(previewTotal)}</span>
                </div>
                {invoice.amountPaidCents > 0 && (
                  <div className="flex justify-between gap-8">
                    <span className="text-green-600">Paid</span>
                    <span className="tabular-nums text-green-600">−{formatCurrency(invoice.amountPaidCents)}</span>
                  </div>
                )}
                <div className={cn("flex justify-between gap-8 font-semibold", previewBalance > 0 ? "text-red-600" : "text-slate-500")}>
                  <span>Balance Due</span>
                  <span className="tabular-nums">{formatCurrency(previewBalance)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment history */}
          {payments.length > 0 && (
            <div className="mx-8 mb-5 rounded-lg border bg-white shadow-sm overflow-x-auto">
              <div className="border-b bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Payment History
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-[10px] font-semibold uppercase text-slate-400 bg-slate-50">
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Method</th>
                    <th className="px-4 py-2">Reference</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    // Split (multi-invoice) payments carry this invoice's actual
                    // allocated share separately from the payment's full amount —
                    // see useInvoice() in use-invoices.ts.
                    const displayAmount = p.displayAmountCents ?? p.amountCents;
                    const fullyRefunded = p.refundedAmountCents > 0 && p.refundedAmountCents >= p.amountCents;
                    const partiallyRefunded = p.refundedAmountCents > 0 && !fullyRefunded;
                    return (
                      <tr key={p.id} className="border-b hover:bg-brand-50 cursor-pointer" onClick={() => setSelectedPayment(p)}>
                        <td className="px-4 py-2.5 text-brand-700 hover:underline font-medium">{fmtDate(p.paymentDate)}</td>
                        <td className="px-4 py-2.5 capitalize">
                          {p.method}
                          {p.isSplitAllocation && <span className="ml-1 text-slate-400">(split)</span>}
                          {/* Payment recorded against a parent client_id (e.g. one
                              check from a property manager covering several
                              sub-accounts) but allocated to THIS invoice, whose
                              own client is a child — make that origin explicit
                              rather than implying the child paid directly. */}
                          {p.clientId !== invoice.clientId && (
                            <span className="ml-1 text-slate-400 normal-case">
                              (via {p.clientName ?? "parent account"})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{p.reference ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right font-medium">
                          <div className="flex items-center justify-end gap-1.5">
                            {(fullyRefunded || partiallyRefunded) && (
                              <span className={cn(
                                "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                                fullyRefunded ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                              )}>
                                {fullyRefunded ? "Refunded" : "Partially Refunded"}
                              </span>
                            )}
                            <span className={cn(fullyRefunded ? "text-slate-400 line-through" : "text-green-600")}>
                              {formatCurrency(displayAmount)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <RecordPaymentDialog
        invoiceId={invoice.id}
        clientId={invoice.clientId}
        balanceCents={invoice.balanceCents}
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
      />
      <ChargeCardDialog
        invoiceId={invoice.id}
        balanceCents={invoice.balanceCents}
        savedPaymentMethod={
          invoice.clientSavedPaymentMethodType
            ? { type: invoice.clientSavedPaymentMethodType, summary: invoice.clientSavedPaymentMethodSummary ?? "Saved method" }
            : null
        }
        open={chargeCardOpen}
        onOpenChange={setChargeCardOpen}
        onCharged={() => {
          const invalidate = () => {
            queryClient.invalidateQueries({ queryKey: ["crm-invoices"] });
            queryClient.invalidateQueries({ queryKey: ["clients", invoice.clientId] });
            queryClient.invalidateQueries({ queryKey: ["clients"] });
          };
          invalidate();
          // The card charge is confirmed client-side, but the invoice/balance
          // update itself happens async in the Stripe Connect webhook
          // (payment_intent.succeeded) — re-invalidate after it's had time to
          // land so the balance doesn't stay stuck at its pre-payment value.
          setTimeout(invalidate, 4000);
        }}
      />
      <PaymentDetailDialog
        payment={selectedPayment}
        open={!!selectedPayment}
        onOpenChange={(o) => { if (!o) setSelectedPayment(null); }}
      />
      <InvoiceEmailDialog
        invoiceId={invoice.id}
        invoiceNumber={invoice.invoiceNumber}
        totalCents={invoice.totalCents}
        balanceCents={invoice.balanceCents}
        dueDate={invoice.dueDate}
        clientName={invoice.clientName ?? null}
        clientEmail={invoice.clientEmail ?? null}
        pinnedPdfTemplateId={invoice.pdfTemplateId ?? null}
        open={emailDialogOpen}
        onClose={() => setEmailDialogOpen(false)}
        onSent={handleEmailSent}
      />
    </div>
  );
}
