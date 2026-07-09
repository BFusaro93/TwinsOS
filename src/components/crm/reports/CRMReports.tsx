"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  DollarSign,
  Users,
  Briefcase,
  Receipt,
  TrendingUp,
  ClipboardCheck,
  Clock,
  AlertCircle,
  ArrowRight,
  BarChart2,
} from "lucide-react";
import Link from "next/link";
import { EstimatesReportSection } from "./EstimatesReportSection";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatPct(n: number, d: number) {
  if (d === 0) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

// ── Data ──────────────────────────────────────────────────────────────────────

interface ReportData {
  totalClients: number;
  activeClients: number;
  totalLeads: number;
  // Invoices
  invoiceCountYTD: number;
  revenueYTD: number;          // cents
  outstandingAR: number;       // cents
  overdueAR: number;           // cents
  // Jobs
  jobsScheduled: number;
  jobsCompleted: number;
  jobsThisMonth: number;
  // Estimates
  estimatesTotal: number;
  estimatesWon: number;
  estimatesValueWon: number;   // cents
  // Recent revenue by month (last 6)
  monthlyRevenue: Array<{ month: string; revenue: number }>;
}

function useReportData() {
  return useQuery({
    queryKey: ["crm-reports"],
    queryFn: async (): Promise<ReportData> => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;

      const now = new Date();
      const ytdStart = new Date(now.getFullYear(), 0, 1).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const today = now.toISOString();

      const [
        clientsRes,
        invoicesRes,
        jobsRes,
        estimatesRes,
      ] = await Promise.all([
        sb.from("clients").select("id, status").is("deleted_at", null),
        sb.from("crm_invoices").select("id, total_cents, paid_cents, due_date, created_at, status").is("deleted_at", null),
        sb.from("crm_jobs").select("id, status, created_at").is("deleted_at", null),
        sb.from("estimates").select("id, stage, total_price_cents:total_cents").is("deleted_at", null),
      ]);

      // Clients
      const clients = clientsRes.data ?? [];
      const totalClients = clients.filter((c: { status: string }) => c.status !== "lead").length;
      const activeClients = clients.filter((c: { status: string }) => c.status === "active").length;
      const totalLeads = clients.filter((c: { status: string }) => c.status === "lead").length;

      // Invoices
      const invoices = invoicesRes.data ?? [];
      const ytdInvoices = invoices.filter(
        (i: { created_at: string }) => i.created_at >= ytdStart && i.created_at <= today
      );
      const revenueYTD = ytdInvoices.reduce(
        (sum: number, i: { paid_cents: number }) => sum + (i.paid_cents ?? 0),
        0
      );
      const outstanding = invoices.filter(
        (i: { status: string }) => i.status !== "paid" && i.status !== "void"
      );
      const outstandingAR = outstanding.reduce(
        (sum: number, i: { total_cents: number; paid_cents: number }) =>
          sum + ((i.total_cents ?? 0) - (i.paid_cents ?? 0)),
        0
      );
      const overdueAR = outstanding
        .filter(
          (i: { due_date: string | null }) =>
            i.due_date && i.due_date < today.slice(0, 10)
        )
        .reduce(
          (sum: number, i: { total_cents: number; paid_cents: number }) =>
            sum + ((i.total_cents ?? 0) - (i.paid_cents ?? 0)),
          0
        );

      // Jobs
      const jobs = jobsRes.data ?? [];
      const jobsScheduled = jobs.filter(
        (j: { status: string }) => j.status === "scheduled" || j.status === "active"
      ).length;
      const jobsCompleted = jobs.filter(
        (j: { status: string }) => j.status === "completed"
      ).length;
      const jobsThisMonth = jobs.filter(
        (j: { created_at: string }) => j.created_at >= monthStart
      ).length;

      // Estimates
      const estimates = estimatesRes.data ?? [];
      const estimatesWonList = estimates.filter(
        (e: { stage: string }) => e.stage === "won" || e.stage === "invoiced"
      );
      const estimatesValueWon = estimatesWonList.reduce(
        (sum: number, e: { total_price_cents: number }) => sum + (e.total_price_cents ?? 0),
        0
      );

      // Monthly revenue — last 6 months from paid invoices
      const monthlyMap = new Map<string, number>();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthlyMap.set(key, 0);
      }
      invoices
        .filter((inv: { paid_cents: number; created_at: string }) => inv.paid_cents > 0)
        .forEach((inv: { paid_cents: number; created_at: string }) => {
          const key = inv.created_at.slice(0, 7);
          if (monthlyMap.has(key)) {
            monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + inv.paid_cents);
          }
        });

      const monthlyRevenue = Array.from(monthlyMap.entries()).map(([month, revenue]) => {
        const [y, m] = month.split("-");
        const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
        });
        return { month: label, revenue };
      });

      return {
        totalClients,
        activeClients,
        totalLeads,
        invoiceCountYTD: ytdInvoices.length,
        revenueYTD,
        outstandingAR,
        overdueAR,
        jobsScheduled,
        jobsCompleted,
        jobsThisMonth,
        estimatesTotal: estimates.length,
        estimatesWon: estimatesWonList.length,
        estimatesValueWon,
        monthlyRevenue,
      };
    },
  });
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent?: "green" | "amber" | "red" | "blue";
}) {
  const accentClass = {
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    blue: "bg-blue-50 text-blue-600",
  }[accent ?? "blue"] ?? "bg-blue-50 text-blue-600";

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", accentClass)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

// ── Mini Bar Chart ────────────────────────────────────────────────────────────

function MonthlyRevenueChart({ data }: { data: Array<{ month: string; revenue: number }> }) {
  const max = Math.max(...data.map((d) => d.revenue), 1);
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <p className="mb-4 text-sm font-semibold text-slate-800">Revenue — Last 6 Months</p>
      <div className="flex items-end gap-2 h-32">
        {data.map((d) => {
          const pct = (d.revenue / max) * 100;
          return (
            <div key={d.month} className="flex flex-1 flex-col items-center gap-1">
              <p className="text-[10px] font-semibold text-slate-600">
                {d.revenue > 0 ? formatCurrency(d.revenue) : ""}
              </p>
              <div className="relative flex w-full flex-1 flex-col justify-end">
                <div
                  className="w-full rounded-t bg-brand-500 transition-all duration-500"
                  style={{ height: `${Math.max(pct, 2)}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400">{d.month}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function CRMReports({ hideHeader = false }: { hideHeader?: boolean }) {
  const { data, isLoading } = useReportData();

  return (
    <div className="flex h-full flex-col overflow-auto">
      {!hideHeader && (
        <PageHeader
          title="Reports"
          description="CRM performance metrics and business analytics."
        />
      )}

      <div className="flex-1 p-6 space-y-6">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        ) : data ? (
          <>
            {/* Revenue */}
            <section>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                Revenue
              </h2>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <KPICard
                  icon={DollarSign}
                  label="Revenue YTD"
                  value={formatCurrency(data.revenueYTD)}
                  sub={`${data.invoiceCountYTD} invoices`}
                  accent="green"
                />
                <KPICard
                  icon={Receipt}
                  label="Outstanding AR"
                  value={formatCurrency(data.outstandingAR)}
                  sub="Unpaid invoices"
                  accent="blue"
                />
                <KPICard
                  icon={AlertCircle}
                  label="Overdue AR"
                  value={formatCurrency(data.overdueAR)}
                  sub="Past due date"
                  accent={data.overdueAR > 0 ? "red" : "green"}
                />
                <KPICard
                  icon={TrendingUp}
                  label="Won Estimates"
                  value={formatCurrency(data.estimatesValueWon)}
                  sub={formatPct(data.estimatesWon, data.estimatesTotal) + " close rate"}
                  accent="blue"
                />
              </div>
            </section>

            {/* Monthly chart */}
            <MonthlyRevenueChart data={data.monthlyRevenue} />

            {/* Clients & Jobs */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <section>
                <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                  Clients
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <KPICard
                    icon={Users}
                    label="Total Clients"
                    value={data.totalClients.toLocaleString()}
                    sub={`${data.activeClients} active`}
                    accent="blue"
                  />
                  <KPICard
                    icon={Users}
                    label="Leads"
                    value={data.totalLeads.toLocaleString()}
                    sub="In pipeline"
                    accent="amber"
                  />
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                  Jobs
                </h2>
                <div className="grid grid-cols-3 gap-4">
                  <KPICard
                    icon={Clock}
                    label="Scheduled"
                    value={data.jobsScheduled.toLocaleString()}
                    sub="Active jobs"
                    accent="blue"
                  />
                  <KPICard
                    icon={ClipboardCheck}
                    label="Completed"
                    value={data.jobsCompleted.toLocaleString()}
                    accent="green"
                  />
                  <KPICard
                    icon={Briefcase}
                    label="This Month"
                    value={data.jobsThisMonth.toLocaleString()}
                    sub="New jobs"
                    accent="blue"
                  />
                </div>
              </section>
            </div>
          </>
        ) : null}

        <EstimatesReportSection />

        {/* Detailed Reports */}
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
            Detailed Reports
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Link
              href="/crm/reports/job-costing"
              className="group flex items-center gap-4 rounded-xl border bg-white p-5 shadow-sm hover:border-brand-400 hover:shadow-md transition-all"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shrink-0">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900">Job Costing Report</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Per-job view — actual vs. estimated hours, labor cost, Rev/Man Hr, and Target Over/Under
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-brand-500 shrink-0 transition-colors" />
            </Link>
            <Link
              href="/crm/reports/cogs"
              className="group flex items-center gap-4 rounded-xl border bg-white p-5 shadow-sm hover:border-brand-400 hover:shadow-md transition-all"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
                <BarChart2 className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900">COGS by Service</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Which services are making money? Gross sales, labor %, materials, and margin by service type
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-brand-500 shrink-0 transition-colors" />
            </Link>
            <Link
              href="/crm/reports/referrals"
              className="group flex items-center gap-4 rounded-xl border bg-white p-5 shadow-sm hover:border-brand-400 hover:shadow-md transition-all"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600 shrink-0">
                <Users className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900">Client Referrals</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Which clients are referring the most business, and whether those referrals stuck around
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-brand-500 shrink-0 transition-colors" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
