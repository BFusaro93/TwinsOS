"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { WOCostKind, WOCostSummary } from "@/lib/hooks/use-wo-cost-summary";
import { formatCurrency, formatDate } from "@/lib/utils";

export type RepairCostDetailKind = WOCostKind | "all";

const TITLES: Record<RepairCostDetailKind, string> = {
  all: "Total Repair Spend",
  parts: "Parts",
  labor: "Labor",
  vendor: "Vendors / Subs",
};

const KIND_LABELS: Record<WOCostKind, string> = { parts: "Part", labor: "Labor", vendor: "Vendor" };

interface RepairCostDetailDialogProps {
  kind: RepairCostDetailKind | null;
  workOrders: WOCostSummary[];
  rangeLabel: string;
  onClose: () => void;
}

/** The individual cost lines that add up to one of the Repair Cost stat cards. */
export function RepairCostDetailDialog({ kind, workOrders, rangeLabel, onClose }: RepairCostDetailDialogProps) {
  const rows = useMemo(() => {
    if (!kind) return [];
    return workOrders
      .flatMap((w) =>
        w.lines
          .filter((l) => kind === "all" || l.kind === kind)
          .map((l) => ({ ...l, wo: w }))
      )
      .filter((r) => r.cents !== 0)
      .sort((a, b) => b.wo.costAt.localeCompare(a.wo.costAt) || b.cents - a.cents);
  }, [kind, workOrders]);

  const total = rows.reduce((s, r) => s + r.cents, 0);

  return (
    <Dialog open={kind !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{kind ? TITLES[kind] : ""} — line items</DialogTitle>
          <DialogDescription>
            {rangeLabel} · {rows.length} {rows.length === 1 ? "line" : "lines"} · {formatCurrency(total)}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[calc(85vh-96px)] overflow-auto px-6 pb-6">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No costs recorded in this range</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Date</th>
                  <th className="py-2 pr-3 font-semibold">Work order</th>
                  <th className="py-2 pr-3 font-semibold">Asset</th>
                  {kind === "all" && <th className="py-2 pr-3 font-semibold">Type</th>}
                  <th className="py-2 pr-3 font-semibold">Item</th>
                  <th className="py-2 pr-3 text-right font-semibold">Basis</th>
                  <th className="py-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={`${r.kind}-${r.id}`}>
                    <td className="whitespace-nowrap py-2 pr-3 text-slate-500">{formatDate(r.wo.costAt)}</td>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/cmms/work-orders?id=${r.wo.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {r.wo.workOrderNumber}
                      </Link>
                      <span className="block max-w-[14rem] truncate text-xs text-slate-400">{r.wo.title}</span>
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{r.wo.assetName ?? "No asset"}</td>
                    {kind === "all" && <td className="py-2 pr-3 text-slate-500">{KIND_LABELS[r.kind]}</td>}
                    <td className="py-2 pr-3 text-slate-700">
                      {r.label}
                      {r.detail && <span className="block max-w-[16rem] truncate text-xs text-slate-400">{r.detail}</span>}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right text-slate-500">{r.basis}</td>
                    <td className="whitespace-nowrap py-2 text-right font-medium text-slate-900">{formatCurrency(r.cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
