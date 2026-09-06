"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatCurrency } from "@/lib/utils";
import { isoNy, nyDateParts, ymd } from "@/lib/reports/ny-date";
import { Download, TrendingUp, TrendingDown } from "lucide-react";
import type { COGSReportRow } from "@/app/api/crm/reports/cogs/route";

function pctOf(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function ratioOf(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round(numerator / denominator) : 0;
}

function defaultDateRange() {
  const now = new Date();
  const { year, month } = nyDateParts(now);
  return { from: ymd(year, month, 1), to: isoNy(now) };
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

function downloadCSV(rows: COGSReportRow[]) {
  const headers = [
    "Service", "Visits", "Bgt Man-Hrs", "Act Man-Hrs", "Hrs Var %",
    "Gross Sales", "Labor Cost", "Labor %", "Materials", "Materials %",
    "Direct Cost", "Gross Profit", "Margin %", "Rev/Man Hr", "Target/Man Hr", "Over/Under",
    "Visits w/ Estimated Labor",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      `"${r.serviceName.replace(/"/g, '""')}"`,
      r.visitCount,
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
      r.laborEstimatedVisitCount,
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

async function fetchReport(params: URLSearchParams): Promise<{ rows: COGSReportRow[] }> {
  const res = await fetch(`/api/crm/reports/cogs?${params.toString()}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Failed to load report (${res.status})`);
  }
  return res.json() as Promise<{ rows: COGSReportRow[] }>;
}

export default function COGSReportPage() {
  const [defaults] = useState(defaultDateRange);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  const params = new URLSearchParams({ from, to });

  const { data, isLoading, error } = useQuery<{ rows: COGSReportRow[] }>({
    queryKey: ["crm-cogs-report", from, to],
    queryFn: () => fetchReport(params),
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);

  // Totals sum only additive columns; every rate/percent is a ratio of sums.
  // visitCount is NOT summed — a shared visit appears under each of its services.
  const totals = useMemo(() => {
    if (rows.length === 0) return null;
    const sum = (pick: (r: COGSReportRow) => number) => rows.reduce((s, r) => s + pick(r), 0);
    const budgetedHours = sum((r) => r.budgetedHours);
    const actualStaffHrs = sum((r) => r.actualStaffHrs);
    const grossSalesCents = sum((r) => r.grossSalesCents);
    const laborCostCents = sum((r) => r.laborCostCents);
    const materialsCostCents = sum((r) => r.materialsCostCents);
    const directCostCents = sum((r) => r.directCostCents);
    const grossProfitCents = sum((r) => r.grossProfitCents);
    return {
      budgetedHours,
      actualStaffHrs,
      hoursVariancePct: pctOf(actualStaffHrs - budgetedHours, budgetedHours),
      grossSalesCents,
      laborCostCents,
      materialsCostCents,
      directCostCents,
      grossProfitCents,
      marginPct: pctOf(grossProfitCents, grossSalesCents),
      laborPct: pctOf(laborCostCents, grossSalesCents),
      revPerManHrCents: ratioOf(grossSalesCents, actualStaffHrs),
      laborEstimatedVisitCount: sum((r) => r.laborEstimatedVisitCount),
    };
  }, [rows]);

  return (
    <div className="flex flex-col gap-5 p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Cost of Goods Sold — By Service</h1>
          <p className="text-sm text-slate-500 mt-0.5">Profitability of completed visits by service across a date range</p>
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
          <SummaryKPI label="Services" value={String(rows.length)} sub={`${totals.actualStaffHrs.toFixed(1)} man-hrs`} />
          <SummaryKPI label="Gross Sales" value={formatCurrency(totals.grossSalesCents)} />
          <SummaryKPI
            label="Labor Cost"
            value={formatCurrency(totals.laborCostCents)}
            sub={`${totals.laborPct.toFixed(1)}% of sales${totals.laborEstimatedVisitCount > 0 ? " · some estimated†" : ""}`}
          />
          <SummaryKPI label="Materials" value={formatCurrency(totals.materialsCostCents)} />
          <SummaryKPI
            label="Gross Profit"
            value={formatCurrency(totals.grossProfitCents)}
            color={totals.grossProfitCents >= 0 ? "green" : "red"}
            sub="sales − labor − materials"
          />
          <SummaryKPI
            label="Overall Margin"
            value={`${totals.marginPct.toFixed(1)}%`}
            color={totals.marginPct >= 40 ? "green" : totals.marginPct >= 20 ? undefined : "red"}
            sub={totals.revPerManHrCents > 0 ? `${formatCurrency(totals.revPerManHrCents)} / man-hr` : undefined}
          />
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400">Loading…</div>
        ) : error ? (
          <div className="flex items-center justify-center py-16 text-sm text-red-600">
            {error instanceof Error ? error.message : "Failed to load report"}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400">
            No completed visits in this date range.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2.5 text-left whitespace-nowrap">Service</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Visits</th>
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
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.visitCount}</td>
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
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700 whitespace-nowrap">
                      {formatCurrency(r.laborCostCents)}
                      {r.laborEstimatedVisitCount > 0 && (
                        <span
                          className="ml-0.5 text-amber-600"
                          title={`${r.laborEstimatedVisitCount} of ${r.visitCount} visits have estimated labor (man-hours × crew burden)`}
                        >†</span>
                      )}
                    </td>
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
                    <td className="px-3 py-2.5 text-right text-slate-300">—</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{totals.budgetedHours.toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{totals.actualStaffHrs.toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {totals.budgetedHours > 0 ? (
                        <span className={totals.hoursVariancePct <= 0 ? "text-green-600" : "text-red-600"}>
                          {totals.hoursVariancePct > 0 ? "+" : ""}{totals.hoursVariancePct.toFixed(1)}%
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{formatCurrency(totals.grossSalesCents)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{formatCurrency(totals.laborCostCents)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{totals.laborPct.toFixed(1)}%</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{formatCurrency(totals.materialsCostCents)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{formatCurrency(totals.directCostCents)}</td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums", totals.grossProfitCents >= 0 ? "text-green-700" : "text-red-700")}>
                      {formatCurrency(totals.grossProfitCents)}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums", totals.marginPct >= 40 ? "text-green-600" : totals.marginPct >= 20 ? "text-slate-700" : "text-red-600")}>
                      {totals.marginPct.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {totals.revPerManHrCents > 0 ? formatCurrency(totals.revPerManHrCents) : "—"}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="text-[11px] text-slate-400 leading-relaxed space-y-0.5">
          <p>
            Each visit completed in the window is split across its services in proportion to man-hours worked
            (even split when no hours are recorded); a visit with several services counts once under each.
            Hours are man-hours. Rev/Man Hr, percentages and the total row are ratios of the summed columns.
            Visits with no service assignments appear as &ldquo;Unassigned&rdquo;.
          </p>
          {totals && totals.laborEstimatedVisitCount > 0 && (
            <p>
              <span className="text-amber-600">†</span> Includes visits whose labor was estimated as man-hours × the crew&apos;s
              average labor burden rate because no crew clock-out recorded actual labor.
            </p>
          )}
          <p>
            Materials logged against a specific visit are charged to that visit; job-level materials are spread
            evenly across the job&apos;s completed visits.
          </p>
        </div>
      )}
    </div>
  );
}
