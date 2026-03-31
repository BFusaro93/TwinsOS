"use client";

import { useState } from "react";
import { Check, Loader2, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUpdatePurchaseOrderStatus } from "@/lib/hooks/use-purchase-orders";
import type { PurchaseOrder } from "@/types";

interface CheckRowProps {
  label: string;
  checked: boolean;
  sublabel?: string;
  pending?: boolean;
  onToggle: () => void;
}

function CheckRow({ label, checked, sublabel, pending, onToggle }: CheckRowProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      className="flex w-full items-center gap-3 rounded-md px-1 py-1.5 text-left hover:bg-slate-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <div className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
        checked ? "border-brand-500 bg-brand-500 text-white" : "border-slate-200 bg-white text-slate-300"
      )}>
        {pending
          ? <Loader2 className="h-3 w-3 animate-spin" />
          : checked
            ? <Check className="h-3 w-3" />
            : <Minus className="h-3 w-3" />
        }
      </div>
      <div>
        <span className={cn("text-sm", checked ? "text-slate-900" : "text-slate-400")}>{label}</span>
        {sublabel && <span className="ml-2 text-xs text-slate-400">{sublabel}</span>}
      </div>
    </button>
  );
}

export function POPaymentTracking({ po }: { po: PurchaseOrder }) {
  const { mutate: updateStatus, isPending } = useUpdatePurchaseOrderStatus();

  // Local optimistic state seeded from the PO prop
  const [submittedToAP, setSubmittedToAP] = useState(po.paymentSubmittedToAP);
  const [remitted, setRemitted]           = useState(po.paymentRemitted);
  const [bookedInQB, setBookedInQB]       = useState(po.paymentBookedInQB);

  const paymentTypeLabel =
    po.paymentType === "check"       ? "Check"
    : po.paymentType === "ach"       ? "ACH"
    : po.paymentType === "credit_card" ? "Credit Card"
    : null;

  function toggle(
    field: "paymentSubmittedToAP" | "paymentRemitted" | "paymentBookedInQB",
    current: boolean,
    setter: (v: boolean) => void,
  ) {
    const next = !current;
    setter(next);
    updateStatus(
      {
        id: po.id,
        status: po.status,
        [field === "paymentSubmittedToAP" ? "paymentSubmittedToAP"
          : field === "paymentRemitted"   ? "paymentRemitted"
          : "paymentBookedInQB"]: next,
      },
      {
        // Roll back local state if the mutation fails
        onError: () => setter(current),
      }
    );
  }

  return (
    <div className="rounded-md border p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Payment Tracking
      </p>
      <CheckRow
        label="Submitted to AP"
        checked={submittedToAP}
        pending={isPending}
        onToggle={() => toggle("paymentSubmittedToAP", submittedToAP, setSubmittedToAP)}
      />
      <CheckRow
        label="Payment Remitted"
        checked={remitted}
        sublabel={paymentTypeLabel ?? undefined}
        pending={isPending}
        onToggle={() => toggle("paymentRemitted", remitted, setRemitted)}
      />
      <CheckRow
        label="Booked in QuickBooks"
        checked={bookedInQB}
        pending={isPending}
        onToggle={() => toggle("paymentBookedInQB", bookedInQB, setBookedInQB)}
      />
    </div>
  );
}
