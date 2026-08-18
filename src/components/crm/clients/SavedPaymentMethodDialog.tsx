"use client";

import { useState } from "react";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Loader2, CreditCard, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useCreateSetupIntent, useSaveSetupIntent, type CreateSetupIntentResult } from "@/lib/hooks/use-saved-payment-methods";
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
      <Button onClick={handleConfirm} disabled={submitting || !stripe} className="w-full">
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save Payment Method
      </Button>
    </div>
  );
}

export function SavedPaymentMethodDialog({
  clientId,
  open,
  onOpenChange,
  onSaved,
}: {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [paymentMethod, setPaymentMethod] = useState<"card" | "us_bank_account">("card");
  const [enableAutopay, setEnableAutopay] = useState(true);
  const [intent, setIntent] = useState<CreateSetupIntentResult | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const createSetupIntent = useCreateSetupIntent();
  const saveSetupIntent = useSaveSetupIntent();

  function handleOpenChange(next: boolean) {
    if (!next) {
      setPaymentMethod("card");
      setEnableAutopay(true);
      setIntent(null);
      setSucceeded(false);
    }
    onOpenChange(next);
  }

  async function handleContinue() {
    try {
      const result = await createSetupIntent.mutateAsync({ clientId, paymentMethod });
      setIntent(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start payment method setup");
    }
  }

  async function handleSetupSuccess(setupIntentId: string) {
    try {
      await saveSetupIntent.mutateAsync({ clientId, setupIntentId, enableAutopay });
      setSucceeded(true);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save payment method");
    }
  }

  const stripeJs = intent ? getScopedStripeJs(intent.connectedAccountId) : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-brand-500" />
            Save Payment Method
          </DialogTitle>
        </DialogHeader>

        {succeeded ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Check className="h-8 w-8 text-green-500" />
            <p className="text-sm font-medium text-slate-900">Payment method saved</p>
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
              <p className="text-sm text-slate-600">
                Save a card or bank account on file for this client to charge on demand, or enroll in autopay below.
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
              <div className="flex items-center gap-2">
                <Checkbox
                  id="enable-autopay"
                  checked={enableAutopay}
                  onCheckedChange={(v) => setEnableAutopay(v === true)}
                />
                <Label htmlFor="enable-autopay" className="text-sm font-normal text-slate-600">
                  Automatically charge this method (autopay)
                </Label>
              </div>
              {!enableAutopay && (
                <p className="text-xs text-slate-400">
                  This method will be kept on file for staff to charge manually, but won&apos;t appear in the To Charge queues.
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleContinue} disabled={createSetupIntent.isPending}>
                  {createSetupIntent.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Continue
                </Button>
              </DialogFooter>
            </div>
          )
        ) : (
          <Elements stripe={stripeJs} options={{ clientSecret: intent.clientSecret }}>
            <SetupForm onSuccess={handleSetupSuccess} />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}
