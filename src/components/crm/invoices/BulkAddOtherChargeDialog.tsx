"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { useOtherCharges, useAddOtherChargeToInvoices } from "@/lib/hooks/use-other-charges";
import { formatPercentBps, parsePercentToBps } from "@/lib/invoices/other-charges";

interface Props {
  invoiceIds: string[];
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

/** Adds one Other Charge to every selected invoice (locked / void ones are skipped). */
export function BulkAddOtherChargeDialog({ invoiceIds, open, onClose, onDone }: Props) {
  const { data: charges = [] } = useOtherCharges();
  const { mutateAsync: addCharge, isPending } = useAddOtherChargeToInvoices();
  const [chargeId, setChargeId] = useState("");
  const [amountStr, setAmountStr] = useState("");

  const active = charges.filter((c) => c.isActive);
  const charge = active.find((c) => c.id === chargeId);

  const isPercent = charge?.chargeType === "percent";
  const percentBps = isPercent ? parsePercentToBps(amountStr) : null;
  const valid = isPercent
    ? percentBps !== null && percentBps > 0
    : parseFloat(amountStr) > 0;

  function pick(id: string) {
    setChargeId(id);
    const c = active.find((x) => x.id === id);
    if (!c) { setAmountStr(""); return; }
    setAmountStr(
      c.chargeType === "percent"
        ? (c.percentBps ? String(c.percentBps / 100) : "")
        : (c.amountCents / 100).toFixed(2)
    );
  }

  function close() {
    setChargeId("");
    setAmountStr("");
    onClose();
  }

  async function handleAdd() {
    if (!charge) return;
    let priced: { amountCents: number; percentBps: number };
    if (isPercent) {
      if (percentBps === null || percentBps <= 0) { toast.error("Enter a percent greater than 0"); return; }
      priced = { amountCents: 0, percentBps };
    } else {
      const amount = parseFloat(amountStr);
      if (!Number.isFinite(amount) || amount <= 0) { toast.error("Enter an amount greater than $0"); return; }
      priced = { amountCents: Math.round(amount * 100), percentBps: 0 };
    }
    try {
      const res = await addCharge({
        invoiceIds,
        charge: {
          name: charge.name,
          description: charge.description,
          chargeType: charge.chargeType,
          ...priced,
          isTaxable: charge.isTaxable,
        },
      });
      if (res.added > 0) {
        toast.success(`${charge.name} added to ${res.added} invoice${res.added === 1 ? "" : "s"}`);
      }
      if (res.skipped.length > 0) {
        const reasons = Array.from(new Set(res.skipped.map((s) => s.reason))).join(", ");
        toast.error(`${res.skipped.length} skipped — ${reasons}`);
      }
      onDone();
      close();
    } catch {
      toast.error("Failed to add charge");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Other Charge to {invoiceIds.length} invoice{invoiceIds.length === 1 ? "" : "s"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Charge</Label>
            <Select value={chargeId} onValueChange={pick}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select a charge…" /></SelectTrigger>
              <SelectContent>
                {active.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} — {c.chargeType === "percent" ? `${formatPercentBps(c.percentBps)} of invoice` : formatCurrency(c.amountCents)}
                  </SelectItem>
                ))}
                {active.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-slate-400 dark:text-neutral-500">
                    No active charges. Add some in Settings → Accounting → Other Charges.
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
          {charge && (
            <div className="space-y-1.5">
              <Label className="text-xs">{isPercent ? "Percent of each invoice (%)" : "Amount per invoice ($)"}</Label>
              <Input type="number" min="0" step="0.01" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} className="h-9 text-sm" />
              <p className="text-[11px] text-slate-400 dark:text-neutral-500">
                {isPercent ? "Worked out on each invoice's service lines (other charges and the invoice discount aren't counted). " : ""}
                {charge.isTaxable ? "Taxable. " : ""}Locked and void invoices are skipped.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={close}>Cancel</Button>
          <Button size="sm" onClick={() => void handleAdd()} disabled={!charge || isPending || !valid}>
            {isPending ? "Adding…" : "Add Charge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
