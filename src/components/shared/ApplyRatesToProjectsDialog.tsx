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
import {
  useApplyRatesToOpenProjects,
  useOpenProjectsWithDifferentRates,
} from "@/lib/hooks/use-apply-labor-rates";
import { formatCurrency } from "@/lib/utils";

interface ApplyRatesToProjectsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The org rates that were just saved. */
  laborRateCents: number;
  burdenedRateCents: number;
}

/**
 * Shown after the org's Break-Even / LLR is saved. New projects always pick up
 * the new rates; existing projects keep the rate they were created with unless
 * the user opts in here. Completed projects are locked and never offered.
 */
export function ApplyRatesToProjectsDialog({
  open,
  onOpenChange,
  laborRateCents,
  burdenedRateCents,
}: ApplyRatesToProjectsDialogProps) {
  const { data: count, isLoading } = useOpenProjectsWithDifferentRates(laborRateCents, burdenedRateCents, open);
  const apply = useApplyRatesToOpenProjects();

  const n = count ?? 0;

  async function handleApply() {
    try {
      const updated = await apply.mutateAsync({ laborRateCents, burdenedRateCents });
      toast.success(`Updated ${updated} open project${updated === 1 ? "" : "s"}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update projects");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rates saved</DialogTitle>
          <DialogDescription>
            Break-Even {formatCurrency(laborRateCents)}/hr · LLR {formatCurrency(burdenedRateCents)}/hr. New projects
            will use these rates.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Checking existing projects…</p>
        ) : n === 0 ? (
          <p className="text-sm text-slate-600 dark:text-neutral-400">
            No open projects use a different rate, so nothing else needs updating. Completed projects are locked and
            keep the rates they were closed with.
          </p>
        ) : (
          <p className="text-sm text-slate-600 dark:text-neutral-400">
            {n} open project{n === 1 ? "" : "s"} (sold, scheduled, in progress or on hold) {n === 1 ? "uses" : "use"} a
            different rate. Do you want to update {n === 1 ? "it" : "them"} too? Completed projects are locked and
            will not change either way.
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={apply.isPending}>
            {n === 0 || isLoading ? "Done" : "Only new projects"}
          </Button>
          {n > 0 && (
            <Button onClick={handleApply} disabled={apply.isPending}>
              {apply.isPending ? "Updating…" : `Update ${n} open project${n === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
