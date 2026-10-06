"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { PageHeader } from "@/components/shared/PageHeader";
import { usePurchaseOrders } from "@/lib/hooks/use-purchase-orders";
import { useProducts } from "@/lib/hooks/use-products";
import { formatCurrency } from "@/lib/utils";
import { useOrgDates } from "@/lib/hooks/use-org-timezone";

// Month buckets are plain "YYYY-MM" strings on the ORG's calendar (not the
// viewer's laptop clock and not UTC), so a PO dated/created near month end
// lands in the same month the rest of the app shows it in.
function monthKeyFromYmd(ymd: string): { key: string; label: string } {
  const key = ymd.slice(0, 7);
  const [y, m] = key.split("-").map(Number);
  return {
    key,
    // Date.UTC + timeZone UTC: the label is derived from the key alone.
    label: new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }),
  };
}

function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ name: string; cents: number }>;
}) {
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <p className="border-b px-5 py-3 text-sm font-semibold text-slate-800 dark:text-neutral-100">{title}</p>
      <div className="divide-y max-h-96 overflow-auto">
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-center text-xs text-slate-400 dark:text-neutral-500">No maintenance parts spend this month</p>
        ) : (
          rows.map((r) => (
            <div key={r.name} className="flex items-center justify-between px-5 py-2.5 text-sm">
              <span className="text-slate-700 dark:text-neutral-300 truncate pr-4">{r.name}</span>
              <span className="shrink-0 font-medium tabular-nums text-slate-900 dark:text-neutral-100">{formatCurrency(r.cents)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function PartsSpendReportPage() {
  const { data: purchaseOrders = [] } = usePurchaseOrders();
  const { data: products = [] } = useProducts();
  const { today: orgToday, toISODate } = useOrgDates();
  const currentMonthKey = orgToday().slice(0, 7);

  // poDate is a calendar date; createdAt is an instant, so convert it to the
  // org's calendar day before bucketing.
  const poMonth = (po: { poDate?: string | null; createdAt: string }) =>
    po.poDate ? po.poDate.slice(0, 7) : toISODate(new Date(po.createdAt)).slice(0, 7);

  const productCategoryMap = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => map.set(p.id, p.category));
    return map;
  }, [products]);

  // Part-only lines (no catalog product, linked straight to a part) are
  // maintenance parts too; a line with neither is Uncategorized and excluded.
  const isMaintenancePartLine = (li: { productItemId?: string | null; partId?: string | null }) => {
    if (li.productItemId) return productCategoryMap.get(li.productItemId) === "maintenance_part";
    return !!li.partId;
  };

  // Only POs actually placed with the vendor count as spend — "requested"/
  // "pending"/"approved" haven't been ordered yet, and "rejected"/"canceled"
  // never will be. ("draft" isn't a real purchase_orders status; the old
  // filter here excluding it was dead code copied from requisition-status
  // filtering, which let requested/pending/approved/rejected POs all count.)
  const orderedPOs = useMemo(
    () => purchaseOrders.filter((po) => ["ordered", "partially_fulfilled", "completed"].includes(po.status)),
    [purchaseOrders]
  );

  // ── Monthly trend (last 12 months, maintenance_part line items only) ────────
  const monthlyTrend = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) =>
      monthKeyFromYmd(`${shiftMonthKey(currentMonthKey, i - 11)}-01`)
    );
    const spendByMonth: Record<string, number> = {};
    for (const m of months) spendByMonth[m.key] = 0;

    orderedPOs.forEach((po) => {
      const mk = poMonth(po);
      if (!(mk in spendByMonth)) return;
      po.lineItems
        .filter(isMaintenancePartLine)
        .forEach((li) => { spendByMonth[mk] += Math.round(li.quantity * li.unitCost); });
    });

    return months.map(({ key, label }) => ({ key, month: label, spend: spendByMonth[key] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedPOs, productCategoryMap, currentMonthKey, toISODate]);

  const [selectedMonth, setSelectedMonth] = useState(() => currentMonthKey);
  const selectedLabel = monthlyTrend.find((m) => m.key === selectedMonth)?.month ?? selectedMonth;

  // ── By vendor / by part breakdown for the selected month ────────────────────
  const breakdown = useMemo(() => {
    const byVendor = new Map<string, number>();
    const byPart = new Map<string, number>();

    orderedPOs
      .filter((po) => poMonth(po) === selectedMonth)
      .forEach((po) => {
        po.lineItems
          .filter(isMaintenancePartLine)
          .forEach((li) => {
            const lineTotal = Math.round(li.quantity * li.unitCost);
            if (lineTotal === 0) return;
            byVendor.set(po.vendorName, (byVendor.get(po.vendorName) ?? 0) + lineTotal);
            const partKey = li.productItemName || li.partNumber || "Unknown part";
            byPart.set(partKey, (byPart.get(partKey) ?? 0) + lineTotal);
          });
      });

    const toSortedRows = (m: Map<string, number>) =>
      [...m.entries()].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents);

    const vendorRows = toSortedRows(byVendor);
    const total = vendorRows.reduce((s, r) => s + r.cents, 0);

    return { vendorRows, partRows: toSortedRows(byPart), total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedPOs, productCategoryMap, selectedMonth, toISODate]);

  return (
    <div className="flex h-full flex-col overflow-auto">
      <PageHeader
        title="Parts Spend Report"
        description="Maintenance parts spend (PO line items), broken down by month, vendor, and part."
      />
      <div className="flex-1 p-6 space-y-6">
        {/* Monthly trend */}
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="mb-4 text-sm font-semibold text-slate-800 dark:text-neutral-100">Monthly Spend — Last 12 Months</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={monthlyTrend}
              margin={{ top: 0, right: 4, left: -20, bottom: 0 }}
              onClick={(e) => {
                const key = e?.activePayload?.[0]?.payload?.key;
                if (key) setSelectedMonth(key);
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={(v) => `$${(v / 100000).toFixed(0)}k`}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip formatter={(v: number) => [formatCurrency(v), "Spend"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="spend" radius={[4, 4, 0, 0]} cursor="pointer">
                {monthlyTrend.map((m) => (
                  <Cell key={m.key} fill={m.key === selectedMonth ? "#60ab45" : "#bbf7d0"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-2 text-xs text-slate-400 dark:text-neutral-500">Click a bar to see that month&rsquo;s vendor/part breakdown below.</p>
        </div>

        {/* Month selector + total */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-neutral-100">
            {selectedLabel} breakdown — <span className="tabular-nums">{formatCurrency(breakdown.total)}</span>
          </h2>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="rounded-md border border-border px-2 py-1.5 text-sm text-slate-700 dark:text-neutral-300"
          >
            {monthlyTrend.map((m) => (
              <option key={m.key} value={m.key}>{m.month}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <BreakdownTable title="By Vendor" rows={breakdown.vendorRows} />
          <BreakdownTable title="By Part" rows={breakdown.partRows} />
        </div>
      </div>
    </div>
  );
}
