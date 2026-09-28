"use client";

import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { WarrantyReport } from "@/components/cmms/reports/WarrantyReport";
import { PMComplianceReport } from "@/components/cmms/reports/PMComplianceReport";
import { UptimeReport } from "@/components/cmms/reports/UptimeReport";
import { ReportStatCard as StatCard, ReportSkeletonCard as SkeletonCard } from "@/components/shared/ReportStatCard";
import { usePurchaseOrders } from "@/lib/hooks/use-purchase-orders";
import { useWorkOrders } from "@/lib/hooks/use-work-orders";
import { useParts } from "@/lib/hooks/use-parts";
import { useProducts } from "@/lib/hooks/use-products";
import { formatCurrency } from "@/lib/utils";
import type { PurchaseOrder } from "@/types";
import type { WorkOrder, Part } from "@/types/cmms";

// ─── Spend Tab ────────────────────────────────────────────────────────────────

type SpendRange = "6m" | "12m" | "all";

const SPEND_RANGE_OPTIONS: { key: SpendRange; label: string }[] = [
  { key: "6m", label: "Last 6 months" },
  { key: "12m", label: "Last 12 months" },
  { key: "all", label: "All time" },
];

function SpendTab({ purchaseOrders: allPurchaseOrders, isLoading }: { purchaseOrders: PurchaseOrder[]; isLoading: boolean }) {
  const { data: products = [] } = useProducts();
  const [range, setRange] = useState<SpendRange>("12m");

  // Canceled POs never delivered parts, so they don't count as spend. Range is by actual PO date.
  const purchaseOrders = useMemo(() => {
    const monthsBack = range === "6m" ? 6 : range === "12m" ? 12 : null;
    const now = new Date();
    const cutoff = monthsBack === null
      ? null
      : new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);
    const cutoffKey = cutoff
      ? `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`
      : null;
    return allPurchaseOrders.filter((po) => {
      if (po.status === "canceled") return false;
      if (cutoffKey === null) return true;
      return (po.poDate ?? po.createdAt).slice(0, 7) >= cutoffKey;
    });
  }, [allPurchaseOrders, range]);

  // Build product category lookup — spend charts show maintenance_part only
  const productCategoryMap = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => map.set(p.id, p.category));
    return map;
  }, [products]);

  // Sum only maintenance_part line item costs across the non-canceled POs in range
  const totalSpend = useMemo(
    () => purchaseOrders.reduce((sum, po) => {
      return sum + po.lineItems
        .filter((li) => productCategoryMap.get(li.productItemId) === "maintenance_part")
        .reduce((s, li) => s + li.quantity * li.unitCost, 0);
    }, 0),
    [purchaseOrders, productCategoryMap]
  );

  const partsPoCount = useMemo(
    () => purchaseOrders.filter((po) =>
      po.lineItems.some((li) => productCategoryMap.get(li.productItemId) === "maintenance_part")
    ).length,
    [purchaseOrders, productCategoryMap]
  );

  const avgPOValue = partsPoCount > 0 ? totalSpend / partsPoCount : 0;

  const openPOs = purchaseOrders.filter(
    (po) =>
      po.status === "requested" ||
      po.status === "pending" ||
      po.status === "approved"
  );

  // Monthly parts spend over the selected range (maintenance_part line items only)
  const monthlySpend = useMemo(() => {
    const today = new Date();
    const months: { label: string; key: string; spend: number }[] = [];
    let monthCount = range === "6m" ? 6 : 12;
    if (range === "all") {
      const earliest = purchaseOrders.reduce<string | null>((min, po) => {
        const k = (po.poDate ?? po.createdAt).slice(0, 7);
        return min === null || k < min ? k : min;
      }, null);
      if (earliest) {
        const [y, m] = earliest.split("-").map(Number);
        monthCount = Math.max(6, (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - m) + 1);
      } else {
        monthCount = 6;
      }
    }
    for (let i = monthCount - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("en-US", { month: "short", year: "2-digit" });
      months.push({ label, key, spend: 0 });
    }
    purchaseOrders.forEach((po) => {
      const poKey = (po.poDate ?? po.createdAt).slice(0, 7); // use actual PO date, not record creation date
      const bucket = months.find((m) => m.key === poKey);
      if (!bucket) return;
      po.lineItems
        .filter((li) => productCategoryMap.get(li.productItemId) === "maintenance_part")
        .forEach((li) => { bucket.spend += li.quantity * li.unitCost; });
    });
    return months.map((m) => ({ month: m.label, spend: m.spend / 100 }));
  }, [purchaseOrders, productCategoryMap, range]);

  // Spend by vendor — top 5 (maintenance_part only)
  const vendorSpend = useMemo(() => {
    const map: Record<string, number> = {};
    purchaseOrders.forEach((po) => {
      const partsTotal = po.lineItems
        .filter((li) => productCategoryMap.get(li.productItemId) === "maintenance_part")
        .reduce((s, li) => s + li.quantity * li.unitCost, 0);
      if (partsTotal > 0) map[po.vendorName] = (map[po.vendorName] ?? 0) + partsTotal;
    });
    return Object.entries(map)
      .map(([vendor, total]) => ({ vendor, spend: total / 100 }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5);
  }, [purchaseOrders, productCategoryMap]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </div>
        <div className="h-64 animate-pulse rounded-lg border bg-slate-100" />
      </div>
    );
  }

  const rangeLabel = SPEND_RANGE_OPTIONS.find((o) => o.key === range)?.label ?? "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">Excludes canceled POs</p>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as SpendRange)}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
          aria-label="Date range"
        >
          {SPEND_RANGE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Parts Spend" value={formatCurrency(totalSpend)} sub={rangeLabel} />
        <StatCard label="Avg Parts PO Value" value={formatCurrency(avgPOValue)} sub={rangeLabel} />
        <StatCard label="Total POs" value={purchaseOrders.length} />
        <StatCard label="Open POs" value={openPOs.length} />
      </div>

      {/* Monthly spend trend */}
      <div className="rounded-lg border bg-white shadow-sm p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-4">
          Parts Spend Trend ({rangeLabel})
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={monthlySpend} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 12, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              formatter={(value: number) =>
                new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
              }
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
            />
            <Area
              type="monotone"
              dataKey="spend"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#spendGradient)"
              dot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Spend by vendor */}
      <div className="rounded-lg border bg-white shadow-sm p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-4">
          Top 5 Vendors by Parts Spend ({rangeLabel})
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={vendorSpend}
            layout="vertical"
            margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
          >
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
              dataKey="vendor"
              width={160}
              tick={{ fontSize: 12, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value: number) =>
                new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
              }
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
            />
            <Bar dataKey="spend" fill="#3b82f6" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Maintenance Tab ──────────────────────────────────────────────────────────

const WO_STATUS_COLORS: Record<string, string> = {
  open: "#3b82f6",
  in_progress: "#f59e0b",
  done: "#22c55e",
  on_hold: "#a78bfa",
};

const WO_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  done: "Done",
  on_hold: "On Hold",
};

function MaintenanceTab({ workOrders, isLoading }: { workOrders: WorkOrder[]; isLoading: boolean }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const openWOs = workOrders.filter((wo) => wo.status !== "done");

  const overdueWOs = workOrders.filter(
    (wo) =>
      wo.status !== "done" &&
      wo.dueDate !== null &&
      new Date(wo.dueDate) < today
  );

  // WO by status for pie chart
  const woByStatus = useMemo(() => {
    const map: Record<string, number> = {};
    workOrders.forEach((wo) => {
      map[wo.status] = (map[wo.status] ?? 0) + 1;
    });
    return Object.entries(map).map(([status, count]) => ({
      name: WO_STATUS_LABELS[status] ?? status,
      value: count,
      status,
    }));
  }, [workOrders]);

  // WO by category
  const woByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    workOrders.forEach((wo) => {
      const cat = wo.category ?? "Uncategorized";
      map[cat] = (map[cat] ?? 0) + 1;
    });
    return Object.entries(map)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }, [workOrders]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </div>
        <div className="h-64 animate-pulse rounded-lg border bg-slate-100" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Work Orders" value={workOrders.length} />
        <StatCard label="Open WOs" value={openWOs.length} />
        <StatCard label="Overdue WOs" value={overdueWOs.length} />
        <StatCard
          label="Completion Rate"
          value={
            workOrders.length > 0
              ? `${Math.round((workOrders.filter((wo) => wo.status === "done").length / workOrders.length) * 100)}%`
              : "—"
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* WO by status — donut */}
        <div className="rounded-lg border bg-white shadow-sm p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-4">
            Work Orders by Status
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={woByStatus}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
              >
                {woByStatus.map((entry) => (
                  <Cell
                    key={entry.status}
                    fill={WO_STATUS_COLORS[entry.status] ?? "#cbd5e1"}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12, color: "#64748b" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* WO by category */}
        <div className="rounded-lg border bg-white shadow-sm p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-4">
            Work Orders by Category
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={woByCategory}
              margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="category"
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── Inventory Tab ────────────────────────────────────────────────────────────

function InventoryTab({ parts, isLoading }: { parts: Part[]; isLoading: boolean }) {
  const belowMin = parts.filter(
    (p) => p.minimumStock !== null && p.quantityOnHand < p.minimumStock
  );

  const outOfStock = parts.filter((p) => p.quantityOnHand === 0);

  // Top 10 parts by quantityOnHand for chart
  const partsChartData = useMemo(() => {
    return [...parts]
      .sort((a, b) => b.quantityOnHand - a.quantityOnHand)
      .slice(0, 10)
      .map((p) => ({
        name: p.name.length > 28 ? p.name.slice(0, 25) + "…" : p.name,
        qty: p.quantityOnHand,
        belowMin: p.minimumStock !== null && p.quantityOnHand < p.minimumStock,
      }));
  }, [parts]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
        <div className="h-80 animate-pulse rounded-lg border bg-slate-100" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Parts" value={parts.length} />
        <StatCard
          label="Below Min Stock"
          value={belowMin.length}
          sub="Need replenishment"
        />
        <StatCard label="Out of Stock" value={outOfStock.length} />
      </div>

      {/* Parts stock status */}
      <div className="rounded-lg border bg-white shadow-sm p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-4">
          Parts Stock Levels (Top 10)
        </p>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart
            data={partsChartData}
            layout="vertical"
            margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fontSize: 12, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={200}
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value: number) => [value, "Qty on Hand"]}
            />
            <Bar dataKey="qty" radius={[0, 4, 4, 0]}>
              {partsChartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.belowMin ? "#ef4444" : "#22c55e"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-3 text-xs text-slate-400">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500 mr-1" />
          Red = below minimum stock &nbsp;
          <span className="inline-block h-2 w-2 rounded-full bg-green-500 mr-1" />
          Green = adequate stock
        </p>
      </div>
    </div>
  );
}

// ─── ReportsPage ──────────────────────────────────────────────────────────────

export function ReportsPage() {
  const { data: purchaseOrders = [], isLoading: loadingPOs } = usePurchaseOrders();
  const { data: workOrders = [], isLoading: loadingWOs } = useWorkOrders();
  const { data: parts = [], isLoading: loadingParts } = useParts();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reports" description="Business analytics and reporting" />
      <Tabs defaultValue="spend">
        {/* Six tabs don't fit a phone; let the bar scroll sideways. */}
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList>
            <TabsTrigger value="spend">Spend</TabsTrigger>
            <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="pm-compliance">PM Compliance</TabsTrigger>
            <TabsTrigger value="uptime">Uptime</TabsTrigger>
            <TabsTrigger value="warranties">Warranties</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="spend" className="mt-6">
          <SpendTab purchaseOrders={purchaseOrders} isLoading={loadingPOs} />
        </TabsContent>

        <TabsContent value="maintenance" className="mt-6">
          <MaintenanceTab workOrders={workOrders} isLoading={loadingWOs} />
        </TabsContent>

        <TabsContent value="inventory" className="mt-6">
          <InventoryTab parts={parts} isLoading={loadingParts} />
        </TabsContent>

        <TabsContent value="pm-compliance" className="mt-6">
          <PMComplianceReport />
        </TabsContent>

        <TabsContent value="uptime" className="mt-6">
          <UptimeReport />
        </TabsContent>

        <TabsContent value="warranties" className="mt-6">
          <WarrantyReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}
