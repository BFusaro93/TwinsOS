"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatCurrency } from "@/lib/utils";
import { useCRMServices } from "@/lib/hooks/use-crm-jobs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { JobCostingReportRow } from "@/app/api/crm/reports/job-costing/route";

function fmtHrs(h: number) {
  return h.toFixed(1);
}

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

function downloadCSV(rows: JobCostingReportRow[]) {
  const headers = [
    "Date", "Client", "Job", "Service", "Men", "Bgt Hrs", "Act Hrs", "Staff Hrs",
    "Hrs Variance", "Bgt Rate", "Rev/Man Hr", "Target/Man Hr", "Over/Under",
    "Labor Cost", "Est Revenue", "Materials", "Gross Profit", "Margin %",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.completedAt ? new Date(r.completedAt).toLocaleDateString() : "",
      `"${r.clientName}"`,
      `"${r.jobTitle}"`,
      `"${r.serviceName}"`,
      r.menCount,
      r.budgetedHours.toFixed(1),
      r.actualHours.toFixed(1),
      r.actualStaffHrs.toFixed(1),
      r.hoursVariance.toFixed(1),
      (r.budgetedRateCents / 100).toFixed(2),
      (r.revPerManHrCents / 100).toFixed(2),
      (r.targetRateCents / 100).toFixed(2),
      (r.overUnderCents / 100).toFixed(2),
      (r.actualLaborCostCents / 100).toFixed(2),
      (r.estimatedRevenueCents / 100).toFixed(2),
      (r.actualMaterialCostCents / 100).toFixed(2),
      (r.grossProfitCents / 100).toFixed(2),
      r.marginPct.toFixed(1),
    ].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "job-costing-report.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function JobCostingReportPage() {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(todayStr);
  const [serviceId, setServiceId] = useState<string>("all");

  const { data: services = [] } = useCRMServices();

  const params = new URLSearchParams({ from, to });
  if (serviceId !== "all") params.set("service_id", serviceId);

  const { data, isLoading } = useQuery<{ rows: JobCostingReportRow[] }>({
    queryKey: ["crm-job-costing-report", from, to, serviceId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/reports/job-costing?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load report");
      return res.json() as Promise<{ rows: JobCostingReportRow[] }>;
    },
  });

  const rows = data?.rows ?? [];

  const summary = useMemo(() => {
    if (rows.length === 0) return null;
    const totalRevenue = rows.reduce((s, r) => s + r.estimatedRevenueCents, 0);
    const totalLabor = rows.reduce((s, r) => s + r.actualLaborCostCents, 0);
    const totalMaterials = rows.reduce((s, r) => s + r.actualMaterialCostCents, 0);
    const totalProfit = rows.reduce((s, r) => s + r.grossProfitCents, 0);
    const avgMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 1000) / 10 : 0;
    const avgRevPerManHr = rows.filter(r => r.revPerManHrCents > 0);
    const avgRev = avgRevPerManHr.length > 0
      ? Math.round(avgRevPerManHr.reduce((s, r) => s + r.revPerManHrCents, 0) / avgRevPerManHr.length)
      : 0;
    return { totalRevenue, totalLabor, totalMaterials, totalProfit, avgMargin, avgRev };
  }, [rows]);

  return (
    <div className="flex flex-col gap-5 p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Job Costing Report</h1>
          <p className="text-sm text-slate-500 mt-0.5">Estimated vs. actual performance by job</p>
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
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Service</label>
          <Select value={serviceId} onValueChange={setServiceId}>
            <SelectTrigger className="h-8 text-sm w-48">
              <SelectValue placeholder="All services" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All services</SelectItem>
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary strip */}
      {summary && (
        <div className="flex gap-3 flex-wrap">
          <SummaryKPI label="Est. Revenue" value={formatCurrency(summary.totalRevenue)} sub={`${rows.length} jobs`} />
          <SummaryKPI label="Actual Labor" value={formatCurrency(summary.totalLabor)} />
          <SummaryKPI label="Actual Materials" value={formatCurrency(summary.totalMaterials)} />
          <SummaryKPI
            label="Gross Profit"
            value={formatCurrency(summary.totalProfit)}
            color={summary.totalProfit >= 0 ? "green" : "red"}
            sub="revenue − labor − materials"
          />
          <SummaryKPI
            label="Avg Margin"
            value={`${summary.avgMargin.toFixed(1)}%`}
            color={summary.avgMargin >= 40 ? "green" : summary.avgMargin >= 20 ? undefined : "red"}
          />
          <SummaryKPI
            label="Avg Rev / Man Hr"
            value={summary.avgRev > 0 ? formatCurrency(summary.avgRev) : "—"}
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
                  <th className="px-3 py-2.5 text-left whitespace-nowrap">Date</th>
                  <th className="px-3 py-2.5 text-left whitespace-nowrap">Client</th>
                  <th className="px-3 py-2.5 text-left whitespace-nowrap">Service</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Men</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Bgt Hrs</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Act Hrs</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Var</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Bgt $/Hr</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Rev/Man Hr</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Target/Hr</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Over/Under</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Labor $</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Revenue</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Materials</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">GP</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Margin</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const hrsPositive = r.hoursVariance <= 0;
                  const marginGood = r.marginPct >= 40;
                  return (
                    <tr key={r.visitId} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                        {r.completedAt ? new Date(r.completedAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-800 max-w-[140px] truncate">
                        {r.clientName}
                      </td>
                      <td className="px-3 py-2 text-slate-600 max-w-[120px] truncate">{r.serviceName}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.menCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                        {r.budgetedHours > 0 ? fmtHrs(r.budgetedHours) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-800">{fmtHrs(r.actualStaffHrs)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.budgetedHours > 0 ? (
                          <span className={hrsPositive ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                            {r.hoursVariance > 0 ? "+" : ""}{fmtHrs(r.hoursVariance)}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                        {r.budgetedRateCents > 0 ? formatCurrency(r.budgetedRateCents) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                        {r.revPerManHrCents > 0 ? formatCurrency(r.revPerManHrCents) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                        {r.targetRateCents > 0 ? formatCurrency(r.targetRateCents) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <OverUnderCell cents={r.overUnderCents} />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {formatCurrency(r.actualLaborCostCents)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {r.estimatedRevenueCents > 0 ? formatCurrency(r.estimatedRevenueCents) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                        {r.actualMaterialCostCents > 0 ? formatCurrency(r.actualMaterialCostCents) : "—"}
                      </td>
                      <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", r.grossProfitCents >= 0 ? "text-green-700" : "text-red-700")}>
                        {r.estimatedRevenueCents > 0 ? formatCurrency(r.grossProfitCents) : "—"}
                      </td>
                      <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", marginGood ? "text-green-600" : r.marginPct >= 20 ? "text-slate-700" : "text-red-600")}>
                        {r.estimatedRevenueCents > 0 ? `${r.marginPct.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {rows.length > 1 && summary && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                    <td colSpan={4} className="px-3 py-2.5 text-xs text-slate-600">{rows.length} jobs</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                      {fmtHrs(rows.reduce((s, r) => s + r.budgetedHours, 0))}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">
                      {fmtHrs(rows.reduce((s, r) => s + r.actualStaffHrs, 0))}
                    </td>
                    <td colSpan={4} />
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {formatCurrency(summary.totalLabor)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {formatCurrency(summary.totalRevenue)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                      {formatCurrency(summary.totalMaterials)}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums", summary.totalProfit >= 0 ? "text-green-700" : "text-red-700")}>
                      {formatCurrency(summary.totalProfit)}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums", summary.avgMargin >= 40 ? "text-green-600" : summary.avgMargin >= 20 ? "text-slate-700" : "text-red-600")}>
                      {summary.avgMargin.toFixed(1)}%
                    </td>
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
