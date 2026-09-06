"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { DollarSign, Receipt, AlertCircle, TrendingUp } from "lucide-react";
import { ISSUED_INVOICE_STATUSES } from "@/lib/reports/helpers";

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

export interface ReportData {
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

export function useReportData() {
  return useQuery({
    queryKey: ["crm-reports"],
    queryFn: async (): Promise<ReportData> => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;

      const now = new Date();
      // Invoice-date window is a plain YYYY-MM-DD (crm_invoices.invoice_date is a date).
      const ytdStartDate = `${now.getFullYear()}-01-01`;
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const today = now.toISOString();
      const todayDate = today.slice(0, 10);

      const [
        clientsRes,
        invoicesRes,
        jobsRes,
        estimatesRes,
      ] = await Promise.all([
        sb.from("clients").select("id, status").is("deleted_at", null),
        sb.from("crm_invoices").select("id, total_cents, paid_cents:amount_paid_cents, balance_cents, invoice_date, due_date, created_at, status").is("deleted_at", null),
        sb.from("crm_jobs").select("id, status, created_at").is("deleted_at", null),
        sb.from("estimates").select("id, stage, total_price_cents:total_cents").is("deleted_at", null),
      ]);

      // Clients
      const clients = clientsRes.data ?? [];
      const totalClients = clients.filter((c: { status: string }) => c.status !== "lead").length;
      const activeClients = clients.filter((c: { status: string }) => c.status === "active").length;
      const totalLeads = clients.filter((c: { status: string }) => c.status === "lead").length;

      // Invoices — Rule A: only issued invoices (not draft/void) are revenue or AR.
      const invoices = invoicesRes.data ?? [];
      const isIssued = (i: { status: string }) =>
        (ISSUED_INVOICE_STATUSES as readonly string[]).includes(i.status);
      const issuedInvoices = invoices.filter(isIssued);
      const ytdInvoices = issuedInvoices.filter(
        (i: { invoice_date: string | null }) =>
          !!i.invoice_date && i.invoice_date >= ytdStartDate && i.invoice_date <= todayDate
      );
      // Revenue = invoiced total (recognized revenue), not just cash collected —
      // outstanding/overdue AR are subsets of this, so it should never be smaller
      // than either (absent prior-year AR still outstanding this year).
      const revenueYTD = ytdInvoices.reduce(
        (sum: number, i: { total_cents: number }) => sum + (i.total_cents ?? 0),
        0
      );
      const outstanding = issuedInvoices.filter(
        (i: { balance_cents: number | null }) => (i.balance_cents ?? 0) > 0
      );
      const outstandingAR = outstanding.reduce(
        (sum: number, i: { balance_cents: number | null }) => sum + (i.balance_cents ?? 0),
        0
      );
      const overdueAR = outstanding
        .filter(
          (i: { due_date: string | null }) => i.due_date && i.due_date < todayDate
        )
        .reduce(
          (sum: number, i: { balance_cents: number | null }) => sum + (i.balance_cents ?? 0),
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
        (e: { stage: string }) => e.stage === "accepted" || e.stage === "invoiced"
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

export function KPICard({
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

// ── Revenue snapshot section ───────────────────────────────────────────────────
// Shared between the Reports dashboard and the My Day page.

export function RevenueSnapshot() {
  const { data, isLoading } = useReportData();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
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
  );
}
