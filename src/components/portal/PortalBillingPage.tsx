"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, Download, CheckCircle2, Clock, AlertCircle, FileText } from "lucide-react";
import { PayInvoiceDialog } from "@/components/portal/PayInvoiceDialog";

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
  invoice_number: number;
  total_cents: number;
  balance_cents: number;
  amount_paid_cents: number;
  due_date: string | null;
  status: string;
  created_at: string;
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

export default function PortalBillingPage({ invoices, today }: { invoices: Invoice[]; today: string }) {
  const router = useRouter();
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const open = invoices.filter(isOutstanding);
  const closed = invoices.filter((i) => !isOutstanding(i));
  const totalBalance = open.reduce((sum, i) => sum + i.balance_cents, 0);
  const payingInvoice = invoices.find((i) => i.id === payingInvoiceId) ?? null;

  function handlePaid() {
    router.refresh();
    setTimeout(() => router.refresh(), 4000);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold text-slate-900">Billing</h1>

      {/* Balance summary + payment method */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={`bg-white rounded-xl border p-5 ${totalBalance > 0 ? "border-slate-200" : "border-slate-200"}`}>
          <p className="text-sm font-medium text-slate-600 mb-1">Balance Due</p>
          <p className={`text-3xl font-bold ${totalBalance > 0 ? "text-slate-900" : "text-slate-400"}`}>
            {fmt(totalBalance)}
          </p>
          <div className="mt-4">
            {open.length === 1 ? (
              <button
                onClick={() => setPayingInvoiceId(open[0].id)}
                className="w-full h-10 rounded-lg bg-brand-500 text-white text-sm font-medium flex items-center justify-center gap-2"
              >
                <CreditCard className="h-4 w-4" />
                Pay Now
              </button>
            ) : (
              <button
                disabled
                title={open.length > 1 ? "Pay individual invoices below" : "No balance due"}
                className="w-full h-10 rounded-lg bg-brand-500 text-white text-sm font-medium opacity-50 cursor-not-allowed flex items-center justify-center gap-2"
              >
                <CreditCard className="h-4 w-4" />
                Pay Now
              </button>
            )}
            {open.length > 1 && (
              <p className="text-center text-xs text-slate-400 mt-2">Pay individual invoices below</p>
            )}
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
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Outstanding</h2>
          <ul className="flex flex-col gap-2">
            {open.map((inv) => (
              <InvoiceRow key={inv.id} invoice={inv} today={today} onPay={() => setPayingInvoiceId(inv.id)} />
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

      {payingInvoice && (
        <PayInvoiceDialog
          invoiceId={payingInvoice.id}
          balanceCents={payingInvoice.balance_cents}
          open={payingInvoiceId != null}
          onClose={() => setPayingInvoiceId(null)}
          onPaid={handlePaid}
        />
      )}
    </div>
  );
}

function InvoiceRow({ invoice: inv, today, onPay }: { invoice: Invoice; today: string; onPay?: () => void }) {
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
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800">Invoice #{inv.invoice_number}</p>
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
