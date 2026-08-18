"use client";

import { useState } from "react";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Loader2, CreditCard, Check, X } from "lucide-react";
import { useCreatePortalPaymentIntent, type CreatePaymentIntentResult } from "@/lib/hooks/use-portal-payments";
import { hasPublishableKey, getScopedStripeJs } from "@/lib/stripe/client";

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
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
        className="w-full h-10 rounded-lg bg-brand-500 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Pay {fmt(totalChargeCents)}
      </button>
    </div>
  );
}

export function PayInvoiceDialog({
  invoiceId,
  balanceCents,
  open,
  onClose,
  onPaid,
}: {
  invoiceId: string;
  balanceCents: number;
  open: boolean;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [paymentMethod, setPaymentMethod] = useState<"card" | "us_bank_account">("card");
  const [intent, setIntent] = useState<CreatePaymentIntentResult | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createIntent = useCreatePortalPaymentIntent();
  const stripeJs = intent ? getScopedStripeJs(intent.connectedAccountId) : null;

  if (!open) return null;

  function handleClose() {
    setPaymentMethod("card");
    setIntent(null);
    setSucceeded(false);
    setError(null);
    onClose();
  }

  async function start() {
    setError(null);
    try {
      const result = await createIntent.mutateAsync({ invoiceId, paymentMethod });
      setIntent(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start payment");
    }
  }

  function handleSuccess() {
    setSucceeded(true);
    onPaid();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <CreditCard className="h-4 w-4 text-brand-500" />
            Pay Invoice
          </h3>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {succeeded ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Check className="h-8 w-8 text-green-500" />
            <p className="text-sm font-medium text-slate-900">Payment submitted</p>
            <p className="text-xs text-slate-500">Your balance will update in a few seconds.</p>
            <button onClick={handleClose} className="mt-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white">
              Done
            </button>
          </div>
        ) : !intent ? (
          !hasPublishableKey() ? (
            <p className="py-4 text-sm text-slate-500">Online payments aren&apos;t available yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Amount Due</span>
                <span className="font-semibold tabular-nums">{fmt(balanceCents)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("card")}
                  className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    paymentMethod === "card"
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Card
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("us_bank_account")}
                  className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    paymentMethod === "us_bank_account"
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Bank Transfer (ACH)
                </button>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                onClick={start}
                disabled={createIntent.isPending}
                className="w-full h-10 rounded-lg bg-brand-500 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {createIntent.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Continue
              </button>
            </div>
          )
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Amount Due</span>
                <span className="tabular-nums">{fmt(intent.balanceCents)}</span>
              </div>
              {intent.feeCents > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Processing Fee</span>
                  <span className="tabular-nums">{fmt(intent.feeCents)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{fmt(intent.totalChargeCents)}</span>
              </div>
            </div>
            <Elements stripe={stripeJs} options={{ clientSecret: intent.clientSecret }}>
              <PayForm totalChargeCents={intent.totalChargeCents} onSuccess={handleSuccess} />
            </Elements>
          </div>
        )}
      </div>
    </div>
  );
}
