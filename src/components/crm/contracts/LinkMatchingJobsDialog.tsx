"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLinkableJobs, useLinkJobsToContract } from "@/lib/hooks/use-contracts";
import { mutationErrorMessage } from "@/lib/utils/mutation-error";

const TYPE_LABEL: Record<string, string> = { recurring: "Recurring", package: "Package", one_time: "One-time" };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: { id: string; clientId: string; title: string; status: string };
}

/**
 * Lists the client's unlinked recurring / package / one-time jobs whose services
 * appear in the contract's covered services, lets staff tick which to link, and
 * applies the link in one batch. Nothing is pre-ticked: linking is always an
 * explicit choice, because it changes how those jobs bill.
 */
export function LinkMatchingJobsDialog({ open, onOpenChange, contract }: Props) {
  const { data: jobs, isLoading, error } = useLinkableJobs(contract, open);
  const link = useLinkJobsToContract();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(true);

  useEffect(() => {
    if (open) { setSelected(new Set()); setShowAll(true); }
  }, [open]);

  const all = jobs ?? [];
  const matching = all.filter((j) => j.matches);
  // Matches first, so the covered-service ones lead the list.
  const shown = showAll ? [...matching, ...all.filter((j) => !j.matches)] : matching;
  const chosen = all.filter((j) => selected.has(j.id));
  const uninvoiced = chosen.reduce((n, j) => n + j.completedUninvoiced, 0);
  const unsigned = contract.status === "draft" || contract.status === "sent";

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function apply() {
    try {
      const n = await link.mutateAsync({ contractId: contract.id, jobIds: chosen.map((j) => j.id) });
      toast.success(`${n} job${n !== 1 ? "s" : ""} linked to this contract`);
      onOpenChange(false);
    } catch (err) {
      toast.error(mutationErrorMessage(err, "Couldn't link the jobs"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Link matching jobs</DialogTitle>
          <DialogDescription>
            This client&apos;s open jobs that aren&apos;t on a contract. Jobs running a service this contract covers are marked. Tick the ones to link.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-medium">What linking does</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>The job&apos;s services are billed <strong>inside the contract price</strong>; its future completed visits get no separate invoice.</li>
            <li>Materials still follow each product&apos;s &ldquo;In contract&rdquo; flag.</li>
            <li>Visits <strong>already completed but not invoiced</strong> are not billed retroactively and not released automatically.</li>
            {unsigned && <li>This contract isn&apos;t signed yet ({contract.status}); completed visits are held until it is signed or cancelled.</li>}
          </ul>
        </div>

        {error ? (
          <p className="text-sm text-red-600">Couldn&apos;t load jobs.</p>
        ) : isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="flex flex-col gap-2">
            {shown.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {all.length === 0
                  ? "This client has no open recurring, package or one-time jobs without a contract."
                  : "No unlinked job runs a covered service. Add covered services on the Included Services tab, or show all of this client's unlinked jobs."}
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-md border">
                {shown.map((j) => (
                  <label key={j.id} className="flex cursor-pointer items-start gap-3 border-b px-3 py-2 last:border-0 hover:bg-muted/40">
                    <Checkbox checked={selected.has(j.id)} onCheckedChange={() => toggle(j.id)} className="mt-0.5" />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-medium">Job #{j.jobNumber ?? "—"}</span>
                      {j.matches && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">Covered service</span>}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {TYPE_LABEL[j.jobType] ?? j.jobType}{j.schedule ? ` · ${j.schedule}` : ""} · {j.status.replace(/_/g, " ")}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{j.serviceNames.join(", ") || "No services"}</span>
                    </span>
                    {j.completedUninvoiced > 0 && (
                      <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        {j.completedUninvoiced} completed, not invoiced
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
            {matching.length > 0 && all.length > matching.length && (
              <button type="button" className="self-start text-xs text-brand-600 hover:underline dark:text-brand-400" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show only jobs running a covered service" : `Show all ${all.length} unlinked jobs for this client`}
              </button>
            )}
          </div>
        )}

        {chosen.length > 0 && (
          <p className="text-xs text-slate-700 dark:text-neutral-300">
            Preview: {chosen.length} job{chosen.length !== 1 ? "s" : ""} will move inside this contract&apos;s price.{" "}
            {uninvoiced > 0
              ? `${uninvoiced} completed visit${uninvoiced !== 1 ? "s" : ""} on them ${uninvoiced !== 1 ? "are" : "is"} not invoiced and will stay that way until you handle ${uninvoiced !== 1 ? "them" : "it"}.`
              : "No completed-uninvoiced visits on these jobs."}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={chosen.length === 0 || link.isPending} onClick={apply}>
            {link.isPending ? "Linking…" : `Link ${chosen.length || ""} job${chosen.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
