"use client";

import { useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Loader2, CreditCard, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { useCreateCrmPaymentIntent, type CreatePaymentIntentResult } from "@/lib/hooks/use-crm-card-payments";

function hasPublishableKey(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}

// The PaymentIntent is created directly on the org's connected Stripe account
// (a "direct charge"), so Stripe.js must be initialized scoped to that same
// account — a platform-scoped instance can't find/confirm it. Cached per
// account id so re-opening the dialog for the same org doesn't reload Stripe.js.
const scopedStripeJsCache = new Map<string, Promise<StripeJs | null>>();
function getScopedStripeJs(connectedAccountId: string): Promise<StripeJs | null> | null {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return null;
  let cached = scopedStripeJsCache.get(connectedAccountId);
  if (!cached) {
    cached = loadStripe(key, { stripeAccount: connectedAccountId });
    scopedStripeJsCache.set(connectedAccountId, cached);
  }
  return cached;
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
      <Button onClick={handleConfirm} disabled={submitting || !stripe} className="w-full">
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Charge {formatCurrency(totalChargeCents)}
      </Button>
    </div>
  );
}

export function ChargeCardDialog({
  invoiceId,
  balanceCents,
  open,
  onOpenChange,
  onCharged,
}: {
  invoiceId: string;
  balanceCents: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCharged: () => void;
}) {
  const [waiveFee, setWaiveFee] = useState(false);
  const [intent, setIntent] = useState<CreatePaymentIntentResult | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const createIntent = useCreateCrmPaymentIntent();

  function handleOpenChange(next: boolean) {
    if (!next) {
      setWaiveFee(false);
      setIntent(null);
      setSucceeded(false);
    }
    onOpenChange(next);
  }

  async function handleContinue() {
    try {
      const result = await createIntent.mutateAsync({ invoiceId, waiveFee });
      setIntent(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start card payment");
    }
  }

  function handleSuccess() {
    setSucceeded(true);
    onCharged();
  }

  const stripeJs = intent ? getScopedStripeJs(intent.connectedAccountId) : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-brand-500" />
            Charge Card
          </DialogTitle>
        </DialogHeader>

        {succeeded ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Check className="h-8 w-8 text-green-500" />
            <p className="text-sm font-medium text-slate-900">Payment submitted</p>
            <p className="text-xs text-slate-500">
              The invoice balance will update in a few seconds once it&apos;s confirmed.
            </p>
            <Button size="sm" className="mt-2" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : !intent ? (
          !hasPublishableKey() ? (
            <p className="py-4 text-sm text-slate-500">
              Card payments aren&apos;t configured yet. Add the Stripe environment variables to enable this.
            </p>
          ) : (
            <div className="flex flex-col gap-4 py-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Balance Due</span>
                <span className="font-semibold tabular-nums">{formatCurrency(balanceCents)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="waive-fee" checked={waiveFee} onCheckedChange={(v) => setWaiveFee(v === true)} />
                <Label htmlFor="waive-fee" className="text-sm font-normal text-slate-600">
                  Waive credit card processing fee
                </Label>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleContinue} disabled={createIntent.isPending}>
                  {createIntent.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Continue
                </Button>
              </DialogFooter>
            </div>
          )
        ) : (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Balance Due</span>
                <span className="tabular-nums">{formatCurrency(intent.balanceCents)}</span>
              </div>
              {intent.feeCents > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Processing Fee</span>
                  <span className="tabular-nums">{formatCurrency(intent.feeCents)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>Total Charge</span>
                <span className="tabular-nums">{formatCurrency(intent.totalChargeCents)}</span>
              </div>
            </div>
            <Elements stripe={stripeJs} options={{ clientSecret: intent.clientSecret }}>
              <PayForm totalChargeCents={intent.totalChargeCents} onSuccess={handleSuccess} />
            </Elements>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
