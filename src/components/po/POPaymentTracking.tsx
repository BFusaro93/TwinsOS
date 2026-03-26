"use client";

import { useState } from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PurchaseOrder } from "@/types";

interface CheckItemProps {
  label: string;
  checked: boolean;
  sublabel?: string;
  onToggle: () => void;
}

function CheckRow({ label, checked, sublabel, onToggle }: CheckItemProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-3 rounded-md px-1 py-1.5 text-left hover:bg-slate-50 transition-colors"
    >
      <div className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
        checked ? "border-brand-500 bg-brand-500 text-white" : "border-slate-200 bg-white text-slate-300"
      )}>
        {checked ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      </div>
      <div>
        <span className={cn("text-sm", checked ? "text-slate-900" : "text-slate-400")}>{label}</span>
        {sublabel && <span className="ml-2 text-xs text-slate-400">{sublabel}</span>}
      </div>
    </button>
  );
}

export function POPaymentTracking({ po }: { po: PurchaseOrder }) {
  const [submittedToAP, setSubmittedToAP] = useState(po.paymentSubmittedToAP);
  const [remitted, setRemitted] = useState(po.paymentRemitted);
  const [bookedInQB, setBookedInQB] = useState(po.paymentBookedInQB);

  const paymentTypeLabel = po.paymentType === "check" ? "Check"
    : po.paymentType === "ach" ? "ACH"
    : po.paymentType === "credit_card" ? "Credit Card"
    : null;

  return (
    <div className="rounded-md border p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Payment Tracking</p>
      <CheckRow label="Submitted to AP" checked={submittedToAP} onToggle={() => setSubmittedToAP(v => !v)} />
      <CheckRow label="Payment Remitted" checked={remitted} sublabel={paymentTypeLabel ?? undefined} onToggle={() => setRemitted(v => !v)} />
      <CheckRow label="Booked in QuickBooks" checked={bookedInQB} onToggle={() => setBookedInQB(v => !v)} />
    </div>
  );
}
