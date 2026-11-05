"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, Download, CheckCircle2, Clock, AlertCircle, FileText } from "lucide-react";
import { PayInvoiceDialog, type PayDialogTarget } from "@/components/portal/PayInvoiceDialog";
import { SubAccountLabel } from "@/components/portal/SubAccountLabel";

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

// due_date is a date-only YYYY-MM-DD; parsing it bare treats it as UTC
// midnight, which renders as the previous day in US timezones.
function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const OPEN_STATUSES = ["printed", "sent", "viewed", "partial", "overdue"];

/** Outstanding = an open status AND money actually owed. A $0 (or fully
 *  credited) invoice can sit in "sent"/"overdue" but there's nothing to pay. */
function isOutstanding(inv: Invoice) {
  return OPEN_STATUSES.includes(inv.status) && inv.balance_cents > 0;
}

interface Invoice {
  id: string;
  client_id: string;
  invoice_number: number;
  total_cents: number;
  balance_cents: number;
  amount_paid_cents: number;
  due_date: string | null;
  status: string;
  created_at: string;
  /** Set when the invoice is on one of the login's sub-accounts. */
  accountName?: string | null;
}

export interface PortalPayment {
  id: string;
  date: string;
  method: string;
  amountCents: number;
  refundedCents: number;
  unusedCents: number;
  isCredit: boolean;
  isPrepayment: boolean;
  accountName: string | null;
  /** The invoices this payment was applied to, so a customer can match a charge to what it paid. */
  applied: { invoiceId: string; invoiceNumber: number | null; amountCents: number }[];
}

interface PortalAccountOption {
  id: string;
  displayName: string;
  isSelf: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft:   { label: "Draft",    color: "bg-slate-100 text-slate-500 border-slate-200",     icon: <Clock className="h-3.5 w-3.5" /> },
  printed: { label: "Open",     color: "bg-blue-50 text-blue-700 border-blue-200",          icon: <Clock className="h-3.5 w-3.5" /> },
  sent:    { label: "Open",     color: "bg-blue-50 text-blue-700 border-blue-200",          icon: <Clock className="h-3.5 w-3.5" /> },
  partial: { label: "Partial",  color: "bg-yellow-50 text-yellow-700 border-yellow-200",    icon: <AlertCircle className="h-3.5 w-3.5" /> },
  overdue: { label: "Overdue",  color: "bg-red-50 text-red-600 border-red-200",             icon: <AlertCircle className="h-3.5 w-3.5" /> },
  paid:    { label: "Paid",     color: "bg-green-50 text-green-700 border-green-200",       icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  settled: { label: "No balance", color: "bg-slate-50 text-slate-500 border-slate-200",     icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  void:    { label: "Void",     color: "bg-slate-100 text-slate-400 border-slate-200",      icon: <Clock className="h-3.5 w-3.5" /> },
};

export default function PortalBillingPage({
  invoices,
  today,
  payments,
  accounts,
}: {
  invoices: Invoice[];
  today: string;
  payments: PortalPayment[];
  accounts: PortalAccountOption[];
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<PayDialogTarget | null>(null);
  const open = invoices.filter(isOutstanding);
  const closed = invoices.filter((i) => !isOutstanding(i));
  const totalBalance = open.reduce((sum, i) => sum + i.balance_cents, 0);
  const multiAccount = accounts.length > 1;

  // Everything outstanding starts checked (SA's default), so the common case —
  // pay what I owe — is one click. A payment settles against ONE account, so
  // when sub-accounts exist the selection only ever spans a single account.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const first = invoices.filter(isOutstanding)[0];
    return new Set(invoices.filter((i) => isOutstanding(i) && i.client_id === first?.client_id).map((i) => i.id));
  });
  // A paid invoice drops out of "open" after the refresh; keep the selection honest.
  useEffect(() => {
    setSelectedIds((cur) => {
      const openIds = new Set(open.map((i) => i.id));
      const next = new Set([...cur].filter((id) => openIds.has(id)));
      return next.size === cur.size ? cur : next;
    });
  }, [open]);

  const selected = useMemo(() => open.filter((i) => selectedIds.has(i.id)), [open, selectedIds]);
  const selectedTotal = selected.reduce((sum, i) => sum + i.balance_cents, 0);
  const allSelected = open.length > 0 && selected.length === open.filter((i) => i.client_id === (selected[0] ?? open[0]).client_id).length;

  function toggle(inv: Invoice) {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(inv.id)) {
        next.delete(inv.id);
        return next;
      }
      const other = open.find((i) => next.has(i.id));
      // Different account than what's already checked → start a new selection.
      if (other && other.client_id !== inv.client_id) next.clear();
      next.add(inv.id);
      return next;
    });
  }

  function toggleAll() {
    const anchor = selected[0] ?? open[0];
    if (!anchor) return;
    const group = open.filter((i) => i.client_id === anchor.client_id);
    setSelectedIds(allSelected ? new Set() : new Set(group.map((i) => i.id)));
  }

  function handlePaid() {
    router.refresh();
    setTimeout(() => router.refresh(), 4000);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold text-slate-900">Billing</h1>

      {/* Balance summary + payment method */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm font-medium text-slate-600 mb-1">Balance Due</p>
          <p className={`text-3xl font-bold ${totalBalance > 0 ? "text-slate-900" : "text-slate-400"}`}>
            {fmt(totalBalance)}
          </p>
          <div className="mt-4">
            <button
              disabled={selected.length === 0}
              onClick={() => setDialog({ kind: "invoices", invoiceIds: selected.map((i) => i.id), balanceCents: selectedTotal })}
              title={open.length === 0 ? "No balance due" : selected.length === 0 ? "Check the invoices you want to pay" : undefined}
              className="w-full h-10 rounded-lg bg-brand-500 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CreditCard className="h-4 w-4" />
              {selected.length > 0 ? `Pay ${fmt(selectedTotal)}${selected.length > 1 ? ` (${selected.length} invoices)` : ""}` : "Pay Now"}
            </button>
            <button
              onClick={() => setDialog({ kind: "prepayment" })}
              className="mt-2 w-full text-center text-xs font-medium text-brand-600 hover:underline"
            >
              Make a prepayment
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm font-medium text-slate-600 mb-1">Payment Method</p>
          <p className="text-sm text-slate-400 mt-2">Manage your saved card or bank account from your Account page.</p>
          <div className="mt-4">
            <Link
              href="/portal/account"
              className="w-full h-10 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition flex items-center justify-center gap-2"
            >
              <CreditCard className="h-4 w-4" />
              Manage Payment Method
            </Link>
          </div>
        </div>
      </div>

      {/* Open invoices */}
      {open.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Outstanding</h2>
            <button onClick={toggleAll} className="text-xs font-medium text-brand-600 hover:underline">
              {allSelected ? "Deselect all" : "Select all unpaid"}
            </button>
          </div>
          {multiAccount && (
            <p className="mb-2 text-xs text-slate-400">Invoices from different accounts are paid separately.</p>
          )}
          <ul className="flex flex-col gap-2">
            {open.map((inv) => (
              <InvoiceRow
                key={inv.id}
                invoice={inv}
                today={today}
                onPay={() => setDialog({ kind: "invoices", invoiceIds: [inv.id], balanceCents: inv.balance_cents })}
                checked={selectedIds.has(inv.id)}
                onToggle={() => toggle(inv)}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Payments & credits */}
      {payments.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Payments &amp; Credits</h2>
          <ul className="flex flex-col gap-2">
            {payments.map((p) => (
              <PaymentRow key={p.id} payment={p} />
            ))}
          </ul>
        </section>
      )}

      {/* History */}
      {closed.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">History</h2>
          <ul className="flex flex-col gap-2">
            {closed.map((inv) => (
              <InvoiceRow key={inv.id} invoice={inv} today={today} />
            ))}
          </ul>
        </section>
      )}

      {invoices.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
          No invoices on file yet.
        </div>
      )}

      {dialog && (
        <PayInvoiceDialog
          // A fresh mount per target so the prepayment nonce and form reset each time.
          key={dialog.kind === "invoices" ? dialog.invoiceIds.join(",") : "prepayment"}
          target={dialog}
          open
          onClose={() => setDialog(null)}
          onPaid={handlePaid}
        />
      )}
    </div>
  );
}

function fmtMethod(method: string) {
  return method.replace("Credit Card- ", "Card · ").replace("ACH/E-Check", "Bank transfer");
}

function PaymentRow({ payment: p }: { payment: PortalPayment }) {
  const label = p.isCredit ? "Credit" : p.isPrepayment ? "Prepayment" : "Payment";
  const net = p.amountCents - p.refundedCents;
  return (
    <li className="bg-white rounded-xl border border-slate-200 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">
            {label}
            <span className="ml-2 text-xs font-normal text-slate-500">{fmtMethod(p.method)}</span>
          </p>
          <SubAccountLabel name={p.accountName} />
          <p className="text-xs text-slate-500 mt-0.5">Paid {fmtDate(p.date)}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-slate-900">{fmt(p.amountCents)}</p>
          {p.refundedCents > 0 && <p className="text-xs text-slate-400">Refunded {fmt(p.refundedCents)}</p>}
        </div>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        {p.applied.length > 0 ? (
          <>
            Applied to {p.applied.map((a) => (a.invoiceNumber != null ? `Invoice #${a.invoiceNumber}` : "an invoice")).join(", ")}
            {p.applied.length > 1 && (
              <span className="text-slate-400">
                {" "}
                ({p.applied.map((a) => `${a.invoiceNumber != null ? `#${a.invoiceNumber}` : "—"} ${fmt(a.amountCents)}`).join(" · ")})
              </span>
            )}
            {p.unusedCents > 0 && net > 0 && <span className="text-slate-400"> · {fmt(Math.min(p.unusedCents, net))} still available as credit</span>}
          </>
        ) : p.unusedCents > 0 ? (
          <>Held as credit on your account · {fmt(p.unusedCents)} available for your next invoice</>
        ) : (
          <>Not applied to an invoice</>
        )}
      </p>
    </li>
  );
}

function InvoiceRow({
  invoice: inv,
  today,
  onPay,
  checked,
  onToggle,
}: {
  invoice: Invoice;
  today: string;
  onPay?: () => void;
  checked?: boolean;
  onToggle?: () => void;
}) {
  const outstanding = isOutstanding(inv);
  // No due date means it can't be past due — `new Date(null)` is the 1970
  // epoch, which used to flag every undated invoice "Past due Dec 31, 1969".
  const pastDue = outstanding && (inv.status === "overdue" || (!!inv.due_date && inv.due_date < today));
  const isPaid = inv.status === "paid" || (OPEN_STATUSES.includes(inv.status) && inv.balance_cents <= 0 && inv.total_cents > 0);
  const displayCfg = pastDue
    ? STATUS_CONFIG.overdue
    : isPaid
    ? STATUS_CONFIG.paid
    : OPEN_STATUSES.includes(inv.status) && !outstanding
    ? STATUS_CONFIG.settled
    : (STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.sent);
  const subtitle =
    inv.status === "void"
      ? "Voided"
      : isPaid
      ? "Paid"
      : !outstanding
      ? "Nothing due"
      : !inv.due_date
      ? "No due date"
      : `${pastDue ? "Past due" : "Due"} ${fmtDate(inv.due_date)}`;

  return (
    <li className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
      {onToggle && (
        <input
          type="checkbox"
          checked={!!checked}
          onChange={onToggle}
          aria-label={`Select invoice #${inv.invoice_number} to pay`}
          className="h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-500"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800">Invoice #{inv.invoice_number}</p>
        <SubAccountLabel name={inv.accountName} />
        <p className={`text-xs mt-0.5 ${pastDue ? "text-red-500" : "text-slate-500"}`}>
          {subtitle}
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          {!isPaid && inv.balance_cents > 0 && inv.balance_cents < inv.total_cents && (
            <p className="text-xs text-slate-400">Balance {fmt(inv.balance_cents)}</p>
          )}
          <p className="text-sm font-semibold text-slate-900">{fmt(inv.total_cents)}</p>
        </div>

        <span className={`flex items-center gap-1 text-xs border rounded-full px-2 py-0.5 ${displayCfg.color}`}>
          {displayCfg.icon}
          {displayCfg.label}
        </span>

        {onPay && inv.balance_cents > 0 && (
          <button
            onClick={onPay}
            className="flex items-center gap-1 rounded-lg bg-brand-500 px-2.5 py-1 text-xs font-medium text-white"
          >
            <CreditCard className="h-3.5 w-3.5" />
            Pay
          </button>
        )}

        <a
          href={`/api/portal/billing/${inv.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
          title="View PDF"
        >
          <FileText className="h-4 w-4" />
        </a>
        <a
          href={`/api/portal/billing/${inv.id}/pdf?download=1`}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
          title="Download PDF"
        >
          <Download className="h-4 w-4" />
        </a>
      </div>
    </li>
  );
}
