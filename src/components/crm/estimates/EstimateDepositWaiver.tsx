"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";
import { isEstimateAccepted } from "@/lib/estimates/deposit-due";
import { useSetEstimateDepositWaiver } from "@/lib/hooks/use-estimates";
import type { Estimate } from "@/types/crm-estimates";

/**
 * "Waive deposit" on an accepted estimate whose required deposit was never
 * paid (deposits are optional at acceptance, so a skipped one stays due). A
 * waived deposit is never shown to the client as due and the proposal link
 * won't take it; who waived it and when is recorded on the estimate
 * (crm_set_estimate_deposit_waiver). Undo puts it back to due.
 */
export function EstimateDepositWaiver({ estimate, canWaive }: { estimate: Estimate; canWaive: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const setWaiver = useSetEstimateDepositWaiver();

  if (estimate.depositWaivedAt) {
    const when = new Date(estimate.depositWaivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:text-neutral-300"
          title={estimate.depositWaivedReason ? `Reason: ${estimate.depositWaivedReason}` : "The client is no longer asked for this deposit."}
        >
          Deposit waived {when}
          {estimate.depositWaivedByName ? ` by ${estimate.depositWaivedByName}` : ""}
        </span>
        {canWaive && (
          <button
            type="button"
            className="text-[10px] font-medium text-slate-500 underline-offset-2 hover:underline dark:text-neutral-400"
            disabled={setWaiver.isPending}
            onClick={async () => {
              try {
                await setWaiver.mutateAsync({ estimateId: estimate.id, waived: false });
                toast.success("Deposit is due again");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Couldn't undo the waiver");
              }
            }}
          >
            Undo
          </button>
        )}
      </span>
    );
  }

  const owed =
    isEstimateAccepted({ portalAcceptedAt: estimate.portalAcceptedAt, stage: estimate.stage }) &&
    estimate.depositRequiredCents > 0 &&
    estimate.depositCollectedCents === 0 &&
    (estimate.depositPendingCents ?? 0) === 0;
  if (!owed || !canWaive) return null;

  async function waive() {
    try {
      await setWaiver.mutateAsync({ estimateId: estimate.id, waived: true, reason: reason.trim() || null });
      toast.success("Deposit waived");
      setOpen(false);
      setReason("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't waive the deposit");
    }
  }

  return (
    <>
      <button
        type="button"
        className="self-start text-[10px] font-medium text-slate-500 underline-offset-2 hover:underline dark:text-neutral-400"
        onClick={() => setOpen(true)}
        title="Stop asking the client for this deposit"
      >
        Waive deposit
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Waive the deposit?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 dark:text-neutral-400">
            The client is no longer asked for the {formatCurrency(Math.min(estimate.depositRequiredCents, estimate.totalCents > 0 ? estimate.totalCents : estimate.depositRequiredCents))}{" "}
            deposit — it stops showing as due on their proposal link and in the client portal, and the link no longer
            takes it. Nothing is charged or credited. You can undo this.
          </p>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional) — e.g. long-time client, paid on the first invoice"
            className="min-h-[60px] text-sm"
            maxLength={500}
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={waive} disabled={setWaiver.isPending}>
              {setWaiver.isPending ? "Waiving…" : "Waive deposit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
