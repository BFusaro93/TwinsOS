"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { DollarSign, Receipt, AlertCircle, TrendingUp } from "lucide-react";
import {
  AR_WRITE_OFF_METHOD,
  ISSUED_INVOICE_STATUSES,
  MONTH_LABELS,
  netPaymentCents,
} from "@/lib/reports/helpers";
import { isClientStatus } from "@/lib/reports/client-status";
import { isoNy, nyDateParts, ymd } from "@/lib/reports/ny-date";
import { usePermissions } from "@/lib/hooks/use-permissions";

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
  // Estimates (YTD by estimate_date)
  /** Decided estimates YTD: accepted + invoiced + lost (close-rate denominator). */
  estimatesTotal: number;
  /** Accepted + invoiced estimates YTD. */
  estimatesWon: number;
  estimatesValueWon: number;   // cents
  // Cash collected by payment month (last 6, America/New_York calendar)
  monthlyRevenue: Array<{ month: string; revenue: number }>;
}

/** Permission keys any one of which unlocks the revenue snapshot. */
export const REVENUE_SNAPSHOT_PERMISSIONS = [
  "view_report_center",
  "acct_view_invoice_list",
  "acct_view_payment_list",
] as const;

export function canViewRevenueSnapshot(can: (key: string) => boolean): boolean {
  return REVENUE_SNAPSHOT_PERMISSIONS.some((key) => can(key));
}

/** "YYYY-MM" for a "YYYY-MM-DD" date string. */
function monthKeyOf(ymdStr: string): string {
  return ymdStr.slice(0, 7);
}

export function useReportData(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["crm-reports"],
    enabled: options.enabled ?? true,
    queryFn: async (): Promise<ReportData> => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;

      // Every boundary is a calendar date as it reads in America/New_York (the
      // org's operating timezone), not the browser's or UTC.
      const now = new Date();
      const todayDate = isoNy(now);
      const { year: nyYear, month: nyMonth } = nyDateParts(now);
      const ytdStartDate = ymd(nyYear, 0, 1);
      const monthStartDate = ymd(nyYear, nyMonth, 1);
      const sixMonthsStartDate = ymd(nyYear, nyMonth - 5, 1);

      const [
        clientsRes,
        invoicesRes,
        jobsRes,
        estimatesRes,
        paymentsRes,
      ] = await Promise.all([
        sb.from("clients").select("id, status").is("deleted_at", null),
        sb.from("crm_invoices").select("id, total_cents, balance_cents, invoice_date, due_date, status").is("deleted_at", null),
        sb.from("crm_jobs").select("id, status, created_at").is("deleted_at", null),
        sb
          .from("estimates")
          .select("id, stage, total_price_cents:total_cents, estimate_date")
          .is("deleted_at", null)
          .gte("estimate_date", ytdStartDate)
          .lte("estimate_date", todayDate),
        // Rule B (cash): real money only — no credits, no AR write-offs, net of refunds.
        sb
          .from("crm_payments")
          .select("payment_date, amount_cents, refunded_amount_cents")
          .is("deleted_at", null)
          .eq("is_credit", false)
          .neq("method", AR_WRITE_OFF_METHOD)
          .gte("payment_date", sixMonthsStartDate)
          .lte("payment_date", todayDate),
      ]);

      // Clients — 'lost' is a closed lead, not a client (see client-status.ts).
      const clients = clientsRes.data ?? [];
      const totalClients = clients.filter((c: { status: string }) => isClientStatus(c.status)).length;
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

      // Jobs — crm_jobs.status CHECK: scheduled | in_progress | completed |
      // cancelled | skipped | hold. "Scheduled" here = on the board or underway.
      const jobs = jobsRes.data ?? [];
      const jobsScheduled = jobs.filter(
        (j: { status: string }) => j.status === "scheduled" || j.status === "in_progress"
      ).length;
      const jobsCompleted = jobs.filter(
        (j: { status: string }) => j.status === "completed"
      ).length;
      // created_at is a timestamptz — reduce it to its NY calendar date first.
      const jobsThisMonth = jobs.filter(
        (j: { created_at: string }) => isoNy(new Date(j.created_at)) >= monthStartDate
      ).length;

      // Estimates — YTD by estimate_date. Close rate is won ÷ decided, where
      // decided = accepted + invoiced + lost; open/draft estimates aren't a
      // loss yet and would otherwise drag the rate down.
      const estimates = estimatesRes.data ?? [];
      const estimatesWonList = estimates.filter(
        (e: { stage: string }) => e.stage === "accepted" || e.stage === "invoiced"
      );
      const estimatesLost = estimates.filter((e: { stage: string }) => e.stage === "lost").length;
      const estimatesValueWon = estimatesWonList.reduce(
        (sum: number, e: { total_price_cents: number }) => sum + (e.total_price_cents ?? 0),
        0
      );

      // Cash collected — last 6 months bucketed by payment_date (a plain date),
      // month keys built the same way as the payment dates (NY calendar).
      const monthlyMap = new Map<string, number>();
      for (let i = 5; i >= 0; i--) {
        monthlyMap.set(monthKeyOf(ymd(nyYear, nyMonth - i, 1)), 0);
      }
      for (const p of (paymentsRes.data ?? []) as Array<{
        payment_date: string | null;
        amount_cents: number | null;
        refunded_amount_cents: number | null;
      }>) {
        if (!p.payment_date) continue;
        const key = monthKeyOf(p.payment_date);
        if (monthlyMap.has(key)) {
          monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + netPaymentCents(p));
        }
      }

      const monthlyRevenue = Array.from(monthlyMap.entries()).map(([month, revenue]) => {
        const [y, m] = month.split("-");
        const label = `${MONTH_LABELS[Number(m) - 1]} ${y.slice(2)}`;
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
        estimatesTotal: estimatesWonList.length + estimatesLost,
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
  // Revenue/AR figures are gated the same way the Report Center and the
  // accounting lists are — a login with neither sees nothing here.
  const { can, isLoading: permsLoading } = usePermissions();
  const allowed = !permsLoading && canViewRevenueSnapshot(can);
  const { data, isLoading } = useReportData({ enabled: allowed });

  if (permsLoading) return null;
  if (!allowed) return null;

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
          label="Won Estimates YTD"
          value={formatCurrency(data.estimatesValueWon)}
          sub={formatPct(data.estimatesWon, data.estimatesTotal) + " close rate YTD"}
          accent="blue"
        />
      </div>
    </section>
  );
}
