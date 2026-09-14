"use client";

import { PageHeader } from "@/components/shared/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import {
  Users,
  Briefcase,
  TrendingUp,
  ClipboardCheck,
  Clock,
  ArrowRight,
  BarChart2,
} from "lucide-react";
import Link from "next/link";
import { EstimatesReportSection } from "./EstimatesReportSection";
import { useReportData, KPICard, RevenueSnapshot } from "./RevenueSnapshot";

// ── Mini Bar Chart ────────────────────────────────────────────────────────────

function MonthlyRevenueChart({ data }: { data: Array<{ month: string; revenue: number }> }) {
  const max = Math.max(...data.map((d) => d.revenue), 1);
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <p className="mb-4 text-sm font-semibold text-slate-800">Collected — Last 6 Months</p>
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
          description="Landscapt performance metrics and business analytics."
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
            <RevenueSnapshot />

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
