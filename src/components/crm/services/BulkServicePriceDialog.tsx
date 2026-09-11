"use client";

import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { Search, Layers } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils";
import {
  adjustCents,
  parseDollarsToCents,
  ROUNDING_LABELS,
  type AdjustMethod,
  type RoundingRule,
} from "@/lib/pricing/adjust";
import {
  useAllRateMatrixRows,
  useBulkUpdateCatalogPrices,
} from "@/lib/hooks/use-bulk-pricing";
import type { CRMService } from "@/types/crm-jobs";
import type { RateMatrixRow } from "@/lib/hooks/use-rate-matrix";
import { toast } from "sonner";

interface ServiceDraft {
  id: string;
  name: string;
  code: string | null;
  unit: string;
  /** null when the service has no catalog rate (matrix-priced, or unpriced). */
  rate: string | null;
  origRate: number | null;
  tailRate: string | null;
  origTailRate: number | null;
  matrixRowCount: number;
}

interface MatrixDraft {
  id: string;
  serviceId: string;
  label: string;
  rate: string;
  origRate: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The services currently visible in the list — the dialog adjusts these. */
  services: CRMService[];
}

function tierLabel(fromVal: number, toVal: number | null, isTail: boolean): string {
  if (isTail) return "overflow tier";
  const from = fromVal.toLocaleString();
  return toVal != null ? `${from}–${toVal.toLocaleString()}` : `${from}+`;
}

// Module-level so an unresolved query yields the *same* empty array on every
// render. A `= []` destructuring default mints a fresh one each time, which is
// enough on its own to retrigger any effect that depends on it.
const NO_MATRIX_ROWS: RateMatrixRow[] = [];

export function BulkServicePriceDialog({ open, onOpenChange, services }: Props) {
  const { data: matrixData, isLoading: matrixLoading } = useAllRateMatrixRows();
  const allMatrixRows = matrixData ?? NO_MATRIX_ROWS;
  const { mutate: bulkUpdate, isPending: saving } = useBulkUpdateCatalogPrices();

  const [serviceRows, setServiceRows] = useState<ServiceDraft[]>([]);
  const [matrixRows, setMatrixRows] = useState<MatrixDraft[]>([]);
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState<AdjustMethod>("percent");
  const [amount, setAmount] = useState("");
  const [rounding, setRounding] = useState<RoundingRule>("cent");
  const [includeMatrix, setIncludeMatrix] = useState(true);

  const matrixByService = useMemo(() => {
    const map = new Map<string, typeof allMatrixRows>();
    for (const r of allMatrixRows) {
      if (!map.has(r.serviceId)) map.set(r.serviceId, []);
      map.get(r.serviceId)!.push(r);
    }
    return map;
  }, [allMatrixRows]);

  // Seeds the drafts once per open, then leaves them alone so the user's edits
  // survive re-renders. Deliberately NOT keyed on `services`/`allMatrixRows`
  // identity: `services` arrives as a fresh .filter() array on every parent
  // render, so depending on it re-seeds (and wipes) the drafts mid-edit — and
  // when a query default is also freshly allocated, seeding itself triggers the
  // next render and the effect loops until React bails out.
  const seededRef = useRef(false);

  useEffect(() => {
    if (!open) {
      seededRef.current = false;
      return;
    }
    // Wait for the matrix query: seeding early would build drafts with zero
    // tiers and silently drop matrix pricing from the run.
    if (matrixLoading || seededRef.current) return;
    seededRef.current = true;

    setServiceRows(
      services.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        unit: s.unit,
        rate: s.defaultRateCents != null ? (s.defaultRateCents / 100).toFixed(2) : null,
        origRate: s.defaultRateCents,
        tailRate:
          s.matrixTailRateCents != null ? (s.matrixTailRateCents / 100).toFixed(2) : null,
        origTailRate: s.matrixTailRateCents,
        matrixRowCount: matrixByService.get(s.id)?.length ?? 0,
      }))
    );

    const visibleIds = new Set(services.map((s) => s.id));
    setMatrixRows(
      allMatrixRows
        .filter((r) => visibleIds.has(r.serviceId))
        .map((r) => ({
          id: r.id,
          serviceId: r.serviceId,
          label: tierLabel(r.fromVal, r.toVal, r.isTailRow),
          rate: (r.rateCents / 100).toFixed(2),
          origRate: r.rateCents,
        }))
    );

    setSearch("");
    setAmount("");
    // Seeds once per open (see seededRef above); `services`, `allMatrixRows`
    // and `matrixByService` are read at seed time on purpose, so later renders
    // can't clobber in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, matrixLoading]);

  const filtered = serviceRows.filter(
    (r) =>
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.code ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const dirtyServices = serviceRows.filter((r) => {
    const rate = r.rate != null ? parseDollarsToCents(r.rate) : null;
    const tail = r.tailRate != null ? parseDollarsToCents(r.tailRate) : null;
    return rate !== r.origRate || tail !== r.origTailRate;
  });
  const dirtyMatrix = matrixRows.filter(
    (r) => parseDollarsToCents(r.rate) !== r.origRate
  );
  const dirtyCount = dirtyServices.length + dirtyMatrix.length;

  function applyAdjustment() {
    const raw = Number(amount);
    if (!Number.isFinite(raw) || raw === 0) return;
    // Percent takes whole percents; flat takes dollars from the user and
    // adjusts in cents.
    const opts = {
      method,
      amount: method === "percent" ? raw : Math.round(raw * 100),
      rounding,
    };

    const visibleIds = new Set(filtered.map((r) => r.id));

    setServiceRows((prev) =>
      prev.map((r) => {
        if (!visibleIds.has(r.id)) return r;
        const next = { ...r };
        if (r.rate != null) {
          const cents = parseDollarsToCents(r.rate) ?? 0;
          next.rate = (adjustCents(cents, opts) / 100).toFixed(2);
        }
        if (r.tailRate != null) {
          const cents = parseDollarsToCents(r.tailRate) ?? 0;
          next.tailRate = (adjustCents(cents, opts) / 100).toFixed(2);
        }
        return next;
      })
    );

    if (includeMatrix) {
      setMatrixRows((prev) =>
        prev.map((r) => {
          if (!visibleIds.has(r.serviceId)) return r;
          const cents = parseDollarsToCents(r.rate) ?? 0;
          return { ...r, rate: (adjustCents(cents, opts) / 100).toFixed(2) };
        })
      );
    }

    setAmount("");
  }

  function resetDrafts() {
    setServiceRows((prev) =>
      prev.map((r) => ({
        ...r,
        rate: r.origRate != null ? (r.origRate / 100).toFixed(2) : null,
        tailRate: r.origTailRate != null ? (r.origTailRate / 100).toFixed(2) : null,
      }))
    );
    setMatrixRows((prev) =>
      prev.map((r) => ({ ...r, rate: (r.origRate / 100).toFixed(2) }))
    );
  }

  function handleSave() {
    if (dirtyCount === 0) {
      onOpenChange(false);
      return;
    }

    bulkUpdate(
      {
        services: dirtyServices
          .filter((r) => (r.rate != null ? parseDollarsToCents(r.rate) : null) !== r.origRate)
          .map((r) => ({
            id: r.id,
            defaultRateCents: r.rate != null ? parseDollarsToCents(r.rate) : null,
          })),
        serviceTails: dirtyServices
          .filter(
            (r) =>
              r.tailRate != null &&
              parseDollarsToCents(r.tailRate) !== r.origTailRate
          )
          .map((r) => ({
            id: r.id,
            matrixTailRateCents: parseDollarsToCents(r.tailRate!) ?? 0,
          })),
        matrixRows: dirtyMatrix.map((r) => ({
          id: r.id,
          rateCents: parseDollarsToCents(r.rate) ?? 0,
        })),
      },
      {
        onSuccess: ({ serviceCount, matrixCount }) => {
          const parts: string[] = [];
          if (serviceCount > 0) parts.push(`${serviceCount} service${serviceCount !== 1 ? "s" : ""}`);
          if (matrixCount > 0) parts.push(`${matrixCount} rate tier${matrixCount !== 1 ? "s" : ""}`);
          toast.success(`Catalog prices updated — ${parts.join(", ")}.`);
          onOpenChange(false);
        },
        onError: () => toast.error("Failed to update catalog prices. No changes were saved."),
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[840px]">
        <DialogHeader>
          <DialogTitle>Bulk Update Catalog Prices</DialogTitle>
          <DialogDescription>
            Adjusts the <strong>catalog</strong> default rates that seed new estimates,
            invoices and packages. Existing client jobs keep the price they were
            sold at — use a Price Adjustment run to re-price live work.
          </DialogDescription>
        </DialogHeader>

        {/* Quick adjust */}
        <div className="rounded-md border bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">
            Quick Adjust (applies to all rows matching the search below)
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={method} onValueChange={(v) => setMethod(v as AdjustMethod)}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent" className="text-xs">Percent (%)</SelectItem>
                <SelectItem value="flat" className="text-xs">Flat ($)</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              step="any"
              placeholder={method === "percent" ? "e.g. 5 or -3" : "e.g. 2.50 or -1"}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-8 w-40 text-xs"
            />
            <Select value={rounding} onValueChange={(v) => setRounding(v as RoundingRule)}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROUNDING_LABELS) as RoundingRule[]).map((r) => (
                  <SelectItem key={r} value={r} className="text-xs">
                    {ROUNDING_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={applyAdjustment}
              disabled={!amount}
            >
              Apply
            </Button>
            {dirtyCount > 0 && (
              <Button type="button" size="sm" variant="ghost" onClick={resetDrafts}>
                Reset
              </Button>
            )}
          </div>
          <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-xs text-slate-600">
            <Checkbox
              checked={includeMatrix}
              onCheckedChange={(c) => setIncludeMatrix(c === true)}
            />
            Also adjust rate-matrix tiers
            <span className="text-slate-400">
              ({matrixRows.length} tier{matrixRows.length !== 1 ? "s" : ""} across these services)
            </span>
          </label>
          {method === "percent" && (
            <p className="mt-2 text-[11px] text-slate-400">
              A percentage leaves $0.00 rows at $0.00 — use a flat adjustment to price
              something that has no rate yet.
            </p>
          )}
        </div>

        <Separator />

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search services…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-sm"
          />
        </div>

        {/* Table */}
        <div className="max-h-[45vh] overflow-y-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="px-3 py-2 font-medium">Service</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="w-44 px-3 py-2 font-medium">Default Rate ($)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const rateCents = r.rate != null ? parseDollarsToCents(r.rate) : null;
                const rateChanged = rateCents !== r.origRate;
                const tailCents = r.tailRate != null ? parseDollarsToCents(r.tailRate) : null;
                const tailChanged = tailCents !== r.origTailRate;
                const tiers = matrixRows.filter((m) => m.serviceId === r.id);

                return (
                  <Fragment key={r.id}>
                    <tr className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <span className="font-medium text-slate-900">{r.name}</span>
                        {r.code && <span className="ml-1.5 text-xs text-slate-400">{r.code}</span>}
                        {r.matrixRowCount > 0 && (
                          <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] text-brand-600">
                            <Layers className="h-3 w-3" />
                            matrix-priced
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{r.unit}</td>
                      <td className="px-3 py-2">
                        {r.rate == null ? (
                          <span className="text-xs text-slate-400">no catalog rate</span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              step="any"
                              min={0}
                              value={r.rate}
                              onChange={(e) =>
                                setServiceRows((prev) =>
                                  prev.map((x) =>
                                    x.id === r.id ? { ...x, rate: e.target.value } : x
                                  )
                                )
                              }
                              className={`h-7 w-28 text-xs ${rateChanged ? "border-brand-400 bg-brand-50" : ""}`}
                            />
                            {rateChanged && r.origRate != null && (
                              <span className="text-[10px] text-slate-400">
                                was {formatCurrency(r.origRate)}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* Rate-matrix tiers, indented under their service */}
                    {includeMatrix &&
                      tiers.map((m) => {
                        const mCents = parseDollarsToCents(m.rate);
                        const mChanged = mCents !== m.origRate;
                        return (
                          <tr key={m.id} className="border-b bg-slate-50/40 last:border-0">
                            <td className="px-3 py-1.5 pl-8 text-xs text-slate-500">
                              <span className="text-slate-300">↳</span> tier {m.label}
                            </td>
                            <td className="px-3 py-1.5" />
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  step="any"
                                  min={0}
                                  value={m.rate}
                                  onChange={(e) =>
                                    setMatrixRows((prev) =>
                                      prev.map((x) =>
                                        x.id === m.id ? { ...x, rate: e.target.value } : x
                                      )
                                    )
                                  }
                                  className={`h-7 w-28 text-xs ${mChanged ? "border-brand-400 bg-brand-50" : ""}`}
                                />
                                {mChanged && (
                                  <span className="text-[10px] text-slate-400">
                                    was {formatCurrency(m.origRate)}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                    {includeMatrix && r.tailRate != null && (
                      <tr key={`${r.id}-tail`} className="border-b bg-slate-50/40 last:border-0">
                        <td className="px-3 py-1.5 pl-8 text-xs text-slate-500">
                          <span className="text-slate-300">↳</span> overflow rate
                        </td>
                        <td className="px-3 py-1.5" />
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              step="any"
                              min={0}
                              value={r.tailRate}
                              onChange={(e) =>
                                setServiceRows((prev) =>
                                  prev.map((x) =>
                                    x.id === r.id ? { ...x, tailRate: e.target.value } : x
                                  )
                                )
                              }
                              className={`h-7 w-28 text-xs ${tailChanged ? "border-brand-400 bg-brand-50" : ""}`}
                            />
                            {tailChanged && r.origTailRate != null && (
                              <span className="text-[10px] text-slate-400">
                                was {formatCurrency(r.origTailRate)}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-sm text-slate-400">
                    {matrixLoading ? "Loading…" : "No services match your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter className="items-center">
          {dirtyCount > 0 && (
            <p className="mr-auto text-xs text-slate-500">
              {dirtyServices.length} service{dirtyServices.length !== 1 ? "s" : ""}
              {dirtyMatrix.length > 0 && `, ${dirtyMatrix.length} tier${dirtyMatrix.length !== 1 ? "s" : ""}`}
              {" "}modified
            </p>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || dirtyCount === 0}>
            {saving ? "Saving…" : dirtyCount > 0 ? `Save Changes (${dirtyCount})` : "No Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
