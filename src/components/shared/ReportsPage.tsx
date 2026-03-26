"use client";

import { useMemo } from "react";
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
import { usePurchaseOrders } from "@/lib/hooks/use-purchase-orders";
import { useWorkOrders } from "@/lib/hooks/use-work-orders";
import { useParts } from "@/lib/hooks/use-parts";
import { formatCurrency } from "@/lib/utils";
import type { PurchaseOrder } from "@/types";
import type { WorkOrder, Part } from "@/types/cmms";

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
}

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="rounded-lg border bg-white shadow-sm p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function SkeletonCard() {
  return <div className="h-24 animate-pulse rounded-lg border bg-slate-100" />;
}

// ─── Spend Tab ────────────────────────────────────────────────────────────────

function SpendTab({ purchaseOrders, isLoading }: { purchaseOrders: PurchaseOrder[]; isLoading: boolean }) {
  const totalSpend = useMemo(
    () => purchaseOrders.reduce((sum, po) => sum + po.grandTotal, 0),
    [purchaseOrders]
  );

  const avgPOValue = purchaseOrders.length > 0 ? totalSpend / purchaseOrders.length : 0;

  const openPOs = purchaseOrders.filter(
    (po) =>
      po.status === "requested" ||
      po.status === "pending" ||
      po.status === "approved"
  );

  // Monthly spend — last 6 months
  const monthlySpend = useMemo(() => {
    const today = new Date();
    const months: { label: string; key: string; spend: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("en-US", { month: "short", year: "2-digit" });
      months.push({ label, key, spend: 0 });
    }
    purchaseOrders.forEach((po) => {
      const poKey = po.createdAt.slice(0, 7);
      const bucket = months.find((m) => m.key === poKey);
      if (bucket) bucket.spend += po.grandTotal;
    });
    return months.map((m) => ({ month: m.label, spend: m.spend / 100 }));
  }, [purchaseOrders]);

  // Spend by vendor — top 5
  const vendorSpend = useMemo(() => {
    const map: Record<string, number> = {};
    purchaseOrders.forEach((po) => {
      map[po.vendorName] = (map[po.vendorName] ?? 0) + po.grandTotal;
    });
    return Object.entries(map)
      .map(([vendor, total]) => ({ vendor, spend: total / 100 }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5);
  }, [purchaseOrders]);

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
        <StatCard label="Total PO Spend" value={formatCurrency(totalSpend)} />
        <StatCard label="Avg PO Value" value={formatCurrency(avgPOValue)} />
        <StatCard label="Total POs" value={purchaseOrders.length} />
        <StatCard label="Open POs" value={openPOs.length} />
      </div>

      {/* Monthly spend trend */}
      <div className="rounded-lg border bg-white shadow-sm p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-4">
          Monthly Spend Trend (Last 6 Months)
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
          Top 5 Vendors by Spend
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
        <TabsList>
          <TabsTrigger value="spend">Spend</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
        </TabsList>

        <TabsContent value="spend" className="mt-6">
          <SpendTab purchaseOrders={purchaseOrders} isLoading={loadingPOs} />
        </TabsContent>

        <TabsContent value="maintenance" className="mt-6">
          <MaintenanceTab workOrders={workOrders} isLoading={loadingWOs} />
        </TabsContent>

        <TabsContent value="inventory" className="mt-6">
          <InventoryTab parts={parts} isLoading={loadingParts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
