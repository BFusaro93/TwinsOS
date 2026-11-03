"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, formatCurrency } from "@/lib/utils";
import { mutationErrorMessage } from "@/lib/utils/mutation-error";
import { useOrgTimeZone } from "@/lib/hooks/use-org-timezone";
import { todayInZone } from "@/lib/time/zone";
import {
  PackageRenewalRefused,
  usePackageRenewalCandidates,
  useRenewPackageJob,
  useSetPackageRenewalSetting,
  type PackageRenewalCandidate,
} from "@/lib/hooks/use-package-renewal";

type RowResult = { ok: true; newJobId: string; usedJobDates: boolean } | { ok: false; message: string };

/** Season whose package jobs are shown first: this year from July on, last year before. */
function defaultSeason(today: string, seasons: number[]): number | null {
  const year = parseInt(today.slice(0, 4), 10);
  const preferred = parseInt(today.slice(5, 7), 10) >= 7 ? year : year - 1;
  if (seasons.includes(preferred)) return preferred;
  return seasons.find((s) => s <= preferred) ?? seasons[0] ?? null;
}

function renewable(c: PackageRenewalCandidate): boolean {
  return !c.renewedTo && !c.doNotRenew;
}

/** Bulk "Renew for next season" over one season's package jobs. */
export function RenewPackagesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const today = todayInZone(useOrgTimeZone());
  const { data: candidates = [], isLoading } = usePackageRenewalCandidates(open);
  const renew = useRenewPackageJob();
  const setSetting = useSetPackageRenewalSetting();

  const seasons = useMemo(
    () => [...new Set(candidates.map((c) => c.season).filter((s): s is number => s != null))].sort((a, b) => b - a),
    [candidates],
  );
  const [season, setSeason] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, RowResult>>({});
  const [running, setRunning] = useState(false);
  const [useTemplateDates, setUseTemplateDates] = useState(false);

  useEffect(() => {
    if (open && season == null && seasons.length > 0) setSeason(defaultSeason(today, seasons));
  }, [open, season, seasons, today]);

  const rows = useMemo(() => candidates.filter((c) => c.season === season), [candidates, season]);

  // Picking a season (or the list arriving) selects everything that still needs renewing.
  const rowsLoaded = rows.length > 0;
  useEffect(() => {
    setSelected(new Set(rows.filter(renewable).map((r) => r.id)));
    // Only on season change / first load — a refetch mid-session keeps the user's picks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, rowsLoaded]);

  function close(o: boolean) {
    if (running) return;
    if (!o) { setResults({}); setSeason(null); setUseTemplateDates(false); }
    onOpenChange(o);
  }

  const selectable = rows.filter(renewable);
  const allChecked = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
  const selectedIds = selectable.filter((r) => selected.has(r.id) && !results[r.id]?.ok).map((r) => r.id);

  async function handleRenew() {
    const ids = selectedIds;
    if (ids.length === 0) return;
    setRunning(true);
    let ok = 0;
    for (const id of ids) {
      try {
        const res = await renew.mutateAsync({ jobId: id, useTemplateDates });
        setResults((prev) => ({
          ...prev,
          [id]: { ok: true, newJobId: res.newJobId, usedJobDates: useTemplateDates && res.dateSource === "job" },
        }));
        ok++;
      } catch (err) {
        const message = err instanceof PackageRenewalRefused ? err.message : mutationErrorMessage(err, (err as Error)?.message || "Failed");
        setResults((prev) => ({ ...prev, [id]: { ok: false, message } }));
      }
    }
    setRunning(false);
    const failed = ids.length - ok;
    if (failed === 0) toast.success(`Renewed ${ok} package job${ok === 1 ? "" : "s"}`);
    else toast.warning(`Renewed ${ok} of ${ids.length} — ${failed} skipped (see the list)`);
  }

  async function toggleDoNotRenew(row: PackageRenewalCandidate) {
    try {
      await setSetting.mutateAsync({ jobId: row.id, doNotRenew: !row.doNotRenew });
      setSelected((prev) => {
        const next = new Set(prev);
        if (row.doNotRenew) next.add(row.id); else next.delete(row.id);
        return next;
      });
    } catch (err) {
      toast.error(mutationErrorMessage(err, "Couldn't update the renewal setting"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Renew packages for next season</DialogTitle>
          <DialogDescription>
            Pick last season, check the package jobs to renew, and each one gets a new job for the following
            season — same client, property, services, rates and crew, with step dates moved forward a year.
            Jobs already renewed or marked &ldquo;Don&rsquo;t renew&rdquo; are left unchecked.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-600 dark:text-neutral-400">Season</span>
          <Select value={season != null ? String(season) : ""} onValueChange={(v) => { setSeason(parseInt(v, 10)); setResults({}); }}>
            <SelectTrigger className="h-8 w-28"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {seasons.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          {season != null && (
            <span className="text-xs text-slate-500 dark:text-neutral-400">
              {rows.length} package job{rows.length === 1 ? "" : "s"} · {rows.filter((r) => r.renewedTo).length} renewed
            </span>
          )}
          <label className="ml-auto flex items-center gap-2 text-slate-700 dark:text-neutral-300"
            title="Each step's window comes from Settings → Packages (moved to the new season) instead of last season's job. Packages with no step dates keep last season's dates.">
            <Checkbox checked={useTemplateDates} disabled={running} onCheckedChange={(v) => setUseTemplateDates(v === true)} />
            Use each package&rsquo;s current dates
          </label>
        </div>

        {isLoading ? (
          <div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-neutral-400">No package jobs for this season.</p>
        ) : (
          <div className="max-h-[55vh] overflow-y-auto rounded-md border dark:border-neutral-700">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left text-slate-500 dark:bg-neutral-800 dark:text-neutral-400">
                <tr>
                  <th className="w-8 px-2 py-1.5">
                    <Checkbox
                      aria-label="Select all"
                      checked={allChecked}
                      disabled={running || selectable.length === 0}
                      onCheckedChange={(v) => setSelected(v === true ? new Set(selectable.map((r) => r.id)) : new Set())}
                    />
                  </th>
                  <th className="px-2 py-1.5 font-medium">Client</th>
                  <th className="px-2 py-1.5 font-medium">Package</th>
                  <th className="px-2 py-1.5 font-medium">Job</th>
                  <th className="px-2 py-1.5 text-right font-medium">Amount</th>
                  <th className="px-2 py-1.5 font-medium">Renewal</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const result = results[r.id];
                  return (
                    <tr key={r.id} className="border-t dark:border-neutral-700">
                      <td className="px-2 py-1.5">
                        <Checkbox
                          aria-label={`Renew ${r.clientName}`}
                          checked={selected.has(r.id) && renewable(r) && !result?.ok}
                          disabled={running || !renewable(r)}
                          onCheckedChange={(v) => setSelected((prev) => {
                            const next = new Set(prev);
                            if (v === true) next.add(r.id); else next.delete(r.id);
                            return next;
                          })}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-slate-800 dark:text-neutral-200">{r.clientName}</td>
                      <td className="px-2 py-1.5 text-slate-600 dark:text-neutral-400">{r.packageName ?? "—"}</td>
                      <td className="px-2 py-1.5">
                        <Link className="text-brand-600 hover:underline dark:text-brand-400" href={`/crm/scheduling/jobs/${r.id}`}>#{r.jobNumber}</Link>
                        {r.status === "cancelled" && <span className="ml-1 text-slate-400">(cancelled)</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(r.totalCents)}</td>
                      <td className={cn("px-2 py-1.5", result && !result.ok && "text-red-600 dark:text-red-400")}>
                        {result?.ok ? (
                          <Link className="text-green-700 hover:underline dark:text-green-400" href={`/crm/scheduling/jobs/${result.newJobId}`}>
                            {result.usedJobDates ? "Renewed (package has no dates — used last season's)" : "Renewed — open"}
                          </Link>
                        ) : result ? (
                          result.message
                        ) : r.renewedTo ? (
                          <Link className="text-green-700 hover:underline dark:text-green-400" href={`/crm/scheduling/jobs/${r.renewedTo.id}`}>Renewed (#{r.renewedTo.jobNumber})</Link>
                        ) : r.doNotRenew ? (
                          <span className="text-slate-500 dark:text-neutral-400">Don&rsquo;t renew</span>
                        ) : (
                          <span className="text-slate-500 dark:text-neutral-400">Not renewed</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {!r.renewedTo && !result?.ok && (
                          <button
                            type="button"
                            className="whitespace-nowrap text-[11px] text-slate-500 hover:text-slate-800 hover:underline disabled:opacity-50 dark:text-neutral-400 dark:hover:text-neutral-100"
                            disabled={running || setSetting.isPending}
                            onClick={() => toggleDoNotRenew(r)}
                          >
                            {r.doNotRenew ? "Renew as usual" : "Don’t renew"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={running}>Close</Button>
          <Button onClick={handleRenew} disabled={running || selectedIds.length === 0}>
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", running && "animate-spin")} />
            {running ? "Renewing…" : `Renew ${selectedIds.length} selected`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
