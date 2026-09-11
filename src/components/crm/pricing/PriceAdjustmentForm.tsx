"use client";

import { useState, useMemo } from "react";
import { AlertTriangle, ArrowRight, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { ROUNDING_LABELS, type AdjustMethod, type RoundingRule } from "@/lib/pricing/adjust";
import {
  ADJUST_TARGETS,
  TARGET_LABELS,
  type AdjustTarget,
  type PriceAdjustmentPreview,
} from "@/types/crm-pricing";
import {
  usePreviewPriceAdjustment,
  useApplyPriceAdjustment,
} from "@/lib/hooks/use-bulk-pricing";
import { useAllCRMServices } from "@/lib/hooks/use-crm-jobs";
import { toast } from "sonner";

const JOB_TYPES = ["recurring", "one_time", "package", "snow", "project", "waiting_list"] as const;

const JOB_TYPE_LABELS: Record<string, string> = {
  recurring: "Recurring",
  one_time: "One-time",
  package: "Package",
  snow: "Snow",
  project: "Project",
  waiting_list: "Waiting list",
};

/** Signed currency, so a decrease reads as a decrease rather than a bare number. */
function signedCurrency(cents: number): string {
  const sign = cents > 0 ? "+" : cents < 0 ? "−" : "";
  return `${sign}${formatCurrency(Math.abs(cents))}`;
}

export function PriceAdjustmentForm({ onApplied }: { onApplied?: () => void }) {
  const { data: services = [] } = useAllCRMServices();
  const preview = usePreviewPriceAdjustment();
  const apply = useApplyPriceAdjustment();

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [method, setMethod] = useState<AdjustMethod>("percent");
  const [amount, setAmount] = useState("");
  const [rounding, setRounding] = useState<RoundingRule>("dollar");
  const [targets, setTargets] = useState<AdjustTarget[]>(["job_service"]);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [serviceSearch, setServiceSearch] = useState("");
  const [result, setResult] = useState<PriceAdjustmentPreview | null>(null);
  const [rowSearch, setRowSearch] = useState("");

  const numericAmount = useMemo(() => {
    const raw = Number(amount);
    if (!Number.isFinite(raw) || raw === 0) return null;
    // Percent is whole percents; flat is entered in dollars, sent as cents.
    return method === "percent" ? raw : Math.round(raw * 100);
  }, [amount, method]);

  const canPreview = numericAmount !== null && targets.length > 0;
  // A run is only applied from a preview the user is currently looking at —
  // never straight from the form.
  const canApply = !!result && result.changedCount > 0 && name.trim().length > 0;

  const filteredServices = services.filter(
    (s) => !serviceSearch || s.name.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  function buildInput() {
    return {
      method,
      amount: numericAmount!,
      rounding,
      targets,
      scope: { serviceIds, clientIds: [], jobTypes, packageIds: [] },
    };
  }

  function toggle<T>(list: T[], value: T, set: (next: T[]) => void) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  // Any change to the maths or the filters invalidates the preview on screen.
  // Leaving a stale one visible next to an enabled Apply button is how someone
  // ends up applying numbers they never actually saw.
  function invalidatePreview() {
    if (result) setResult(null);
  }

  function handlePreview() {
    if (!canPreview) return;
    preview.mutate(buildInput(), {
      onSuccess: (data) => setResult(data),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Preview failed"),
    });
  }

  function handleApply() {
    if (!canApply || !result) return;
    const count = result.changedCount;
    if (
      !confirm(
        `Re-price ${count} line${count !== 1 ? "s" : ""} by ${signedCurrency(result.deltaCents)}?\n\n` +
          `This changes what customers are billed going forward. It can be undone from the run history.`
      )
    ) {
      return;
    }

    apply.mutate(
      { ...buildInput(), name: name.trim(), notes: notes.trim() || undefined, expectedLineCount: count },
      {
        onSuccess: ({ lineCount }) => {
          toast.success(`Applied — ${lineCount} line${lineCount !== 1 ? "s" : ""} re-priced.`);
          setResult(null);
          setName("");
          setNotes("");
          setAmount("");
          onApplied?.();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to apply", { duration: 10000 }),
      }
    );
  }

  const visibleRows = (result?.candidates ?? []).filter(
    (c) => !rowSearch || c.label.toLowerCase().includes(rowSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-5">
      {/* ── the maths ── */}
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Adjustment</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs text-slate-500">Method</Label>
            <Select
              value={method}
              onValueChange={(v) => { setMethod(v as AdjustMethod); invalidatePreview(); }}
            >
              <SelectTrigger className="mt-1 h-9 w-36 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percent (%)</SelectItem>
                <SelectItem value="flat">Flat ($)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-slate-500">
              {method === "percent" ? "Percent change" : "Dollar change"}
            </Label>
            <Input
              type="number"
              step="any"
              placeholder={method === "percent" ? "e.g. 5 or -3" : "e.g. 2.50 or -1"}
              value={amount}
              onChange={(e) => { setAmount(e.target.value); invalidatePreview(); }}
              className="mt-1 h-9 w-40 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Round to</Label>
            <Select
              value={rounding}
              onValueChange={(v) => { setRounding(v as RoundingRule); invalidatePreview(); }}
            >
              <SelectTrigger className="mt-1 h-9 w-44 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ROUNDING_LABELS) as RoundingRule[]).map((r) => (
                  <SelectItem key={r} value={r}>{ROUNDING_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4">
          <Label className="text-xs text-slate-500">Apply to</Label>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {ADJUST_TARGETS.map((t) => (
              <label key={t} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <Checkbox
                  checked={targets.includes(t)}
                  onCheckedChange={() => { toggle(targets, t, setTargets); invalidatePreview(); }}
                />
                {TARGET_LABELS[t]}
              </label>
            ))}
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-slate-400">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
            Signed contracts, already-issued invoices, and per-visit rate overrides
            are never touched by a run.
          </p>
        </div>
      </section>

      {/* ── narrowing ── */}
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Limit to</h2>
        <p className="mb-3 text-xs text-slate-400">
          Leave both empty to adjust everything the targets above cover.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-xs text-slate-500">
              Services {serviceIds.length > 0 && `(${serviceIds.length} selected)`}
            </Label>
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Search services…"
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
            <div className="mt-1.5 max-h-40 overflow-y-auto rounded-md border p-2">
              {filteredServices.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2 py-0.5 text-xs text-slate-700">
                  <Checkbox
                    checked={serviceIds.includes(s.id)}
                    onCheckedChange={() => { toggle(serviceIds, s.id, setServiceIds); invalidatePreview(); }}
                  />
                  <span className="truncate">{s.name}</span>
                </label>
              ))}
              {filteredServices.length === 0 && (
                <p className="py-2 text-center text-xs text-slate-400">No services match.</p>
              )}
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-500">Job types</Label>
            <div className="mt-1.5 rounded-md border p-2">
              {JOB_TYPES.map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-2 py-0.5 text-xs text-slate-700">
                  <Checkbox
                    checked={jobTypes.includes(t)}
                    onCheckedChange={() => { toggle(jobTypes, t, setJobTypes); invalidatePreview(); }}
                  />
                  {JOB_TYPE_LABELS[t]}
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              Applies to job service rates only.
            </p>
          </div>
        </div>
      </section>

      {/* ── preview ── */}
      <div className="flex items-center gap-3">
        <Button onClick={handlePreview} disabled={!canPreview || preview.isPending}>
          {preview.isPending ? (
            <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Building preview…</>
          ) : (
            <>Preview changes <ArrowRight className="ml-1.5 h-4 w-4" /></>
          )}
        </Button>
        {!canPreview && (
          <p className="text-xs text-slate-400">
            Enter a non-zero amount and pick at least one target.
          </p>
        )}
      </div>

      {result && (
        <section className="rounded-lg border bg-white shadow-sm">
          <div className="border-b p-4">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <div>
                <p className="text-xs text-slate-500">Lines changing</p>
                <p className="text-xl font-semibold tabular-nums text-slate-900">
                  {result.changedCount}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total change</p>
                <p
                  className={`text-xl font-semibold tabular-nums ${
                    result.deltaCents > 0 ? "text-emerald-600" : result.deltaCents < 0 ? "text-red-600" : "text-slate-900"
                  }`}
                >
                  {signedCurrency(result.deltaCents)}
                </p>
              </div>
              {result.unchangedCount > 0 && (
                <div>
                  <p className="text-xs text-slate-500">Matched but unchanged</p>
                  <p className="text-xl font-semibold tabular-nums text-slate-400">
                    {result.unchangedCount}
                  </p>
                </div>
              )}
            </div>
            {/* Per-target totals, because a job service rate is per billing
                period and a package amount is per month — summing them into
                one figure would be apples and oranges. */}
            {result.changedCount > 0 && (
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                {ADJUST_TARGETS.filter((t) => result.countsByTarget[t] > 0).map((t) => (
                  <span key={t}>
                    {TARGET_LABELS[t]}: <strong className="text-slate-700">{result.countsByTarget[t]}</strong>{" "}
                    ({signedCurrency(result.deltaByTarget[t])})
                  </span>
                ))}
              </div>
            )}
            {result.changedCount === 0 && (
              <p className="mt-3 text-sm text-amber-600">
                Nothing would change. Check the filters, or try a flat adjustment if the
                matched rows are all unpriced.
              </p>
            )}
          </div>

          {result.candidates.length > 0 && (
            <>
              <div className="border-b p-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search these lines…"
                    value={rowSearch}
                    onChange={(e) => setRowSearch(e.target.value)}
                    className="pl-8 text-sm"
                  />
                </div>
              </div>
              <div className="max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="border-b text-left text-xs text-slate-500">
                      <th className="px-4 py-2 font-medium">Line</th>
                      <th className="w-28 px-4 py-2 text-right font-medium">Current</th>
                      <th className="w-28 px-4 py-2 text-right font-medium">New</th>
                      <th className="w-28 px-4 py-2 text-right font-medium">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((c) => {
                      const delta = c.newRateCents - c.oldRateCents;
                      return (
                        <tr
                          key={`${c.entityType}-${c.entityId}`}
                          className={`border-b last:border-0 ${delta === 0 ? "text-slate-400" : ""}`}
                        >
                          <td className="px-4 py-2">{c.label}</td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {formatCurrency(c.oldRateCents)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium">
                            {formatCurrency(c.newRateCents)}
                          </td>
                          <td
                            className={`px-4 py-2 text-right tabular-nums ${
                              delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-600" : ""
                            }`}
                          >
                            {delta === 0 ? "—" : signedCurrency(delta)}
                          </td>
                        </tr>
                      );
                    })}
                    {visibleRows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                          No lines match your search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {result.changedCount > 0 && (
            <div className="flex flex-wrap items-end gap-3 border-t bg-slate-50 p-4">
              <div className="flex-1 min-w-[220px]">
                <Label className="text-xs text-slate-500">Name this run *</Label>
                <Input
                  placeholder="e.g. 2027 season increase"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div className="flex-1 min-w-[220px]">
                <Label className="text-xs text-slate-500">Notes (optional)</Label>
                <Textarea
                  placeholder="Why this increase…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={1}
                  className="mt-1 min-h-9 text-sm"
                />
              </div>
              <Button onClick={handleApply} disabled={!canApply || apply.isPending}>
                {apply.isPending ? (
                  <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Applying…</>
                ) : (
                  `Apply to ${result.changedCount} line${result.changedCount !== 1 ? "s" : ""}`
                )}
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
