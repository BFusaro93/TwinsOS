"use client";

import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useApplyOrgTaxRateToClients, useClientsAtTaxRate } from "@/lib/hooks/use-apply-org-tax-rate";

interface ApplyTaxRateToClientsDialogProps {
  /** The company rate BEFORE the save, in percent; null closes the dialog. */
  previousPercent: number | null;
  /** The company rate that was just saved, in percent. */
  newPercent: number;
  onClose: () => void;
}

function fmt(percent: number): string {
  return `${Number(percent.toFixed(3))}%`;
}

/**
 * Shown after the company sales-tax rate is saved (Settings → Organization and
 * Landscapt Settings → Accounting). Each client keeps its own rate, stamped when
 * it was created, so clients added before the rate was set stay at the old rate
 * (often 0%) unless the user opts in here. Tax-exempt clients are never offered.
 */
export function ApplyTaxRateToClientsDialog({ previousPercent, newPercent, onClose }: ApplyTaxRateToClientsDialogProps) {
  const open = previousPercent != null;
  const fromBps = previousPercent != null ? Math.round(previousPercent * 100) : null;
  const { data, isLoading, isError } = useClientsAtTaxRate(fromBps, open);
  const apply = useApplyOrgTaxRateToClients();
  const n = data?.count ?? 0;

  async function handleApply() {
    if (fromBps == null) return;
    try {
      const updated = await apply.mutateAsync(fromBps);
      toast.success(`Updated ${updated} client${updated === 1 ? "" : "s"} to ${fmt(newPercent)}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update clients");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tax rate saved</DialogTitle>
          <DialogDescription>New clients will start at {fmt(newPercent)}.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Checking existing clients…</p>
        ) : isError ? (
          <p className="text-sm text-slate-600 dark:text-neutral-400">
            Existing clients keep their own tax rate. To change one, edit the client&apos;s tax rate on their profile.
          </p>
        ) : n === 0 ? (
          <p className="text-sm text-slate-600 dark:text-neutral-400">
            No clients are still at the old rate ({fmt(previousPercent ?? 0)}), so nothing else needs updating.
          </p>
        ) : (
          <p className="text-sm text-slate-600 dark:text-neutral-400">
            {n} client{n === 1 ? " is" : "s are"} still at the old rate ({fmt(previousPercent ?? 0)}). Also apply{" "}
            {fmt(newPercent)} to {n === 1 ? "it" : "them"}? Their future estimates and invoices (including automatic
            invoices) will use the new rate. Tax-exempt clients and invoices already created don&apos;t change.
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={apply.isPending}>
            {n === 0 || isLoading || isError ? "Done" : "Only new clients"}
          </Button>
          {n > 0 && !isError && (
            <Button onClick={handleApply} disabled={apply.isPending}>
              {apply.isPending ? "Updating…" : `Apply to ${n} client${n === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
