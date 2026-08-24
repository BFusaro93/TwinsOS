"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Loader2, CheckCircle2 } from "lucide-react";
import { getScopedStripeJs, hasPublishableKey } from "@/lib/stripe/client";

function cents(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

interface PublicInvoice {
  invoiceNumber: number;
  description: string | null;
  invoiceDate: string;
  dueDate: string | null;
  status: string;
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  amountPaidCents: number;
  balanceCents: number;
  clientName: string | null;
  lineItems: { name: string | null; description: string; qty: number; rateCents: number; totalCents: number }[];
  org: { name: string; brandColor: string; logoUrl: string | null };
}

interface CreateIntentResult {
  clientSecret: string;
  connectedAccountId: string;
  balanceCents: number;
  feeCents: number;
  totalChargeCents: number;
}

function PayForm({ totalChargeCents, onSuccess }: { totalChargeCents: number; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    setSubmitting(false);
    if (confirmError) {
      setError(confirmError.message ?? "Payment failed");
      return;
    }
    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
      onSuccess();
    } else {
      setError("Payment was not completed");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PaymentElement />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={handleConfirm}
        disabled={submitting || !stripe}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Pay {cents(totalChargeCents)}
      </button>
    </div>
  );
}

export default function PublicInvoicePage() {
  const params = useParams();
  const token = params.token as string;

  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [intent, setIntent] = useState<CreateIntentResult | null>(null);
  const [creatingIntent, setCreatingIntent] = useState(false);
  const [paySucceeded, setPaySucceeded] = useState(false);

  useEffect(() => {
    fetch(`/api/public/invoices/${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load invoice");
        setInvoice(data);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load invoice"));
  }, [token]);

  async function handleStartPay() {
    setCreatingIntent(true);
    try {
      const res = await fetch(`/api/public/invoices/${token}/create-intent`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start payment");
      setIntent(data);
      setPayOpen(true);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to start payment");
    } finally {
      setCreatingIntent(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <p className="text-sm text-slate-500">{loadError}</p>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const stripeJs = intent ? getScopedStripeJs(intent.connectedAccountId) : null;
  const canPay = invoice.balanceCents > 0 && invoice.status !== "void" && hasPublishableKey();

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="mx-auto max-w-2xl rounded-lg border bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{invoice.org.name}</h1>
            <p className="text-sm text-slate-400">Invoice #{String(invoice.invoiceNumber).padStart(5, "0")}</p>
          </div>
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold capitalize text-white"
            style={{ backgroundColor: invoice.org.brandColor }}
          >
            {invoice.status}
          </span>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Billed To</p>
            <p className="font-medium text-slate-800">{invoice.clientName ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Invoice Date</p>
            <p className="text-slate-700">{fmtDate(invoice.invoiceDate)}</p>
          </div>
          {invoice.dueDate && (
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Payment Due</p>
              <p className="text-slate-700">{fmtDate(invoice.dueDate)}</p>
            </div>
          )}
        </div>

        <div className="mb-6 overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoice.lineItems.map((li, i) => (
                <tr key={i}>
                  <td className="px-3 py-2">{li.name ?? invoice.description ?? "Service"}</td>
                  <td className="px-3 py-2 text-right">{li.qty}</td>
                  <td className="px-3 py-2 text-right">{cents(li.rateCents)}</td>
                  <td className="px-3 py-2 text-right font-medium">{cents(li.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto flex w-56 flex-col gap-1 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{cents(invoice.subtotalCents)}</span></div>
          {invoice.taxCents > 0 && (
            <div className="flex justify-between"><span className="text-slate-500">Tax</span><span>{cents(invoice.taxCents)}</span></div>
          )}
          {invoice.discountCents > 0 && (
            <div className="flex justify-between"><span className="text-slate-500">Discount</span><span>-{cents(invoice.discountCents)}</span></div>
          )}
          <div className="flex justify-between border-t pt-1 font-semibold"><span>Total</span><span>{cents(invoice.totalCents)}</span></div>
          {invoice.amountPaidCents > 0 && (
            <div className="flex justify-between"><span className="text-slate-500">Paid</span><span>-{cents(invoice.amountPaidCents)}</span></div>
          )}
          <div
            className="flex justify-between rounded-md px-3 py-2 font-semibold text-white"
            style={{ backgroundColor: invoice.org.brandColor }}
          >
            <span>Balance Due</span><span>{cents(invoice.balanceCents)}</span>
          </div>
        </div>

        {paySucceeded ? (
          <div className="mt-8 flex flex-col items-center gap-2 rounded-md border border-green-200 bg-green-50 py-6 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
            <p className="text-sm font-medium text-green-800">Payment submitted</p>
            <p className="text-xs text-green-700">The balance above will update in a few seconds once it&apos;s confirmed.</p>
          </div>
        ) : canPay ? (
          !payOpen ? (
            <button
              onClick={handleStartPay}
              disabled={creatingIntent}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {creatingIntent && <Loader2 className="h-4 w-4 animate-spin" />}
              Pay Now
            </button>
          ) : intent ? (
            <div className="mt-8 border-t pt-6">
              {intent.feeCents > 0 && (
                <p className="mb-3 text-xs text-slate-500">
                  Includes a {cents(intent.feeCents)} card processing fee.
                </p>
              )}
              <Elements stripe={stripeJs} options={{ clientSecret: intent.clientSecret }}>
                <PayForm totalChargeCents={intent.totalChargeCents} onSuccess={() => setPaySucceeded(true)} />
              </Elements>
            </div>
          ) : null
        ) : null}
      </div>
    </div>
  );
}
