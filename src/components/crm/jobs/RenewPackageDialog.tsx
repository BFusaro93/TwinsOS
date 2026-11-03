"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { mutationErrorMessage } from "@/lib/utils/mutation-error";
import {
  PackageRenewalRefused,
  usePackageRenewalPlan,
  useRenewPackageJob,
} from "@/lib/hooks/use-package-renewal";

function fmtDate(ymd: string | null): string {
  if (!ymd) return "—";
  return new Date(ymd + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "Renew for next season" on a package job: previews the new season's job, then creates it. */
export function RenewPackageDialog({
  jobId,
  open,
  onOpenChange,
  onRenewed,
}: {
  jobId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRenewed?: (newJobId: string) => void;
}) {
  const [useTemplateDates, setUseTemplateDates] = useState(false);
  const { data: plan, isLoading, error } = usePackageRenewalPlan(jobId, useTemplateDates, open);
  const renew = useRenewPackageJob();
  const [allowSameSeason, setAllowSameSeason] = useState(false);

  const services = plan?.values.services ?? [];
  const totalCents = services
    .filter((s) => s.included)
    .reduce((sum, s) => sum + Math.round((s.rateCents || 0) * (s.qty || 1)), 0);
  const blocked = !plan || !!plan.existingRenewal || services.length === 0
    || (!!plan.sameSeasonJob && !allowSameSeason);

  async function handleRenew() {
    try {
      const res = await renew.mutateAsync({ jobId, allowSameSeason, useTemplateDates });
      toast.success(`Renewed for ${res.targetSeason ?? "next season"}`);
      onOpenChange(false);
      onRenewed?.(res.newJobId);
    } catch (err) {
      toast.error(err instanceof PackageRenewalRefused ? err.message : mutationErrorMessage(err, "Couldn't renew this package"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setAllowSameSeason(false); setUseTemplateDates(false); } onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Renew for next season</DialogTitle>
          <DialogDescription>
            Creates a new package job for the same client and property with the same services, rates and
            crew. Step dates are last season&rsquo;s moved forward a year, or the package&rsquo;s current
            dates if you tick the box below. Visits are created the same way as Add Job.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-24 w-full" /></div>
        ) : error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{mutationErrorMessage(error, (error as Error).message || "Couldn't load this job")}</p>
        ) : plan ? (
          <div className="space-y-3 text-sm">
            <p className="text-slate-700 dark:text-neutral-300">
              <span className="font-medium text-slate-900 dark:text-neutral-100">{plan.packageName ?? "Package"}</span>
              {" for "}{plan.clientName}
              {plan.sourceSeason != null && plan.targetSeason != null && (
                <> — <span className="font-medium">{plan.sourceSeason} → {plan.targetSeason}</span></>
              )}
            </p>

            <label
              className="flex items-start gap-2 text-slate-700 dark:text-neutral-300"
              title={plan.templateAvailable ? undefined : "This package has no step dates set in Settings → Packages"}
            >
              <Checkbox
                className="mt-0.5"
                checked={useTemplateDates}
                disabled={!plan.templateAvailable && !useTemplateDates}
                onCheckedChange={(v) => setUseTemplateDates(v === true)}
              />
              <span>
                Use the package&rsquo;s current dates
                <span className="block text-xs text-slate-500 dark:text-neutral-400">
                  {plan.templateAvailable
                    ? "Each step's window comes from Settings → Packages (moved to the new season), not last season's job."
                    : "Not available — this package has no step dates in Settings → Packages."}
                </span>
              </span>
            </label>

            {plan.templateNote && (
              <p className="text-xs text-amber-700 dark:text-amber-400">{plan.templateNote}</p>
            )}

            {plan.existingRenewal && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                Already renewed as{" "}
                <Link className="font-medium underline" href={`/crm/scheduling/jobs/${plan.existingRenewal.id}`}>
                  job #{plan.existingRenewal.jobNumber}
                </Link>.
              </div>
            )}

            {!plan.existingRenewal && plan.doNotRenew && (
              <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                This job is marked &ldquo;Don&rsquo;t renew&rdquo;. Renewing it anyway still works.
              </div>
            )}

            {!plan.existingRenewal && plan.sameSeasonJob && (
              <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <Link className="font-medium underline" href={`/crm/scheduling/jobs/${plan.sameSeasonJob.id}`}>
                      Job #{plan.sameSeasonJob.jobNumber}
                    </Link>{" "}
                    already has this package at this property for {plan.targetSeason}.
                  </span>
                </div>
                <label className="flex items-center gap-2 pl-6">
                  <Checkbox checked={allowSameSeason} onCheckedChange={(v) => setAllowSameSeason(v === true)} />
                  Renew anyway (creates a second {plan.targetSeason} job)
                </label>
              </div>
            )}

            {plan.contractNote && (
              <div className="flex gap-2 rounded-md border border-slate-200 bg-slate-50 p-2.5 text-slate-700 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                {plan.contractNote}
              </div>
            )}

            {!plan.existingRenewal && plan.pastStepCount > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {plan.pastStepCount} step{plan.pastStepCount === 1 ? "" : "s"} would land before today — move them on the new job after renewing.
              </p>
            )}

            <div className="max-h-60 overflow-y-auto rounded-md border dark:border-neutral-700">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-slate-500 dark:bg-neutral-800 dark:text-neutral-400">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Step</th>
                    <th className="px-2 py-1.5 font-medium">Date</th>
                    <th className="px-2 py-1.5 text-right font-medium">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((s, i) => (
                    <tr key={i} className="border-t dark:border-neutral-700">
                      <td className="px-2 py-1.5 text-slate-800 dark:text-neutral-200">{s.serviceName}</td>
                      <td className="px-2 py-1.5 text-slate-600 dark:text-neutral-400">{fmtDate(s.startDate)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(Math.round((s.rateCents || 0) * (s.qty || 1)))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-medium dark:border-neutral-700">
                    <td className="px-2 py-1.5" colSpan={2}>
                      Program {fmtDate(plan.firstDate)} – {fmtDate(plan.lastDate)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(totalCents)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleRenew} disabled={blocked || renew.isPending}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            {renew.isPending ? "Renewing…" : `Renew for ${plan?.targetSeason ?? "next season"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
