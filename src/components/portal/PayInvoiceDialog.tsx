"use client";

import { useState } from "react";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Loader2, CreditCard, Check, X } from "lucide-react";
import { useCreatePortalPaymentIntent, type CreatePaymentIntentResult } from "@/lib/hooks/use-portal-payments";
import { hasPublishableKey, getScopedStripeJs } from "@/lib/stripe/client";
import { STRIPE_ELEMENT_MIN_HEIGHT } from "@/lib/stripe/dialog-guard";

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

/** What a bank debit that needs the customer to verify their account hands back. */
type VerifyInfo = { url: string | null };

function PayForm({
  totalChargeCents,
  onSuccess,
  onNeedsVerification,
}: {
  totalChargeCents: number;
  onSuccess: () => void;
  onNeedsVerification: (info: VerifyInfo) => void;
}) {
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
    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing" || paymentIntent?.status === "requires_capture") {
      onSuccess();
    } else if (
      paymentIntent?.status === "requires_action" &&
      paymentIntent.next_action?.type === "verify_with_microdeposits"
    ) {
      // A bank account typed in by hand (rather than linked through the bank's
      // own login) is verified with two tiny deposits first. That is a normal
      // part of ACH, not a failure: Stripe emails the customer a link, and the
      // payment goes through once they confirm the amounts.
      onNeedsVerification({ url: paymentIntent.next_action.verify_with_microdeposits?.hosted_verification_url ?? null });
    } else {
      setError("Payment was not completed");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Fixed floor so Stripe's accordion can't resize the dialog under the pointer (F-07). */}
      <div className={STRIPE_ELEMENT_MIN_HEIGHT}>
        <PaymentElement />
      </div>
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

/** What the dialog is collecting: payment of one or more invoices, or a prepayment. */
export type PayDialogTarget =
  | { kind: "invoices"; invoiceIds: string[]; balanceCents: number }
  | { kind: "prepayment"; accountId?: string };

const PREPAY_MIN_CENTS = 100;
const PREPAY_MAX_CENTS = 2_500_000;

export function PayInvoiceDialog({
  target,
  open,
  onClose,
  onPaid,
}: {
  target: PayDialogTarget;
  open: boolean;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [paymentMethod, setPaymentMethod] = useState<"card" | "us_bank_account">("card");
  const [intent, setIntent] = useState<CreatePaymentIntentResult | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const [verify, setVerify] = useState<VerifyInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prepayInput, setPrepayInput] = useState("");
  // One per opened dialog so a second prepayment of the same amount is a new charge (see the route).
  const [nonce] = useState(() => crypto.randomUUID());
  const createIntent = useCreatePortalPaymentIntent();
  const stripeJs = intent ? getScopedStripeJs(intent.connectedAccountId, intent.livemode) : null;
  const isPrepay = target.kind === "prepayment";
  const invoiceCount = target.kind === "invoices" ? target.invoiceIds.length : 0;
  const prepayCents = Math.round(Number.parseFloat(prepayInput.replace(/[^0-9.]/g, "")) * 100);
  const prepayValid = Number.isFinite(prepayCents) && prepayCents >= PREPAY_MIN_CENTS && prepayCents <= PREPAY_MAX_CENTS;

  if (!open) return null;

  function handleClose() {
    setPaymentMethod("card");
    setIntent(null);
    setSucceeded(false);
    setVerify(null);
    setError(null);
    setPrepayInput("");
    onClose();
  }

  async function start() {
    setError(null);
    try {
      const result = await createIntent.mutateAsync(
        target.kind === "prepayment"
          ? { prepaymentCents: prepayCents, nonce, accountId: target.accountId, paymentMethod }
          : { invoiceIds: target.invoiceIds, paymentMethod }
      );
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
            {isPrepay ? "Make a Prepayment" : invoiceCount > 1 ? `Pay ${invoiceCount} Invoices` : "Pay Invoice"}
          </h3>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {verify ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Check className="h-8 w-8 text-amber-500" />
            <p className="text-sm font-medium text-slate-900">One more step: verify your bank account</p>
            <p className="text-xs text-slate-500">
              We&apos;ve started your bank transfer. Because the account was entered by hand, your bank will make two small
              deposits in 1–2 business days (or you&apos;ll get an email from Stripe with a link). Confirm the amounts and the
              payment will go through — nothing is charged until you do.
            </p>
            {verify.url && (
              <a
                href={verify.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 rounded-lg border border-brand-500 px-4 py-2 text-sm font-medium text-brand-700"
              >
                Verify my bank account
              </a>
            )}
            <button onClick={handleClose} className="mt-1 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white">
              Done
            </button>
          </div>
        ) : succeeded ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Check className="h-8 w-8 text-green-500" />
            <p className="text-sm font-medium text-slate-900">Payment submitted</p>
            <p className="text-xs text-slate-500">
              {isPrepay
                ? "Your prepayment will appear on your account in a few seconds. It is held as credit and is applied to your next invoice — it doesn't change any invoice you already have."
                : "Your balance will update in a few seconds."}
            </p>
            <button onClick={handleClose} className="mt-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white">
              Done
            </button>
          </div>
        ) : !intent ? (
          !hasPublishableKey() ? (
            <p className="py-4 text-sm text-slate-500">Online payments aren&apos;t available yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {target.kind === "invoices" ? (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Amount Due{invoiceCount > 1 ? ` (${invoiceCount} invoices)` : ""}</span>
                  <span className="font-semibold tabular-nums">{fmt(target.balanceCents)}</span>
                </div>
              ) : (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-500">Amount to prepay</span>
                  <div className="flex items-center rounded-md border border-slate-200 px-3 focus-within:ring-2 focus-within:ring-brand-500">
                    <span className="text-slate-400">$</span>
                    <input
                      inputMode="decimal"
                      value={prepayInput}
                      onChange={(e) => setPrepayInput(e.target.value)}
                      placeholder="0.00"
                      className="h-9 flex-1 bg-transparent px-2 text-sm tabular-nums outline-none"
                    />
                  </div>
                  <span className="text-xs text-slate-400">Held as credit on your account and applied to your next invoice.</span>
                </label>
              )}
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
                disabled={createIntent.isPending || (isPrepay && !prepayValid)}
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
                <span className="text-slate-500">{isPrepay ? "Prepayment" : "Amount Due"}</span>
                <span className="tabular-nums">{fmt(intent.balanceCents)}</span>
              </div>
              {intent.feeCents > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Processing Fee <span className="text-xs">(credit cards only)</span></span>
                  <span className="tabular-nums">{fmt(intent.feeCents)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{fmt(intent.totalChargeCents)}</span>
              </div>
            </div>
            <Elements key={intent.clientSecret} stripe={stripeJs} options={{ clientSecret: intent.clientSecret }}>
              <PayForm totalChargeCents={intent.totalChargeCents} onSuccess={handleSuccess} onNeedsVerification={setVerify} />
            </Elements>
          </div>
        )}
      </div>
    </div>
  );
}
