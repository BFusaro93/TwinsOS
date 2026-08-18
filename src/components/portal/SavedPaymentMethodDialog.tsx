"use client";

import { useState } from "react";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Loader2, CreditCard, Check, X } from "lucide-react";
import {
  useCreatePortalSetupIntent,
  useSavePortalSetupIntent,
  type CreateSetupIntentResult,
} from "@/lib/hooks/use-portal-saved-payment-method";
import { hasPublishableKey, getScopedStripeJs } from "@/lib/stripe/client";

function SetupForm({ onSuccess }: { onSuccess: (setupIntentId: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
    });
    setSubmitting(false);
    if (confirmError) {
      setError(confirmError.message ?? "Failed to save payment method");
      return;
    }
    if (setupIntent?.status === "succeeded") {
      onSuccess(setupIntent.id);
    } else {
      setError("Payment method setup was not completed");
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
        Save Payment Method
      </button>
    </div>
  );
}

export function SavedPaymentMethodDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (summary: string) => void;
}) {
  const [paymentMethod, setPaymentMethod] = useState<"card" | "us_bank_account">("card");
  const [intent, setIntent] = useState<CreateSetupIntentResult | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createSetupIntent = useCreatePortalSetupIntent();
  const saveSetupIntent = useSavePortalSetupIntent();

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
      const result = await createSetupIntent.mutateAsync({ paymentMethod });
      setIntent(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start payment method setup");
    }
  }

  async function handleSetupSuccess(setupIntentId: string) {
    try {
      const result = await saveSetupIntent.mutateAsync({ setupIntentId });
      setSucceeded(true);
      onSaved(result.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save payment method");
    }
  }

  const stripeJs = intent ? getScopedStripeJs(intent.connectedAccountId) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <CreditCard className="h-4 w-4 text-brand-500" />
            Payment Method
          </h3>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {succeeded ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Check className="h-8 w-8 text-green-500" />
            <p className="text-sm font-medium text-slate-900">Payment method saved</p>
            <button onClick={handleClose} className="mt-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white">
              Done
            </button>
          </div>
        ) : !intent ? (
          !hasPublishableKey() ? (
            <p className="py-4 text-sm text-slate-500">Online payments aren&apos;t available yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-slate-600">
                Save a card or bank account on file so your invoices can be paid automatically.
              </p>
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
                  Bank Account (ACH)
                </button>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                onClick={start}
                disabled={createSetupIntent.isPending}
                className="w-full h-10 rounded-lg bg-brand-500 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {createSetupIntent.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Continue
              </button>
            </div>
          )
        ) : (
          <Elements stripe={stripeJs} options={{ clientSecret: intent.clientSecret }}>
            <SetupForm onSuccess={handleSetupSuccess} />
          </Elements>
        )}
      </div>
    </div>
  );
}
