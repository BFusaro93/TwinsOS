"use client";

import { useMemo } from "react";
import {
  ShoppingCart,
  Clock,
  FileText,
  DollarSign,
  Wrench,
  AlertTriangle,
  Calendar,
  CheckCircle2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { useRequisitions } from "@/lib/hooks/use-requisitions";
import { usePurchaseOrders } from "@/lib/hooks/use-purchase-orders";
import { useWorkOrders } from "@/lib/hooks/use-work-orders";
import { useAssets } from "@/lib/hooks/use-assets";
import { usePMSchedules } from "@/lib/hooks/use-pm-schedules";
import { useRecentActivityFeed } from "@/lib/hooks/use-audit-log";
import { formatCurrency, getInitials, getAvatarColor, relativeTime } from "@/lib/utils";

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  work_order: "Work Order",
  po: "Purchase Order",
  receiving: "Goods Receipt",
  requisition: "Requisition",
  part: "Part",
  asset: "Asset",
  vehicle: "Vehicle",
  project: "Project",
  pm_schedule: "PM Schedule",
};

/** Returns the ISO week string "MMM Wn" for a given date, e.g. "Mar W2" */
function weekLabel(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay() + 1); // Monday of that week
  const month = d.toLocaleString("en-US", { month: "short" });
  // Week-of-month: which Monday is this in the month (1-indexed)
  const firstMonday = new Date(d.getFullYear(), d.getMonth(), 1);
  while (firstMonday.getDay() !== 1) firstMonday.setDate(firstMonday.getDate() + 1);
  const weekNum = Math.floor((d.getDate() - firstMonday.getDate()) / 7) + 1;
  return `${month} W${weekNum}`;
}

/** Returns "MMM" label and "YYYY-MM" key for a date */
function monthKey(date: Date): { key: string; label: string } {
  return {
    key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
    label: date.toLocaleString("en-US", { month: "short" }),
  };
}

export default function DashboardPage() {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  const { data: requisitions = [] } = useRequisitions();
  const { data: purchaseOrders = [] } = usePurchaseOrders();
  const { data: workOrders = [] } = useWorkOrders();
  const { data: assets = [] } = useAssets();
  const { data: pmSchedules = [] } = usePMSchedules();
  const { data: activityFeed = [] } = useRecentActivityFeed(8);

  // ── Purchasing KPIs ─────────────────────────────────────────────────────────
  const poKPIs = useMemo(() => {
    const mtdStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
    const openRequisitions = requisitions.filter(
      (r) => !["closed", "rejected", "ordered"].includes(r.status)
    ).length;
    const pendingApproval = requisitions.filter((r) => r.status === "pending_approval").length;
    const openPOs = purchaseOrders.filter(
      (po) => !["closed", "canceled", "completed"].includes(po.status)
    ).length;
    const totalSpendMTD = purchaseOrders
      .filter(
        (po) =>
          !["canceled", "draft"].includes(po.status) &&
          (po.poDate ?? po.createdAt).slice(0, 10) >= mtdStart
      )
      .reduce((sum, po) => sum + po.grandTotal, 0);
    return { openRequisitions, pendingApproval, openPOs, totalSpendMTD };
  }, [requisitions, purchaseOrders, today]);

  // ── Maintenance KPIs ────────────────────────────────────────────────────────
  const cmmsKPIs = useMemo(() => {
    const openWorkOrders = workOrders.filter((wo) => wo.status !== "done").length;
    const highPriority = workOrders.filter(
      (wo) => wo.status !== "done" && (wo.priority === "high" || wo.priority === "critical")
    ).length;
    const overdueWOs = workOrders.filter(
      (wo) =>
        wo.status !== "done" &&
        wo.dueDate !== null &&
        wo.dueDate.slice(0, 10) < todayIso
    ).length;
    const activePMs = pmSchedules.filter((pm) => pm.isActive);
    const onTimePMs = activePMs.filter((pm) => pm.nextDueDate.slice(0, 10) >= todayIso).length;
    const pmComplianceRate =
      activePMs.length > 0 ? Math.round((onTimePMs / activePMs.length) * 100) : 100;
    const assetsInService = assets.filter((a) => a.status === "active").length;
    return { openWorkOrders, highPriority, overdueWOs, pmComplianceRate, assetsInService };
  }, [workOrders, pmSchedules, assets, todayIso]);

  // ── Monthly Spend (last 6 calendar months) ──────────────────────────────────
  const monthlySpend = useMemo(() => {
    const months: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push(monthKey(d));
    }
    const spendByMonth: Record<string, number> = {};
    for (const m of months) spendByMonth[m.key] = 0;

    purchaseOrders
      .filter((po) => !["canceled", "draft"].includes(po.status))
      .forEach((po) => {
        // Use poDate (actual PO date) if set, fall back to createdAt — matches Spend MTD logic
        const mk = (po.poDate ?? po.createdAt).slice(0, 7); // "YYYY-MM"
        if (mk in spendByMonth) spendByMonth[mk] += po.grandTotal;
      });

    return months.map(({ key, label }) => ({ month: label, spend: spendByMonth[key] }));
  }, [purchaseOrders, today]);

  // ── WO Trend (last 7 calendar weeks) ────────────────────────────────────────
  const woTrend = useMemo(() => {
    // Build the last 7 week labels (Monday-anchored)
    const weeks: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i * 7);
      const lbl = weekLabel(d);
      if (!weeks.includes(lbl)) weeks.push(lbl);
    }

    const created: Record<string, number> = {};
    const completed: Record<string, number> = {};
    for (const w of weeks) { created[w] = 0; completed[w] = 0; }

    workOrders.forEach((wo) => {
      const createdLbl = weekLabel(new Date(wo.createdAt));
      if (createdLbl in created) created[createdLbl]++;
      if (wo.status === "done") {
        const doneLbl = weekLabel(new Date(wo.updatedAt));
        if (doneLbl in completed) completed[doneLbl]++;
      }
    });

    return weeks.map((w) => ({ week: w, created: created[w], completed: completed[w] }));
  }, [workOrders, today]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="Operational overview for Twins Lawn Service"
      />

      {/* Purchasing KPIs */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
          Purchasing
        </p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard title="Open Requisitions" value={poKPIs.openRequisitions} icon={FileText} href="/po/requisitions" />
          <StatCard title="Pending Approval" value={poKPIs.pendingApproval} icon={Clock} href="/po/requisitions" />
          <StatCard title="Open Purchase Orders" value={poKPIs.openPOs} icon={ShoppingCart} href="/po/orders" />
          <StatCard title="Spend MTD" value={formatCurrency(poKPIs.totalSpendMTD)} icon={DollarSign} href="/po/orders" />
        </div>
      </section>

      {/* Maintenance KPIs */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
          Maintenance
        </p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard title="Open Work Orders" value={cmmsKPIs.openWorkOrders} icon={Wrench} href="/cmms/work-orders" />
          <StatCard title="High Priority" value={cmmsKPIs.highPriority} icon={AlertTriangle} href="/cmms/work-orders" />
          <StatCard title="Overdue WOs" value={cmmsKPIs.overdueWOs} icon={Clock} href="/cmms/work-orders" />
          <StatCard
            title="PM Compliance"
            value={`${cmmsKPIs.pmComplianceRate}%`}
            subValue={cmmsKPIs.assetsInService}
            subLabel="assets in service"
            icon={CheckCircle2}
            href="/cmms/pm-schedules"
          />
        </div>
      </section>

      {/* Charts + Activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Monthly Spend */}
        <div className="col-span-1 rounded-lg border bg-white p-5 shadow-sm lg:col-span-1">
          <p className="mb-4 text-sm font-semibold text-slate-700">Monthly Spend</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlySpend} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `$${(v / 100000).toFixed(0)}k`}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v: number) => [formatCurrency(v), "Spend"]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="spend" fill="#60ab45" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* WO Trend */}
        <div className="col-span-1 rounded-lg border bg-white p-5 shadow-sm lg:col-span-1">
          <p className="mb-4 text-sm font-semibold text-slate-700">Work Order Trend</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={woTrend} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="created"
                stroke="#94a3b8"
                strokeWidth={2}
                dot={false}
                name="Created"
              />
              <Line
                type="monotone"
                dataKey="completed"
                stroke="#60ab45"
                strokeWidth={2}
                dot={false}
                name="Completed"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Activity Feed */}
        <div className="col-span-1 rounded-lg border bg-white p-5 shadow-sm">
          <p className="mb-4 text-sm font-semibold text-slate-700">Recent Activity</p>
          {activityFeed.length === 0 ? (
            <p className="text-sm text-slate-400">No recent activity.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {activityFeed.map((item) => (
                <li key={item.id} className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${getAvatarColor(item.changedByName)}`}
                  >
                    {getInitials(item.changedByName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-700 leading-snug">{item.description}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {ACTIVITY_TYPE_LABELS[item.recordType] ?? item.recordType} ·{" "}
                      {relativeTime(item.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
