"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatCurrency } from "@/lib/utils";
import { Download, TrendingUp, TrendingDown } from "lucide-react";
import type { COGSReportRow } from "@/app/api/crm/reports/cogs/route";

function OverUnderCell({ cents }: { cents: number }) {
  if (cents === 0) return <span className="text-slate-400">—</span>;
  const positive = cents > 0;
  return (
    <span className={cn("flex items-center justify-end gap-0.5 tabular-nums font-medium", positive ? "text-green-600" : "text-red-600")}>
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {positive ? "+" : ""}{formatCurrency(cents)}
    </span>
  );
}

function SummaryKPI({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: "green" | "red" }) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm flex-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{label}</p>
      <p className={cn("text-xl font-bold", color === "green" ? "text-green-600" : color === "red" ? "text-red-600" : "text-slate-800")}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function downloadCSV(rows: COGSReportRow[]) {
  const headers = [
    "Service", "Jobs", "Bgt Hrs", "Act Hrs", "Hrs Var %",
    "Gross Sales", "Labor Cost", "Labor %", "Materials", "Materials %",
    "Direct Cost", "Gross Profit", "Margin %", "Avg Rev/Man Hr", "Target/Man Hr", "Avg Over/Under",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      `"${r.serviceName}"`,
      r.jobCount,
      r.budgetedHours.toFixed(1),
      r.actualStaffHrs.toFixed(1),
      r.hoursVariancePct.toFixed(1) + "%",
      (r.grossSalesCents / 100).toFixed(2),
      (r.laborCostCents / 100).toFixed(2),
      r.laborPct.toFixed(1) + "%",
      (r.materialsCostCents / 100).toFixed(2),
      r.materialsPct.toFixed(1) + "%",
      (r.directCostCents / 100).toFixed(2),
      (r.grossProfitCents / 100).toFixed(2),
      r.marginPct.toFixed(1) + "%",
      (r.avgRevPerManHrCents / 100).toFixed(2),
      (r.targetRateCents / 100).toFixed(2),
      (r.avgOverUnderCents / 100).toFixed(2),
    ].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cogs-by-service.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function COGSReportPage() {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(todayStr);

  const params = new URLSearchParams({ from, to });

  const { data, isLoading } = useQuery<{ rows: COGSReportRow[] }>({
    queryKey: ["crm-cogs-report", from, to],
    queryFn: async () => {
      const res = await fetch(`/api/crm/reports/cogs?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load report");
      return res.json() as Promise<{ rows: COGSReportRow[] }>;
    },
  });

  const rows = data?.rows ?? [];

  const totals = useMemo(() => {
    if (rows.length === 0) return null;
    return {
      jobCount: rows.reduce((s, r) => s + r.jobCount, 0),
      budgetedHours: rows.reduce((s, r) => s + r.budgetedHours, 0),
      actualStaffHrs: rows.reduce((s, r) => s + r.actualStaffHrs, 0),
      grossSalesCents: rows.reduce((s, r) => s + r.grossSalesCents, 0),
      laborCostCents: rows.reduce((s, r) => s + r.laborCostCents, 0),
      materialsCostCents: rows.reduce((s, r) => s + r.materialsCostCents, 0),
      directCostCents: rows.reduce((s, r) => s + r.directCostCents, 0),
      grossProfitCents: rows.reduce((s, r) => s + r.grossProfitCents, 0),
    };
  }, [rows]);

  const overallMarginPct = totals && totals.grossSalesCents > 0
    ? Math.round((totals.grossProfitCents / totals.grossSalesCents) * 1000) / 10
    : 0;
  const overallLaborPct = totals && totals.grossSalesCents > 0
    ? Math.round((totals.laborCostCents / totals.grossSalesCents) * 1000) / 10
    : 0;

  return (
    <div className="flex flex-col gap-5 p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Cost of Goods Sold — By Service</h1>
          <p className="text-sm text-slate-500 mt-0.5">Profitability breakdown by service type across a date range</p>
        </div>
        {rows.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => downloadCSV(rows)}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export CSV
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-end flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 text-sm w-36" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-sm w-36" />
        </div>
      </div>

      {/* Summary strip */}
      {totals && (
        <div className="flex gap-3 flex-wrap">
          <SummaryKPI label="Services" value={String(rows.length)} sub={`${totals.jobCount} total jobs`} />
          <SummaryKPI label="Gross Sales" value={formatCurrency(totals.grossSalesCents)} />
          <SummaryKPI label="Labor Cost" value={formatCurrency(totals.laborCostCents)} sub={`${overallLaborPct.toFixed(1)}% of sales`} />
          <SummaryKPI label="Materials" value={formatCurrency(totals.materialsCostCents)} />
          <SummaryKPI
            label="Gross Profit"
            value={formatCurrency(totals.grossProfitCents)}
            color={totals.grossProfitCents >= 0 ? "green" : "red"}
            sub="sales − labor − materials"
          />
          <SummaryKPI
            label="Overall Margin"
            value={`${overallMarginPct.toFixed(1)}%`}
            color={overallMarginPct >= 40 ? "green" : overallMarginPct >= 20 ? undefined : "red"}
          />
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400">
            No completed jobs in this date range.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2.5 text-left whitespace-nowrap">Service</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Jobs</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Bgt Hrs</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Act Hrs</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Hrs Var</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Gross Sales</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Labor $</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Labor %</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Materials</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Direct Cost</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">GP</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Margin</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Rev/Man Hr</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Target/Hr</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Over/Under</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.serviceId} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">{r.serviceName}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.jobCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {r.budgetedHours > 0 ? r.budgetedHours.toFixed(1) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800">{r.actualStaffHrs.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.budgetedHours > 0 ? (
                        <span className={r.hoursVariancePct <= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                          {r.hoursVariancePct > 0 ? "+" : ""}{r.hoursVariancePct.toFixed(1)}%
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                      {r.grossSalesCents > 0 ? formatCurrency(r.grossSalesCents) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatCurrency(r.laborCostCents)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {r.grossSalesCents > 0 ? `${r.laborPct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                      {r.materialsCostCents > 0 ? formatCurrency(r.materialsCostCents) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatCurrency(r.directCostCents)}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", r.grossProfitCents >= 0 ? "text-green-700" : "text-red-700")}>
                      {r.grossSalesCents > 0 ? formatCurrency(r.grossProfitCents) : "—"}
                    </td>
                    <td className={cn("px-3 py-2 text-right tabular-nums font-semibold",
                      r.marginPct >= 40 ? "text-green-600" : r.marginPct >= 20 ? "text-slate-700" : "text-red-600")}>
                      {r.grossSalesCents > 0 ? `${r.marginPct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                      {r.avgRevPerManHrCents > 0 ? formatCurrency(r.avgRevPerManHrCents) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {r.targetRateCents > 0 ? formatCurrency(r.targetRateCents) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.targetRateCents > 0 && r.avgRevPerManHrCents > 0
                        ? <OverUnderCell cents={r.avgOverUnderCents} />
                        : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              {totals && rows.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-xs">
                    <td className="px-3 py-2.5 text-slate-600">Total</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{totals.jobCount}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{totals.budgetedHours.toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{totals.actualStaffHrs.toFixed(1)}</td>
                    <td />
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{formatCurrency(totals.grossSalesCents)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{formatCurrency(totals.laborCostCents)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{overallLaborPct.toFixed(1)}%</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{formatCurrency(totals.materialsCostCents)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{formatCurrency(totals.directCostCents)}</td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums", totals.grossProfitCents >= 0 ? "text-green-700" : "text-red-700")}>
                      {formatCurrency(totals.grossProfitCents)}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums", overallMarginPct >= 40 ? "text-green-600" : overallMarginPct >= 20 ? "text-slate-700" : "text-red-600")}>
                      {overallMarginPct.toFixed(1)}%
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
