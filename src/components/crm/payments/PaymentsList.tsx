"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { usePayments, useRecordPayment, useUpdatePayment, useRefundPayment, useInvoices, usePaymentAllocations, useBulkImportPayments } from "@/lib/hooks/use-invoices";
import { useClients } from "@/lib/hooks/use-clients";
import { useConnectStatus } from "@/lib/hooks/use-crm-card-payments";
import { useOrgSettings } from "@/lib/hooks/use-org-settings";
import {
  useCreateMultiPaymentIntent,
  useChargeMultiSaved,
  type CreateMultiPaymentIntentResult,
} from "@/lib/hooks/use-multi-invoice-charge";
import { hasPublishableKey, getScopedStripeJs } from "@/lib/stripe/client";
import { ImportExportMenu } from "@/components/shared/ImportExportMenu";
import { exportCSV } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { Plus, RotateCcw, Search, X, Loader2, Check } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ClientCombobox } from "@/components/shared/ClientCombobox";
import { ColumnChooser } from "@/components/shared/ColumnChooser";
import type { ColumnDef } from "@/components/shared/ColumnChooser";

const PAYMENT_COLUMNS: ColumnDef[] = [
  { key: "date",      label: "Date",           locked: true },
  { key: "reference", label: "Reference #" },
  { key: "client",    label: "Client" },
  { key: "method",    label: "Method" },
  { key: "invoice",   label: "Invoice" },
  { key: "amount",    label: "Amount" },
];
import { toast } from "sonner";
import type { CRMInvoice } from "@/types/crm-invoices";

// ── constants ─────────────────────────────────────────────────────────────────

export const PAYMENT_METHODS = [
  "ACH/E-Check",
  "AR Write-off",
  "AutoPay",
  "Cash",
  "Check",
  "Credit Card- AmEx",
  "Credit Card- Discover",
  "Credit Card- MasterCard",
  "Credit Card- Visa",
  "Other",
] as const;

// Not a real payment method the client used — set automatically when issuing
// an account credit (see AddPaymentDialog's "credit" mode) since crm_payments.method
// is required but a credit isn't received via check/card/etc.
const ACCOUNT_CREDIT_METHOD = "Account Credit";

// ── add payment dialog ────────────────────────────────────────────────────────

interface InvoiceAllocation {
  invoiceId: string;
  invoiceNumber: number;
  balanceCents: number;
  totalCents: number;
  invoiceDate: string;
  payInFull: boolean;
  amountCents: number;
}

import type { CRMPayment } from "@/types/crm-invoices";

// ── multi-invoice charge form (fresh card/bank entry) ───────────────────────

function ChargeMultiForm({ totalChargeCents, onSuccess }: { totalChargeCents: number; onSuccess: () => void }) {
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
      <PaymentElement options={{ wallets: { link: "never" } }} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button onClick={handleConfirm} disabled={submitting || !stripe} className="w-full">
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Charge {formatCurrency(totalChargeCents)}
      </Button>
    </div>
  );
}

export function AddPaymentDialog({
  open,
  onOpenChange,
  defaultClientId,
  payment,
  mode = "payment",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultClientId?: string;
  payment?: CRMPayment | null;
  /** "credit" opens this dialog purpose-built for issuing an account credit —
   *  no payment method/check# (a credit isn't received via either), forced
   *  is_credit, distinct copy. Editing an existing credit auto-detects this
   *  from payment.isCredit regardless of what's passed here. */
  mode?: "payment" | "credit";
}) {
  const isEdit = !!payment;
  const isCreditMode = mode === "credit" || (isEdit && !!payment?.isCredit);
  const queryClient = useQueryClient();
  const { data: clients } = useClients();
  const { mutateAsync: record, isPending: isRecording } = useRecordPayment();
  const { mutateAsync: update, isPending: isUpdating } = useUpdatePayment();
  const isPending = isRecording || isUpdating;

  // ── charge card/bank now, instead of recording an already-received payment ──
  const { data: connectStatus } = useConnectStatus();
  const { data: orgSettings } = useOrgSettings();
  const achEnabled = orgSettings?.achPaymentsEnabled ?? false;
  const canCharge = !isEdit && !isCreditMode && hasPublishableKey() && (connectStatus?.chargesEnabled ?? false);
  const [chargeMode, setChargeMode] = useState(false);
  const [chargePaymentMethod, setChargePaymentMethod] = useState<"card" | "us_bank_account">("card");
  const [chargeIntent, setChargeIntent] = useState<CreateMultiPaymentIntentResult | null>(null);
  const [chargeSucceeded, setChargeSucceeded] = useState(false);
  const createMultiIntent = useCreateMultiPaymentIntent();
  const chargeMultiSaved = useChargeMultiSaved();

  function todayLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const [clientId, setClientId] = useState(payment?.clientId ?? defaultClientId ?? "");
  const [paymentDate, setPaymentDate] = useState(payment?.paymentDate ?? todayLocal());
  const [amount, setAmount] = useState(payment ? (payment.amountCents / 100).toFixed(2) : "");
  const [checkNumber, setCheckNumber] = useState(payment?.reference ?? "");
  const [method, setMethod] = useState<string>(payment?.method ?? (mode === "credit" ? ACCOUNT_CREDIT_METHOD : "Check"));
  const [memo, setMemo] = useState(payment?.memo ?? "");
  const [isPrepayment, setIsPrepayment] = useState(payment?.isPrepayment ?? false);
  const [autoAllocate, setAutoAllocate] = useState(false);
  const [allocations, setAllocations] = useState<InvoiceAllocation[]>([]);

  // sync state when payment prop changes (edit mode re-open)
  useEffect(() => {
    if (payment) {
      setClientId(payment.clientId);
      setPaymentDate(payment.paymentDate);
      setAmount((payment.amountCents / 100).toFixed(2));
      setCheckNumber(payment.reference ?? "");
      setMethod(payment.method);
      setMemo(payment.memo ?? "");
      setIsPrepayment(payment.isPrepayment);
    }
  }, [payment?.id]);

  const { data: invoices } = useInvoices(clientId || undefined);
  const { data: existingAllocations } = usePaymentAllocations(isEdit ? payment?.id : undefined);

  // In create mode: only show unpaid invoices.
  // In edit mode: show all non-voided invoices (paid or unpaid, but must have totalCents > 0)
  // so that any invoice previously allocated to this payment remains visible and editable.
  const allocationInvoices = useMemo(() => {
    const all = invoices ?? [];
    if (isEdit) return all.filter((inv) => inv.status !== "void" && inv.totalCents > 0);
    return all.filter((inv) => inv.status !== "paid" && inv.status !== "void" && inv.totalCents > 0);
  }, [invoices, isEdit]);

  const openInvoices = useMemo(
    () => (invoices ?? []).filter((inv) => inv.status !== "paid" && inv.status !== "void"),
    [invoices]
  );

  // derive account balance — only meaningful when a client is selected
  const accountBalanceCents = clientId
    ? openInvoices.reduce((s, inv) => s + (inv.balanceCents ?? inv.totalCents), 0)
    : 0;

  const amountCents = Math.round(parseFloat(amount || "0") * 100);
  const amountApplied = allocations.reduce((s, a) => s + a.amountCents, 0);
  const unusedCents = Math.max(0, amountCents - amountApplied);

  // when client changes, build allocations list
  function handleClientChange(id: string) {
    setClientId(id);
    setAllocations([]);
  }

  // initialise allocations when invoice list loads
  useMemo(() => {
    if (!clientId) return;
    // In edit mode, restore the exact split recorded when the payment was made.
    // Payments recorded before per-invoice allocations were tracked have no
    // rows here — for those (only) we fall back to the single invoice the
    // payment was linked to, never to guessing based on other invoices'
    // paid status (that produced wrong allocations for clients with more
    // than one paid invoice).
    const hasExactAllocations = isEdit && (existingAllocations?.length ?? 0) > 0;
    const exactByInvoiceId = new Map((existingAllocations ?? []).map((a) => [a.invoice_id, a.amount_cents]));

    setAllocations(
      allocationInvoices.map((inv) => {
        let prefilledCents = 0;
        if (isEdit && payment) {
          if (hasExactAllocations) {
            prefilledCents = exactByInvoiceId.get(inv.id) ?? 0;
          } else if (inv.id === payment.invoiceId) {
            // legacy payment predating crm_payment_allocations — only the
            // single linked invoice is known, not the rest of any split
            prefilledCents = Math.min(payment.amountCents, inv.totalCents);
          }
        }
        const balCents = inv.balanceCents ?? inv.totalCents;
        return {
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          balanceCents: balCents,
          totalCents: inv.totalCents,
          invoiceDate: inv.invoiceDate,
          payInFull: prefilledCents > 0 && prefilledCents >= balCents,
          amountCents: prefilledCents,
        };
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allocationInvoices.map(i => `${i.id}:${i.balanceCents}`).join(","), clientId, existingAllocations]);

  function runAllocation() {
    let remaining = amountCents;
    setAllocations((prev) =>
      prev.map((a) => {
        const apply = Math.min(remaining, a.balanceCents);
        remaining -= apply;
        return { ...a, amountCents: apply, payInFull: apply >= a.balanceCents };
      })
    );
  }

  function handleAutoAllocate(checked: boolean) {
    setAutoAllocate(checked);
    if (checked) runAllocation();
  }

  function handleAllocateClick() {
    runAllocation();
  }

  function togglePayInFull(idx: number, checked: boolean) {
    setAllocations((prev) =>
      prev.map((a, i) =>
        i === idx
          ? { ...a, payInFull: checked, amountCents: checked ? a.balanceCents : 0 }
          : a
      )
    );
  }

  function setAllocationAmount(idx: number, val: string) {
    const cents = Math.round(parseFloat(val || "0") * 100);
    setAllocations((prev) =>
      prev.map((a, i) =>
        i === idx ? { ...a, amountCents: cents, payInFull: cents >= a.balanceCents } : a
      )
    );
  }

  function resetForm() {
    setClientId(defaultClientId ?? "");
    setPaymentDate(todayLocal());
    setAmount("");
    setCheckNumber("");
    setMethod(mode === "credit" ? ACCOUNT_CREDIT_METHOD : "Check");
    setMemo("");
    setIsPrepayment(false);
    setAutoAllocate(false);
    setAllocations([]);
    setChargeMode(false);
    setChargePaymentMethod("card");
    setChargeIntent(null);
    setChargeSucceeded(false);
  }

  const chargeAllocations = allocations
    .filter((a) => a.amountCents > 0)
    .map((a) => ({ invoiceId: a.invoiceId, amountCents: a.amountCents }));
  const selectedClientForCharge = (clients ?? []).find((c) => c.id === clientId);
  const chargeSavedMethodType = selectedClientForCharge?.savedPaymentMethodType ?? null;
  const chargeSavedMethodSummary = selectedClientForCharge?.savedPaymentMethodSummary ?? null;

  async function handleChargeSaved() {
    if (chargeAllocations.length === 0) {
      toast.error("Allocate the amount to at least one invoice first");
      return;
    }
    try {
      await chargeMultiSaved.mutateAsync({ clientId, allocations: chargeAllocations });
      setChargeSucceeded(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to charge saved payment method");
    }
  }

  async function handleChargeNew() {
    if (chargeAllocations.length === 0) {
      toast.error("Allocate the amount to at least one invoice first");
      return;
    }
    try {
      const result = await createMultiIntent.mutateAsync({
        clientId,
        allocations: chargeAllocations,
        paymentMethod: chargePaymentMethod,
      });
      setChargeIntent(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start payment");
    }
  }

  function handleChargeSuccess() {
    setChargeSucceeded(true);
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["crm-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["crm-payments"] });
      queryClient.invalidateQueries({ queryKey: ["clients", clientId] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    };
    invalidate();
    // The card charge is confirmed client-side, but the invoice/balance
    // update itself happens async in the Stripe Connect webhook
    // (payment_intent.succeeded) — re-invalidate after it's had time to land
    // so the balance doesn't stay stuck at its pre-payment value.
    setTimeout(invalidate, 4000);
  }

  async function submit(andNew: boolean) {
    if (!clientId || !amount) {
      toast.error("Client and amount are required");
      return;
    }
    if (isCreditMode && !memo.trim()) {
      toast.error("A reason is required for an account credit");
      return;
    }
    // "Pay in full" checkboxes and manually-typed per-row amounts don't cap
    // themselves against the entered payment amount (only the separate
    // auto-allocate button does) — block here rather than let the sum of
    // allocations exceed what was actually received.
    if (amountApplied > amountCents) {
      toast.error(`Allocated amount (${formatCurrency(amountApplied)}) exceeds the payment amount (${formatCurrency(amountCents)})`);
      return;
    }
    const activeAllocations = allocations
      .filter((a) => a.amountCents > 0)
      .map((a) => ({ invoiceId: a.invoiceId, amountCents: a.amountCents }));
    try {
      if (isEdit && payment) {
        await update({
          id: payment.id,
          clientId,
          amountCents,
          paymentDate,
          method,
          reference: checkNumber || undefined,
          memo: memo || undefined,
          allocations: activeAllocations,
        });
        toast.success(isCreditMode ? "Credit updated" : "Payment updated");
        onOpenChange(false);
      } else {
        await record({
          clientId,
          amountCents,
          paymentDate,
          method,
          reference: checkNumber || undefined,
          memo: memo || undefined,
          isPrepayment,
          isCredit: isCreditMode,
          allocations: activeAllocations,
        });
        toast.success(isCreditMode ? "Credit issued" : "Payment recorded");
        if (andNew) {
          resetForm();
        } else {
          onOpenChange(false);
          resetForm();
        }
      }
    } catch {
      toast.error(isEdit ? "Failed to update" : isCreditMode ? "Failed to issue credit" : "Failed to record payment");
    }
  }

  const selectedClient = (clients ?? []).find((c) => c.id === clientId);

  const chargeStripeJs = chargeIntent ? getScopedStripeJs(chargeIntent.connectedAccountId) : null;

  if (chargeSucceeded) {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Check className="h-8 w-8 text-green-500" />
            <p className="text-sm font-medium text-slate-900">Payment submitted</p>
            <p className="text-xs text-slate-500">
              Invoice balances will update in a few seconds once it&apos;s confirmed.
            </p>
            <Button size="sm" className="mt-2" onClick={() => { resetForm(); onOpenChange(false); }}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (chargeIntent) {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Charge Payment Method</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Amount</span>
                <span className="tabular-nums">{formatCurrency(chargeIntent.balanceCents)}</span>
              </div>
              {chargeIntent.feeCents > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Processing Fee</span>
                  <span className="tabular-nums">{formatCurrency(chargeIntent.feeCents)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>Total Charge</span>
                <span className="tabular-nums">{formatCurrency(chargeIntent.totalChargeCents)}</span>
              </div>
            </div>
            <Elements key={chargeIntent.clientSecret} stripe={chargeStripeJs} options={{ clientSecret: chargeIntent.clientSecret }}>
              <ChargeMultiForm totalChargeCents={chargeIntent.totalChargeCents} onSuccess={handleChargeSuccess} />
            </Elements>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-lg font-semibold flex items-center justify-between">
            <span>{isCreditMode ? (isEdit ? "Edit Account Credit" : "Issue Account Credit") : (isEdit ? "Edit Payment" : chargeMode ? "Charge Card / Bank" : "Add Payment")}</span>
            {canCharge && (
              <button
                type="button"
                onClick={() => setChargeMode((v) => !v)}
                className="text-xs font-normal text-brand-600 hover:underline"
              >
                {chargeMode ? "Record a payment instead" : "Charge a card/bank instead"}
              </button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-0">
          {/* Left: form */}
          <div className="flex-1 p-6 space-y-4">
            {/* Payment Details section header */}
            <div className="rounded bg-[#4a4a4a] px-3 py-1.5 text-sm font-semibold text-white">
              {isCreditMode ? "Credit Details" : "Payment Details"}
            </div>

            <div className="grid grid-cols-[120px_1fr] items-center gap-x-4 gap-y-3">
              <Label className="text-right text-sm font-medium">Client</Label>
              {isEdit && selectedClient ? (
                <div className="text-sm text-slate-700">
                  {selectedClient.displayName}
                  {selectedClient.billingAddress && (
                    <span className="ml-1 text-slate-400">: {selectedClient.billingAddress}</span>
                  )}
                </div>
              ) : (
                <ClientCombobox
                  value={clientId}
                  onValueChange={handleClientChange}
                  clients={clients ?? []}
                  noneLabel="Search clients..."
                />
              )}

              <Label className="text-right text-sm font-medium">Date</Label>
              <Input
                type="date"
                className="h-8 w-40 text-sm"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />

              <Label className="text-right text-sm font-medium">Amount</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className="h-8 w-32 text-sm"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={handleAllocateClick}
                  disabled={!clientId || !amount}
                >
                  Allocate Payment
                </Button>
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="auto-allocate"
                    checked={autoAllocate}
                    onCheckedChange={(c) => handleAutoAllocate(!!c)}
                    disabled={!clientId || !amount}
                  />
                  <Label htmlFor="auto-allocate" className="text-xs text-slate-600 cursor-pointer">
                    Auto Allocate
                  </Label>
                </div>
              </div>

              {!isCreditMode && !chargeMode && (
                <>
                  <Label className="text-right text-sm font-medium">Check #</Label>
                  <Input
                    className="h-8 w-40 text-sm"
                    value={checkNumber}
                    onChange={(e) => setCheckNumber(e.target.value)}
                    placeholder=""
                  />

                  <Label className="text-right text-sm font-medium">Payment Method</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger className="h-8 w-56 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}

              {chargeMode && (
                <>
                  <Label className="text-right text-sm font-medium">Method</Label>
                  <div className="flex flex-col gap-2">
                    <div className={`grid gap-2 ${achEnabled ? "grid-cols-2" : "grid-cols-1"} w-72`}>
                      <button
                        type="button"
                        onClick={() => setChargePaymentMethod("card")}
                        className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                          chargePaymentMethod === "card"
                            ? "border-brand-500 bg-brand-50 text-brand-700"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        Card
                      </button>
                      {achEnabled && (
                        <button
                          type="button"
                          onClick={() => setChargePaymentMethod("us_bank_account")}
                          className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                            chargePaymentMethod === "us_bank_account"
                              ? "border-brand-500 bg-brand-50 text-brand-700"
                              : "border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          Bank Account (ACH)
                        </button>
                      )}
                    </div>
                    {chargeSavedMethodType && (
                      <p className="text-xs text-slate-500">Saved on file: {chargeSavedMethodSummary}</p>
                    )}
                  </div>
                </>
              )}

              {!chargeMode && (
                <>
                  <Label className="text-right text-sm font-medium">{isCreditMode ? "Reason" : "Memo"}</Label>
                  <Input
                    className="h-8 text-sm"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder={isCreditMode ? "e.g. Billing correction, goodwill credit…" : undefined}
                  />
                </>
              )}

              {!isCreditMode && !chargeMode && (
                <>
                  <Label htmlFor="prepayment-check" className="text-right text-sm font-medium cursor-pointer whitespace-nowrap">Is a pre-payment?</Label>
                  <Checkbox
                    id="prepayment-check"
                    checked={isPrepayment}
                    onCheckedChange={(c) => setIsPrepayment(!!c)}
                  />
                </>
              )}
            </div>
          </div>

          {/* Right: balance summary */}
          <div className="w-52 shrink-0 bg-[#5a5a5a] p-5 text-sm text-white rounded-tr-lg">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-300">Amount Applied:</span>
                <span className="font-medium">{formatCurrency(amountApplied)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">Unused Amount:</span>
                <span className="font-medium">{formatCurrency(unusedCents)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-500 pt-2">
                <span className="text-slate-300">Account Balance:</span>
                <span className="font-semibold">{formatCurrency(accountBalanceCents)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Unpaid invoices section */}
        {clientId && (
          <div className="border-t">
            <div className="mx-6 mt-4 mb-1 rounded bg-[#4a4a4a] px-3 py-1.5 text-sm font-semibold text-white flex items-center justify-between">
              <span>({allocationInvoices.length} of {allocationInvoices.length} in 1 page)</span>
              <span className="text-xs text-slate-300">Page Size: 30</span>
            </div>

            <div className="mx-6 mb-4 overflow-auto rounded border bg-white">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#4a4a4a] text-white">
                    <th className="w-28 px-3 py-2 text-left font-medium">Unpaid Invoice</th>
                    <th className="w-12 px-3 py-2 text-center font-medium">Pay in full</th>
                    <th className="w-24 px-3 py-2 text-left font-medium">Amount</th>
                    <th className="px-3 py-2 text-right font-medium">Balance</th>
                    <th className="px-3 py-2 text-right font-medium">Date</th>
                    <th className="px-3 py-2 text-left font-medium">Job Details</th>
                  </tr>
                </thead>
                <tbody>
                  {allocationInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-slate-400">
                        No invoices
                      </td>
                    </tr>
                  ) : (
                    allocations.map((a, idx) => (
                      <tr key={a.invoiceId} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium text-slate-700">
                          #{a.invoiceNumber}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Checkbox
                            checked={a.payInFull}
                            onCheckedChange={(c) => togglePayInFull(idx, !!c)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            className="h-6 w-20 text-xs px-1.5"
                            value={a.amountCents > 0 ? (a.amountCents / 100).toFixed(2) : ""}
                            onChange={(e) => setAllocationAmount(idx, e.target.value)}
                            placeholder="0.00"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {formatCurrency(a.balanceCents)}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-500">
                          {new Date(a.invoiceDate + "T12:00:00").toLocaleDateString("en-US", {
                            month: "2-digit", day: "2-digit", year: "numeric",
                          })}
                        </td>
                        <td className="px-3 py-2 text-slate-500">
                          {selectedClient?.displayName ?? ""}
                          {selectedClient?.billingAddress && (
                            <div>{selectedClient.billingAddress}</div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-center gap-3 border-t bg-slate-50 px-6 py-4">
          {chargeMode ? (
            <>
              {chargeSavedMethodType && (
                <Button
                  className="bg-[#4a4a4a] hover:bg-[#3a3a3a] text-white px-6"
                  onClick={() => void handleChargeSaved()}
                  disabled={chargeMultiSaved.isPending || chargeAllocations.length === 0}
                >
                  {chargeMultiSaved.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Charge Saved {chargeAllocations.length > 0 ? formatCurrency(amountApplied) : ""}
                </Button>
              )}
              <Button
                className="bg-[#4a4a4a] hover:bg-[#3a3a3a] text-white px-6"
                onClick={() => void handleChargeNew()}
                disabled={createMultiIntent.isPending || chargeAllocations.length === 0}
              >
                {createMultiIntent.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {chargeSavedMethodType ? "Charge New Method" : `Charge ${chargeAllocations.length > 0 ? formatCurrency(amountApplied) : ""}`}
              </Button>
            </>
          ) : (
            <>
              {!isEdit && (
                <Button
                  className="bg-[#4a4a4a] hover:bg-[#3a3a3a] text-white px-6"
                  onClick={() => submit(true)}
                  disabled={isPending}
                >
                  Save &amp; New
                </Button>
              )}
              <Button
                className="bg-[#4a4a4a] hover:bg-[#3a3a3a] text-white px-6"
                onClick={() => submit(false)}
                disabled={isPending}
              >
                {isPending ? "Saving…" : "Save & Close"}
              </Button>
            </>
          )}
          <span className="text-slate-400 text-sm">or</span>
          <button
            className="text-brand-600 text-sm hover:underline"
            onClick={() => { resetForm(); onOpenChange(false); }}
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── filter bar ────────────────────────────────────────────────────────────────

type FilterField = "reference" | "date" | "client" | "address" | "method";

function FilterBar({
  activeFilter,
  onFilter,
  filterValue,
  onFilterValue,
}: {
  activeFilter: FilterField;
  onFilter: (f: FilterField) => void;
  filterValue: string;
  onFilterValue: (v: string) => void;
}) {
  const fields: { key: FilterField; label: string }[] = [
    { key: "reference", label: "Reference #" },
    { key: "date", label: "Date" },
    { key: "client", label: "Client" },
    { key: "address", label: "Address" },
    { key: "method", label: "Payment Method" },
  ];

  return (
    <div className="flex items-center gap-1 text-xs text-slate-600">
      {fields.map((f) => (
        <button
          key={f.key}
          onClick={() => { onFilter(f.key); onFilterValue(""); }}
          className={`px-2 py-0.5 rounded transition-colors whitespace-nowrap ${
            activeFilter === f.key
              ? "bg-brand-100 text-brand-700 font-medium"
              : "hover:bg-slate-100"
          }`}
        >
          {f.label}
        </button>
      ))}
      {activeFilter && (
        <Input
          className="ml-2 h-6 w-48 text-xs"
          placeholder={`Filter by ${fields.find((f) => f.key === activeFilter)?.label}…`}
          value={filterValue}
          onChange={(e) => onFilterValue(e.target.value)}
          autoFocus
        />
      )}
    </div>
  );
}

// ── main list ─────────────────────────────────────────────────────────────────

type Tab = "last30" | "deleted";

interface Props {
  clientId?: string;
}

const PAYMENT_TEMPLATE_COLUMNS = ["clientName", "amount", "paymentDate", "method", "reference", "memo", "invoiceNumber"];

export function PaymentsList({ clientId }: Props) {
  const { data: payments, isLoading, refetch } = usePayments(clientId);
  const { mutateAsync: bulkImportPayments } = useBulkImportPayments();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>("last30");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [editPayment, setEditPayment] = useState<CRMPayment | null>(null);
  const [refundPayment, setRefundPayment] = useState<CRMPayment | null>(null);

  // Auto-open the Add Payment dialog when navigated here with ?new=1
  useEffect(() => {
    if (searchParams.get("new") === "1") setDialogOpen(true);
  }, [searchParams]);
  const [activeFilter, setActiveFilter] = useState<FilterField | null>(null);
  const [filterValue, setFilterValue] = useState("");
  const [search, setSearch] = useState("");
  const [visibleKeys, setVisibleKeys] = useState<string[]>(PAYMENT_COLUMNS.map((c) => c.key));
  const [viewPayment, setViewPayment] = useState<CRMPayment | null>(null);

  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const filtered = useMemo(() => {
    let list = payments ?? [];

    if (activeTab === "last30") {
      list = list.filter((p) => new Date(p.paymentDate) >= thirtyDaysAgo);
    } else {
      list = list.filter((p) => p.deletedAt != null);
    }

    if (activeFilter && filterValue) {
      const v = filterValue.toLowerCase();
      list = list.filter((p) => {
        switch (activeFilter) {
          case "reference": return (p.reference ?? "").toLowerCase().includes(v);
          case "date": return p.paymentDate.includes(v);
          case "client": return (p.clientName ?? "").toLowerCase().includes(v);
          case "address": return (p.clientAddress ?? "").toLowerCase().includes(v);
          case "method": return p.method.toLowerCase().includes(v);
          default: return true;
        }
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        (p.clientName ?? "").toLowerCase().includes(q) ||
        (p.reference ?? "").toLowerCase().includes(q) ||
        p.method.toLowerCase().includes(q)
      );
    }

    return list;
  }, [payments, activeTab, activeFilter, filterValue, search]);

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Page header */}
      {!clientId && (
        <PageHeader
          title="Payments"
          description={!isLoading ? `${(payments ?? []).length} payments` : undefined}
          action={
            <div className="flex items-center gap-2">
              <ImportExportMenu
                entityLabel="Payments"
                templateColumns={PAYMENT_TEMPLATE_COLUMNS}
                templateFilename="payments-template.csv"
                requiredColumns={["clientName", "amount"]}
                onExport={() =>
                  exportCSV(
                    (payments ?? []).map((p) => ({
                      clientName: p.clientName ?? "",
                      amount: (p.amountCents / 100).toFixed(2),
                      paymentDate: p.paymentDate,
                      method: p.method,
                      reference: p.reference ?? "",
                      memo: p.memo ?? "",
                      invoiceNumber: p.invoiceNumber != null ? String(p.invoiceNumber) : "",
                    })),
                    "payments-export.csv"
                  )
                }
                onImport={async (rows) => {
                  const { created, skipped } = await bulkImportPayments(rows);
                  if (skipped > 0) {
                    toast.warning(`Imported ${created} payment${created !== 1 ? "s" : ""}. ${skipped} row${skipped !== 1 ? "s" : ""} skipped (unmatched client or missing amount).`);
                  } else {
                    toast.success(`Successfully imported ${created} payment${created !== 1 ? "s" : ""}.`);
                  }
                }}
              />
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Add Payment
              </Button>
            </div>
          }
        />
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-1.5 border-b bg-white px-4 py-2">
        <span className="shrink-0 text-xs text-slate-500 font-medium mr-1">Select a Filter:</span>
        <div className="flex items-center gap-1 overflow-x-auto">
          {(["reference", "date", "client", "address", "method"] as FilterField[]).map((key) => {
            const label = { reference: "Reference #", date: "Date", client: "Client", address: "Address", method: "Payment Method" }[key];
            return (
              <button
                key={key}
                onClick={() => { setActiveFilter(key); setFilterValue(""); }}
                className={`px-2 py-0.5 rounded text-xs transition-colors whitespace-nowrap ${
                  activeFilter === key ? "bg-brand-100 text-brand-700 font-medium" : "hover:bg-slate-100 text-slate-600"
                }`}
              >
                {label}
              </button>
            );
          })}
          {activeFilter && (
            <>
              <Input
                className="ml-2 h-6 w-48 text-xs"
                placeholder={`Filter by ${({ reference: "Reference #", date: "Date", client: "Client", address: "Address", method: "Payment Method" }[activeFilter])}…`}
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                autoFocus
              />
              <button onClick={() => { setActiveFilter(null); setFilterValue(""); }} className="text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
        {clientId && (
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCreditDialogOpen(true)}>
              <Plus className="mr-1 h-3 w-3" /> Issue Credit
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1 h-3 w-3" /> Record Payment
            </Button>
          </div>
        )}
      </div>

      {/* Dark actions bar */}
      <div className="flex items-center justify-between bg-[#4a4a4a] px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex h-7 w-7 items-center justify-center rounded border border-[#6a6a6a] bg-[#5a5a5a] text-white hover:bg-[#6a6a6a]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <div className="ml-2 flex items-center gap-1">
            {(["last30", "deleted"] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-white text-slate-800"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {tab === "last30" ? "Last 30 Days" : "Deleted"}
              </button>
            ))}
          </div>
          <div className="relative ml-2">
            <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-7 w-44 pl-7 text-xs bg-white border-slate-200 focus-visible:ring-0"
            />
          </div>
        </div>
        <ColumnChooser
          columns={clientId ? PAYMENT_COLUMNS.filter((c) => c.key !== "client") : PAYMENT_COLUMNS}
          visibleKeys={visibleKeys}
          onVisibleKeysChange={setVisibleKeys}
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 border-b z-10">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-3 py-3">Date</th>
              {!clientId && (
                <th className="min-w-[200px] px-3 py-3">Client</th>
              )}
              <th className="px-3 py-3 text-right">Amount</th>
              <th className="px-3 py-3 text-right">Unused Amt</th>
              <th className="px-3 py-3 text-right">Refunded Amt</th>
              <th className="px-3 py-3">Reference #</th>
              <th className="px-3 py-3">Payment Method</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: clientId ? 6 : 7 }).map((__, j) => (
                    <td key={j} className="px-3 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={clientId ? 6 : 7} className="py-16 text-center text-sm text-slate-400">
                  No payments recorded yet
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="group cursor-pointer border-b hover:bg-slate-50" onClick={() => setViewPayment(p)}>
                  <td className="px-3 py-2.5 text-slate-700 font-medium">
                    {new Date(p.paymentDate + "T12:00:00").toLocaleDateString("en-US", {
                      month: "numeric", day: "numeric", year: "numeric",
                    })}
                  </td>
                  {!clientId && (
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Link href={`/crm/clients/${p.clientId}`} className="font-medium text-brand-600 hover:underline">
                        {p.clientName ?? "—"}
                      </Link>
                      {p.clientAddress && (
                        <div className="text-xs text-slate-400">{p.clientAddress}</div>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2.5 text-right font-medium text-slate-800">
                    {formatCurrency(p.amountCents)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600">
                    {formatCurrency(p.unusedAmountCents)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600">
                    {formatCurrency(p.refundedAmountCents)}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 text-xs">
                    {p.reference ?? ""}
                  </td>
                  <td className="px-3 py-2.5 text-slate-700 text-xs">
                    {p.method}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="rounded px-2 py-0.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600"
                        onClick={(e) => { e.stopPropagation(); setEditPayment(p); }}
                      >
                        Edit
                      </button>
                      <button
                        className="rounded px-2 py-0.5 text-xs bg-red-50 hover:bg-red-100 text-red-600"
                        onClick={(e) => { e.stopPropagation(); setRefundPayment(p); }}
                      >
                        Refund
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AddPaymentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultClientId={clientId}
      />

      <AddPaymentDialog
        open={creditDialogOpen}
        onOpenChange={setCreditDialogOpen}
        defaultClientId={clientId}
        mode="credit"
      />

      <AddPaymentDialog
        open={!!editPayment}
        onOpenChange={(o) => { if (!o) setEditPayment(null); }}
        payment={editPayment}
      />

      <RefundDialog
        payment={refundPayment}
        onClose={() => setRefundPayment(null)}
      />

      {/* Payment detail dialog */}
      <Dialog open={!!viewPayment} onOpenChange={(o) => !o && setViewPayment(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment Detail</DialogTitle>
          </DialogHeader>
          {viewPayment && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-1 border-b">
                <span className="text-slate-500">Date</span>
                <span className="font-medium">{new Date(viewPayment.paymentDate + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
              </div>
              {viewPayment.clientName && (
                <div className="flex justify-between py-1 border-b">
                  <span className="text-slate-500">Client</span>
                  <span className="font-medium">{viewPayment.clientName}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b">
                <span className="text-slate-500">Amount</span>
                <span className="font-semibold text-slate-900">{formatCurrency(viewPayment.amountCents)}</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-slate-500">Method</span>
                <span>{viewPayment.method}</span>
              </div>
              {viewPayment.reference && (
                <div className="flex justify-between py-1 border-b">
                  <span className="text-slate-500">Reference #</span>
                  <span className="font-mono text-xs">{viewPayment.reference}</span>
                </div>
              )}
              {viewPayment.unusedAmountCents > 0 && (
                <div className="flex justify-between py-1 border-b">
                  <span className="text-slate-500">Unused Amount</span>
                  <span className="text-yellow-600">{formatCurrency(viewPayment.unusedAmountCents)}</span>
                </div>
              )}
              {viewPayment.refundedAmountCents > 0 && (
                <div className="flex justify-between py-1 border-b">
                  <span className="text-slate-500">Refunded</span>
                  <span className="text-red-500">{formatCurrency(viewPayment.refundedAmountCents)}</span>
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => { setEditPayment(viewPayment); setViewPayment(null); }}>
              Edit
            </Button>
            <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => { setRefundPayment(viewPayment); setViewPayment(null); }}>
              Refund
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── RefundDialog ───────────────────────────────────────────────────────────────

export function RefundDialog({ payment, onClose }: { payment: CRMPayment | null; onClose: () => void }) {
  const { mutateAsync: refund, isPending } = useRefundPayment();
  const [refundAmount, setRefundAmount] = useState("");

  useEffect(() => {
    if (payment) setRefundAmount((payment.amountCents / 100).toFixed(2));
  }, [payment?.id]);

  if (!payment) return null;

  const maxRefund = payment.amountCents - payment.refundedAmountCents;

  async function submit() {
    if (!payment) return;
    const cents = Math.round(parseFloat(refundAmount || "0") * 100);
    if (cents <= 0) { toast.error("Enter a refund amount"); return; }
    if (cents > maxRefund) { toast.error(`Max refundable: ${formatCurrency(maxRefund)}`); return; }
    try {
      await refund({ id: payment.id, clientId: payment.clientId, refundAmountCents: cents, invoiceId: payment.invoiceId });
      toast.success("Refund recorded");
      onClose();
    } catch { toast.error("Failed to record refund"); }
  }

  return (
    <Dialog open={!!payment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Issue Refund</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1 text-sm">
          <div className="rounded bg-slate-50 p-3 space-y-1">
            <div className="flex justify-between text-slate-500">
              <span>Original payment</span>
              <span className="font-medium text-slate-800">{formatCurrency(payment.amountCents)}</span>
            </div>
            {payment.refundedAmountCents > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Previously refunded</span>
                <span className="text-red-500">({formatCurrency(payment.refundedAmountCents)})</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1">
              <span className="text-slate-500">Max refundable</span>
              <span className="font-semibold">{formatCurrency(maxRefund)}</span>
            </div>
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Refund Amount</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max={(maxRefund / 100).toFixed(2)}
              className="h-8 text-sm"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={submit} disabled={isPending}>
            {isPending ? "Processing…" : "Issue Refund"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
