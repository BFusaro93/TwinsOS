"use client";

import { useMemo } from "react";
import { cn, formatCurrency } from "@/lib/utils";
import { useServiceJobCosting } from "@/lib/hooks/use-service-job-costing";

function fmtPct(bps: number) {
  const pct = bps / 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function fmtHours(n: number) {
  return `${n.toFixed(1)}h`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export function ServiceJobCostingTab({ serviceId }: { serviceId: string }) {
  const { data: rows = [], isLoading } = useServiceJobCosting(serviceId);

  const stats = useMemo(() => {
    const jobCount = rows.length;
    const totalRevenueCents = rows.reduce((s, r) => s + r.revenueCents, 0);
    const totalBudgetedHours = rows.reduce((s, r) => s + r.budgetedHours, 0);
    const totalActualManHours = rows.reduce((s, r) => s + r.actualManHours, 0);
    const hoursVarianceBps = totalBudgetedHours > 0
      ? Math.round(((totalActualManHours - totalBudgetedHours) / totalBudgetedHours) * 10000)
      : null;

    const rateRows = rows.filter((r) => r.budgetMethod === "production_rate" && r.rateVarianceBps != null);
    const avgRateVarianceBps = rateRows.length > 0
      ? Math.round(rateRows.reduce((s, r) => s + (r.rateVarianceBps ?? 0), 0) / rateRows.length)
      : null;

    return { jobCount, totalRevenueCents, totalBudgetedHours, totalActualManHours, hoursVarianceBps, avgRateVarianceBps, rateRowCount: rateRows.length };
  }, [rows]);

  if (isLoading) {
    return <p className="py-6 text-center text-sm text-slate-400">Loading job costing data…</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-400">
        No completed jobs using this service yet — data appears here once jobs with this service are marked complete.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryCard label="Completed Jobs" value={stats.jobCount.toLocaleString()} />
        <SummaryCard label="Total Revenue" value={formatCurrency(stats.totalRevenueCents)} />
        <SummaryCard
          label="Budgeted vs Actual Hours"
          value={`${fmtHours(stats.totalBudgetedHours)} / ${fmtHours(stats.totalActualManHours)}`}
          sub={stats.hoursVarianceBps != null ? `${fmtPct(stats.hoursVarianceBps)} vs budget` : undefined}
        />
        <SummaryCard
          label="Avg Rate Accuracy"
          value={stats.avgRateVarianceBps != null ? fmtPct(stats.avgRateVarianceBps) : "—"}
          sub={stats.rateRowCount > 0 ? `${stats.rateRowCount} production-rate job${stats.rateRowCount === 1 ? "" : "s"}` : "No production-rate jobs"}
        />
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b font-semibold text-slate-500 uppercase tracking-wide">
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Client</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Budgeted Hrs</th>
              <th className="px-3 py-2 text-right">Actual Hrs</th>
              <th className="px-3 py-2 text-right">Rate Variance</th>
              <th className="px-3 py-2 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-3 py-1.5 text-slate-600">{fmtDate(r.scheduledDate)}</td>
                <td className="px-3 py-1.5 text-slate-700">{r.clientName}</td>
                <td className="px-3 py-1.5 text-right text-slate-600">{r.qty}</td>
                <td className="px-3 py-1.5 text-right text-slate-600">{fmtHours(r.budgetedHours)}</td>
                <td className="px-3 py-1.5 text-right text-slate-600">{fmtHours(r.actualManHours)}</td>
                <td className="px-3 py-1.5 text-right">
                  {r.budgetMethod === "production_rate" && r.rateVarianceBps != null ? (
                    <span className={cn(r.rateVarianceBps < 0 ? "text-red-500" : "text-green-600")}>
                      {fmtPct(r.rateVarianceBps)}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right font-medium text-slate-900">{formatCurrency(r.revenueCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-slate-400">
        Rate Variance is actual vs. assumed production rate, only shown for services budgeted with the
        Production Rate method. Negative means the job took longer than the assumed rate predicted.
      </p>
    </div>
  );
}
