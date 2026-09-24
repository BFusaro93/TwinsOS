"use client";

import { Fragment, useState } from "react";
import { useQuery } from "@/lib/hooks/use-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, ChevronDown, ChevronRight, ShoppingCart, FileText } from "lucide-react";
import { NewRequisitionDialog } from "@/components/po/NewRequisitionDialog";
import type { PrefillItem } from "@/components/po/NewRequisitionDialog";
import { NewPODialog } from "@/components/po/NewPODialog";
import type { POPrefillItem } from "@/components/po/NewPODialog";
import type { MaterialsNeededResult, MaterialsNeededRow } from "@/lib/reports/materials/materials-needed";

const CATEGORY_LABELS: Record<string, string> = {
  maintenance_part: "Maintenance Part",
  stocked_material: "Stocked Material",
  project_material: "Project Material",
};

function fmtQty(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** A quantity is only meaningful next to its unit — chemical rows carry one,
 *  non-chemical rows are already in the product's own stock unit. */
function fmtQtyWithUnit(n: number, unitName: string | null) {
  return unitName ? `${fmtQty(n)} ${unitName}` : fmtQty(n);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function MaterialsNeededReportPage() {
  const [onlyShortfalls, setOnlyShortfalls] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [reqOpen, setReqOpen] = useState(false);
  const [reqPrefill, setReqPrefill] = useState<{ items: PrefillItem[] } | null>(null);
  const [poOpen, setPoOpen] = useState(false);
  const [poPrefill, setPoPrefill] = useState<{ items: POPrefillItem[] } | null>(null);

  const { data, isLoading, error } = useQuery<MaterialsNeededResult>({
    queryKey: ["crm-materials-needed-report"],
    queryFn: async () => {
      const res = await fetch("/api/crm/reports/materials-needed");
      if (!res.ok) throw new Error("Failed to load report");
      return res.json() as Promise<MaterialsNeededResult>;
    },
  });

  const allRows = data?.rows ?? [];
  // A row whose shortfall couldn't be computed is not "fine" — it's unknown,
  // so it stays visible under the shortfalls-only filter.
  const rows = onlyShortfalls ? allRows.filter((r) => r.shortfall == null || r.shortfall < 0) : allRows;

  function toggleRow(productId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function toggleExpanded(productId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  /** Only rows with a computed shortfall can be ordered from here — see
   *  MaterialsNeededRow.shortfall for why an unknown one must not become a
   *  purchase-order quantity. */
  function isOrderable(r: MaterialsNeededRow): boolean {
    return r.shortfall != null && r.shortfall < 0;
  }

  const selectedRows = rows.filter((r) => selected.has(r.productId) && isOrderable(r));

  function buildQuantity(r: MaterialsNeededRow) {
    return Math.max(1, Math.ceil(-(r.shortfall ?? 0)));
  }

  function openRequisition() {
    setReqPrefill({
      items: selectedRows.map((r) => ({
        productKey: `product:${r.productId}`,
        productName: r.productName,
        partNumber: "",
        unitCost: r.unitCostCents / 100,
        quantity: buildQuantity(r),
      })),
    });
    setReqOpen(true);
  }

  function openPO() {
    setPoPrefill({
      items: selectedRows.map((r) => ({
        productKey: `product:${r.productId}`,
        productName: r.productName,
        partNumber: "",
        unitCost: r.unitCostCents / 100,
        quantity: buildQuantity(r),
      })),
    });
    setPoOpen(true);
  }

  return (
    <div className="flex flex-col gap-5 p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Materials Needed</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            What every outstanding scheduled or waiting-list job still needs, vs. what&apos;s on hand and on order.
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
          <Checkbox checked={onlyShortfalls} onCheckedChange={(v) => setOnlyShortfalls(!!v)} />
          Only show shortfalls
        </label>
      </div>

      {data?.notes && data.notes.length > 0 && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          {data.notes.join(" · ")}
        </div>
      )}

      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400">Loading…</div>
        ) : error ? (
          <div className="flex items-center justify-center py-16 text-sm text-red-500">Failed to load report.</div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400">
            {onlyShortfalls ? "No shortfalls — everything needed is on hand or on order." : "No outstanding material demand."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="w-8 px-3 py-2.5" />
                  <th className="w-8 px-3 py-2.5" />
                  <th className="px-3 py-2.5 text-left whitespace-nowrap">Product</th>
                  <th className="px-3 py-2.5 text-left whitespace-nowrap">Category</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Needed</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">On Hand</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">On Order</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Shortfall</th>
                  <th className="px-3 py-2.5 text-left whitespace-nowrap">Next Needed By</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isShort = r.shortfall != null && r.shortfall < 0;
                  const orderable = isOrderable(r);
                  const isOpen = expanded.has(r.productId);
                  return (
                    <Fragment key={r.productId}>
                      <tr className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2 text-center">
                          <Checkbox
                            checked={selected.has(r.productId)}
                            onCheckedChange={() => toggleRow(r.productId)}
                            disabled={!orderable}
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => toggleExpanded(r.productId)} className="text-slate-400 hover:text-slate-700">
                            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-800">{r.productName}</td>
                        <td className="px-3 py-2 text-slate-500">{CATEGORY_LABELS[r.category] ?? r.category}</td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                          {fmtQtyWithUnit(r.neededQty, r.neededUnitName)}
                          {r.unestimatedJobs > 0 && (
                            <span
                              className="block text-[10px] font-normal text-amber-700"
                              title="These jobs have no usable application rate or no measured area, so their demand isn't included."
                            >
                              +{r.unestimatedJobs} job{r.unestimatedJobs !== 1 ? "s" : ""} not estimated
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtQty(r.onHand)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtQty(r.onOrder)}</td>
                        {r.shortfall != null ? (
                          <td className={cn("px-3 py-2 text-right tabular-nums font-semibold whitespace-nowrap", isShort ? "text-red-600" : "text-green-600")}>
                            {fmtQtyWithUnit(r.shortfall, r.neededUnitName)}
                          </td>
                        ) : (
                          <td className="px-3 py-2 text-right">
                            <span
                              className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800"
                              title="This product's demand is stated in a unit that can't be converted to the unit it's stocked in, so it can't be differenced against stock. Fix the units on its application rate."
                            >
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              Unit mismatch
                            </span>
                          </td>
                        )}
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmtDate(r.nextNeededBy)}</td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-slate-50/60 border-b border-slate-100">
                          <td />
                          <td />
                          <td colSpan={7} className="px-3 py-2">
                            <div className="flex flex-col gap-1">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                Jobs driving this demand
                              </p>
                              {r.jobsAffected.map((j) => (
                                <div key={j.jobId} className="flex items-center justify-between text-xs text-slate-600">
                                  <span>{j.jobName}</span>
                                  <span className="tabular-nums">
                                    {fmtQtyWithUnit(j.qty, r.neededUnitName)} · {fmtDate(j.neededBy)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedRows.length > 0 && (
        <div className="sticky bottom-4 flex items-center justify-between rounded-lg border bg-white shadow-lg px-4 py-3">
          <p className="text-sm text-slate-600">
            {selectedRows.length} product{selectedRows.length !== 1 ? "s" : ""} selected
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={openRequisition}>
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              Create Requisition
            </Button>
            <Button size="sm" onClick={openPO} className="bg-green-600 hover:bg-green-700">
              <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
              Create PO
            </Button>
          </div>
        </div>
      )}

      <NewRequisitionDialog open={reqOpen} onOpenChange={setReqOpen} prefillData={reqPrefill} />
      <NewPODialog open={poOpen} onOpenChange={setPoOpen} prefillData={poPrefill} />
    </div>
  );
}
