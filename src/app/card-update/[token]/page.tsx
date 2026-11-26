"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { CheckCircle2, Loader2 } from "lucide-react";
import { getScopedStripeJs, hasPublishableKey } from "@/lib/stripe/client";

interface CardUpdateInfo {
  state: "valid" | "expired" | "used";
  clientFirstName: string | null;
  org: { name: string; brandColor: string; logoUrl: string | null };
  cardPaymentsAvailable: boolean;
  achAvailable: boolean;
  autopayAllowed: boolean;
  currentMethod: string | null;
  autopayOn: boolean;
}

interface SetupResult {
  clientSecret: string;
  connectedAccountId: string;
  livemode?: boolean;
}

type Method = "card" | "us_bank_account";

function SaveForm({
  token,
  method,
  autopayAllowed,
  brandColor,
  onDone,
}: {
  token: string;
  method: Method;
  autopayAllowed: boolean;
  brandColor: string;
  onDone: (result: { summary: string | null; autopayEnabled: boolean }) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [autopay, setAutopay] = useState(autopayAllowed);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const { error: confirmError, setupIntent } = await stripe.confirmSetup({ elements, redirect: "if_required" });
    if (confirmError || !setupIntent) {
      setSubmitting(false);
      setError(confirmError?.message ?? method === "card" ? "We couldn't verify your card. Please try again." : "We couldn't verify your bank account. Please try again.");
      return;
    }
    try {
      const res = await fetch(`/api/public/card-update/${token}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupIntentId: setupIntent.id, autopay: autopayAllowed && autopay }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "We couldn't save your payment method. Please try again.");
      onDone({ summary: data.summary ?? null, autopayEnabled: data.autopayEnabled === true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't save your payment method. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PaymentElement />
      {autopayAllowed && (
        <label className="flex cursor-pointer items-start gap-3 rounded-md border bg-slate-50 p-3 text-sm text-slate-700">
          <input type="checkbox" checked={autopay} onChange={(e) => setAutopay(e.target.checked)} className="mt-0.5 h-4 w-4" />
          <span>
            <span className="font-medium text-slate-900">Turn on AutoPay.</span>{" "}
            {method === "card"
              ? "Charge this card automatically when invoices are issued"
              : "Debit this bank account automatically when invoices are issued"}{" "}
            — the same as AutoPay in the client portal. You can turn this off any time in the portal.
          </span>
        </label>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={handleSave}
        disabled={submitting || !stripe}
        style={{ backgroundColor: brandColor }}
        className="flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {method === "card" ? "Save card" : "Save bank account"}
      </button>
    </div>
  );
}

export default function CardUpdatePage() {
  const params = useParams();
  const token = params.token as string;

  const [info, setInfo] = useState<CardUpdateInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [setup, setSetup] = useState<SetupResult | null>(null);
  const [method, setMethod] = useState<Method>("card");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [done, setDone] = useState<{ summary: string | null; autopayEnabled: boolean } | null>(null);

  useEffect(() => {
    fetch(`/api/public/card-update/${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "This link isn't valid.");
        setInfo(data);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "This link isn't valid."));
  }, [token]);

  const start = useCallback(async (chosen: Method) => {
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch(`/api/public/card-update/${token}/setup-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod: chosen }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "We couldn't start the card form. Please try again.");
      setSetup(data);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "We couldn't start the card form. Please try again.");
    } finally {
      setStarting(false);
    }
  }, [token]);

  // Open the card form straight away for a usable link — one tap fewer for the customer.
  useEffect(() => {
    if (info?.state === "valid" && info.cardPaymentsAvailable && hasPublishableKey() && !setup && !starting && !startError && !done) {
      void start(method);
    }
  }, [info, setup, starting, startError, done, start, method]);

  function chooseMethod(next: Method) {
    if (next === method || starting) return;
    setMethod(next);
    setSetup(null);
    setStartError(null);
  }

  if (loadError) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-6 text-center">
        <p className="max-w-sm text-sm text-slate-500">{loadError} If you need a new link, please contact us.</p>
      </div>
    );
  }
  if (!info) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const stripeJs = setup ? getScopedStripeJs(setup.connectedAccountId, setup.livemode) : null;
  const unavailable = !info.cardPaymentsAvailable || !hasPublishableKey();

  let body: React.ReactNode;
  if (done) {
    body = (
      <div className="flex flex-col items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-8 text-center">
        <CheckCircle2 className="h-9 w-9 text-green-600" />
        <p className="text-base font-semibold text-green-900">Your payment method has been updated</p>
        {done.summary && <p className="text-sm text-green-800">{done.summary} is now on file.</p>}
        <p className="text-sm text-green-800">
          {done.autopayEnabled ? "AutoPay is on — we'll charge this payment method when invoices are issued." : "AutoPay is off. You can turn it on any time in the client portal."}
        </p>
        <p className="mt-1 text-xs text-green-700">Thank you! You can close this page.</p>
      </div>
    );
  } else if (info.state === "used") {
    body = (
      <p className="rounded-md border bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
        This link has already been used to update the card on file. If something still needs changing, please contact {info.org.name || "us"} for a new link.
      </p>
    );
  } else if (info.state === "expired") {
    body = (
      <p className="rounded-md border bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
        This link has expired. Please contact {info.org.name || "us"} and we&apos;ll send you a new one.
      </p>
    );
  } else if (unavailable) {
    body = (
      <p className="rounded-md border bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
        Online card updates aren&apos;t available right now. Please contact {info.org.name || "us"} to update your card.
      </p>
    );
  } else if (setup && stripeJs) {
    body = (
      <Elements stripe={stripeJs} options={{ clientSecret: setup.clientSecret }}>
        <SaveForm key={method} token={token} method={method} autopayAllowed={info.autopayAllowed} brandColor={info.org.brandColor} onDone={setDone} />
      </Elements>
    );
  } else if (startError) {
    body = (
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-red-600">{startError}</p>
        <button onClick={() => void start(method)} className="rounded-md border px-4 py-2 text-sm font-medium text-slate-700">
          Try again
        </button>
      </div>
    );
  } else {
    body = (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-md rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          {info.org.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={info.org.logoUrl} alt="" className="h-10 w-auto max-w-[120px] object-contain" />
          )}
          <h1 className="text-lg font-semibold text-slate-900">{info.org.name}</h1>
        </div>
        {!done && info.state === "valid" && (
          <div className="mb-5">
            <p className="text-base font-semibold text-slate-900">
              {info.clientFirstName ? `Hi ${info.clientFirstName}, update` : "Update"} your {info.achAvailable ? "payment method" : "card"} on file
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {info.achAvailable ? "Choose a card or a bank account below." : "Enter your new card below."} Your details go straight to our payment processor, Stripe — we never see or store the full card or account number.
            </p>
            {info.currentMethod && <p className="mt-2 text-xs text-slate-400">Currently on file: {info.currentMethod}. Saving replaces it.</p>}
            {info.achAvailable && !unavailable && (
              <div className="mt-4 grid grid-cols-2 gap-2" role="tablist" aria-label="Payment method">
                {([["card", "Card"], ["us_bank_account", "Bank account"]] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={method === value}
                    onClick={() => chooseMethod(value)}
                    style={method === value ? { borderColor: info.org.brandColor, color: info.org.brandColor } : undefined}
                    className={`rounded-md border px-3 py-2 text-sm font-medium ${method === value ? "bg-white" : "bg-slate-50 text-slate-500"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {body}
      </div>
    </div>
  );
}
