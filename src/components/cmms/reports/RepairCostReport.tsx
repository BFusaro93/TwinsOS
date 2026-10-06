"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ReportSkeletonCard, ReportStatCard } from "@/components/shared/ReportStatCard";
import { useWOCostSummary } from "@/lib/hooks/use-wo-cost-summary";
import { SPEND_RANGE_OPTIONS, rangeCutoffKey, rangeMonths, type SpendRange } from "@/lib/utils/spend-range";
import { formatCurrency } from "@/lib/utils";
import { RepairCostDetailDialog, type RepairCostDetailKind } from "./RepairCostDetailDialog";

const COLORS = { parts: "#3b82f6", labor: "#22c55e", vendor: "#f59e0b" };

const usd = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

const pct = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)}% of total` : "—");

/** Total repair & maintenance cost recorded on work orders: parts + labor + vendor/sub charges. */
export function RepairCostReport() {
  const { data: allWOs = [], isLoading } = useWOCostSummary();
  const [range, setRange] = useState<SpendRange>("12m");
  const [detailKind, setDetailKind] = useState<RepairCostDetailKind | null>(null);

  const wos = useMemo(() => {
    const cutoffKey = rangeCutoffKey(range);
    return allWOs.filter((w) => cutoffKey === null || w.costAt.slice(0, 7) >= cutoffKey);
  }, [allWOs, range]);

  const totals = useMemo(() => {
    const t = { parts: 0, labor: 0, vendor: 0, withCost: 0 };
    for (const w of wos) {
      t.parts += w.partsCents;
      t.labor += w.laborCents;
      t.vendor += w.vendorCents;
      if (w.partsCents + w.laborCents + w.vendorCents > 0) t.withCost += 1;
    }
    return { ...t, total: t.parts + t.labor + t.vendor };
  }, [wos]);

  const monthly = useMemo(() => {
    const earliest = wos.reduce<string | null>((min, w) => {
      const k = w.costAt.slice(0, 7);
      return min === null || k < min ? k : min;
    }, null);
    const months = rangeMonths(range, earliest).map((m) => ({ ...m, parts: 0, labor: 0, vendor: 0 }));
    for (const w of wos) {
      const bucket = months.find((m) => m.key === w.costAt.slice(0, 7));
      if (!bucket) continue;
      bucket.parts += w.partsCents;
      bucket.labor += w.laborCents;
      bucket.vendor += w.vendorCents;
    }
    return months.map((m) => ({
      month: m.label,
      Parts: m.parts / 100,
      Labor: m.labor / 100,
      "Vendors / Subs": m.vendor / 100,
    }));
  }, [wos, range]);

  const byAsset = useMemo(() => {
    const map = new Map<string, { name: string; total: number }>();
    for (const w of wos) {
      const cents = w.partsCents + w.laborCents + w.vendorCents;
      if (cents === 0) continue;
      const key = w.assetId ?? "none";
      const row = map.get(key) ?? { name: w.assetName ?? "No asset", total: 0 };
      row.total += cents;
      map.set(key, row);
    }
    return [...map.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map((r) => ({ asset: r.name, spend: r.total / 100 }));
  }, [wos]);

  const preventive = useMemo(
    () => wos.filter((w) => w.isPreventive).reduce((s, w) => s + w.partsCents + w.laborCents + w.vendorCents, 0),
    [wos]
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <ReportSkeletonCard key={i} />)}
        </div>
        <div className="h-64 animate-pulse rounded-lg border bg-muted" />
      </div>
    );
  }

  const rangeLabel = SPEND_RANGE_OPTIONS.find((o) => o.key === range)?.label ?? "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400 dark:text-neutral-500">
          Parts, labor and vendor charges on work orders, dated by completion. Excludes skipped work orders.
        </p>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as SpendRange)}
          className="shrink-0 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-slate-700 dark:text-neutral-300"
          aria-label="Date range"
        >
          {SPEND_RANGE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <ReportStatCard
          label="Total Repair Spend"
          value={formatCurrency(totals.total)}
          sub={`${rangeLabel} · ${totals.withCost} work ${totals.withCost === 1 ? "order" : "orders"}`}
          onClick={() => setDetailKind("all")}
        />
        <ReportStatCard label="Parts" value={formatCurrency(totals.parts)} sub={pct(totals.parts, totals.total)} onClick={() => setDetailKind("parts")} />
        <ReportStatCard label="Labor" value={formatCurrency(totals.labor)} sub={pct(totals.labor, totals.total)} onClick={() => setDetailKind("labor")} />
        <ReportStatCard label="Vendors / Subs" value={formatCurrency(totals.vendor)} sub={pct(totals.vendor, totals.total)} onClick={() => setDetailKind("vendor")} />
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        Preventive maintenance: {formatCurrency(preventive)} · Reactive: {formatCurrency(totals.total - preventive)}
      </p>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
          Repair Spend by Month ({rangeLabel})
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={monthly} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 12, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              formatter={(value: number) => usd(value)}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Parts" stackId="cost" fill={COLORS.parts} />
            <Bar dataKey="Labor" stackId="cost" fill={COLORS.labor} />
            <Bar dataKey="Vendors / Subs" stackId="cost" fill={COLORS.vendor} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
          Top 5 Assets by Repair Spend ({rangeLabel})
        </p>
        {byAsset.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400 dark:text-neutral-500">No costs recorded on work orders in this range</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byAsset} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 12, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
              />
              <YAxis
                type="category"
                dataKey="asset"
                width={160}
                tick={{ fontSize: 12, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value: number) => usd(value)}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              />
              <Bar dataKey="spend" fill={COLORS.parts} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <RepairCostDetailDialog
        kind={detailKind}
        workOrders={wos}
        rangeLabel={rangeLabel}
        onClose={() => setDetailKind(null)}
      />
    </div>
  );
}
