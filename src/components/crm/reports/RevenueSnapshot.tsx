"use client";

import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { DollarSign, Receipt, AlertCircle, TrendingUp } from "lucide-react";
import {
  AR_WRITE_OFF_METHOD,
  ISSUED_INVOICE_STATUSES,
  MONTH_LABELS,
  netPaymentCents,
} from "@/lib/reports/helpers";
import { CLIENT_STATUSES } from "@/lib/reports/client-status";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import { isoInZone, ymd, zoneDateParts, zoneWallClockToInstant } from "@/lib/time/zone";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useOrgTimeZone } from "@/lib/hooks/use-org-timezone";

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
  // Month/"today" boundaries belong to the org, not the reader's browser.
  const orgTimeZone = useOrgTimeZone();
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
      const todayDate = isoInZone(now, orgTimeZone);
      const { year: nyYear, month: nyMonth } = zoneDateParts(now, orgTimeZone);
      const ytdStartDate = ymd(nyYear, 0, 1);
      const monthStartDate = ymd(nyYear, nyMonth, 1);
      const sixMonthsStartDate = ymd(nyYear, nyMonth - 5, 1);

      // Every read is either a head COUNT or a paged fetch: PostgREST silently
      // caps one response at 1000 rows, so selecting whole tables made the
      // client/job/invoice figures wrong as soon as an org passed 1000 rows.
      const monthStartInstant =
        zoneWallClockToInstant(monthStartDate, "00:00", orgTimeZone)?.toISOString() ?? `${monthStartDate}T00:00:00Z`;
      const countOf = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
        const { count, error } = await q;
        if (error) throw new Error(error.message);
        return count ?? 0;
      };

      const [
        totalClients,
        activeClients,
        totalLeads,
        invoicesData,
        jobsScheduled,
        jobsCompleted,
        jobsThisMonth,
        estimatesData,
        paymentsData,
      ] = await Promise.all([
        // 'lost' is a closed lead, not a client (see client-status.ts).
        countOf(sb.from("clients").select("id", { count: "exact", head: true }).is("deleted_at", null).in("status", [...CLIENT_STATUSES])),
        countOf(sb.from("clients").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "active")),
        countOf(sb.from("clients").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "lead")),
        fetchAllRows<{
          id: string;
          total_cents: number;
          balance_cents: number | null;
          invoice_date: string | null;
          due_date: string | null;
          terms: string | null;
          status: string;
        }>(() =>
          sb.from("crm_invoices").select("id, total_cents, balance_cents, invoice_date, due_date, terms, status").is("deleted_at", null)
        ),
        // crm_jobs.status CHECK: scheduled | in_progress | completed |
        // cancelled | skipped | hold. "Scheduled" here = on the board or underway.
        countOf(sb.from("crm_jobs").select("id", { count: "exact", head: true }).is("deleted_at", null).in("status", ["scheduled", "in_progress"])),
        countOf(sb.from("crm_jobs").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "completed")),
        // created_at is a timestamptz: on/after the org's midnight of the 1st.
        countOf(sb.from("crm_jobs").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", monthStartInstant)),
        fetchAllRows<{ id: string; stage: string; total_price_cents: number }>(() =>
          sb
            .from("estimates")
            .select("id, stage, total_price_cents:total_cents, estimate_date")
            .is("deleted_at", null)
            .gte("estimate_date", ytdStartDate)
            .lte("estimate_date", todayDate)
        ),
        // Rule B (cash): real money only — no credits, no AR write-offs, net of refunds.
        fetchAllRows<{ payment_date: string | null; amount_cents: number | null; refunded_amount_cents: number | null }>(() =>
          sb
            .from("crm_payments")
            .select("payment_date, amount_cents, refunded_amount_cents")
            .is("deleted_at", null)
            .eq("is_credit", false)
            .neq("method", AR_WRITE_OFF_METHOD)
            .gte("payment_date", sixMonthsStartDate)
            .lte("payment_date", todayDate)
        ),
      ]);

      // Invoices — Rule A: only issued invoices (not draft/void) are revenue or AR.
      const invoices = invoicesData;
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
      // Same effective due date as isInvoiceOverdue() (the Invoices list's
      // Past Due tab this card links to): a due-on-receipt invoice with no
      // due_date is due on its invoice date. Checking due_date alone left
      // every such invoice out of Overdue AR.
      const overdueAR = outstanding
        .filter((i: { due_date: string | null; terms: string | null; invoice_date: string | null }) => {
          const due = i.due_date ?? (i.terms === "due_on_receipt" ? i.invoice_date : null);
          return !!due && due < todayDate;
        })
        .reduce(
          (sum: number, i: { balance_cents: number | null }) => sum + (i.balance_cents ?? 0),
          0
        );

      // Estimates — YTD by estimate_date. Close rate is won ÷ decided, where
      // decided = accepted + invoiced + lost; open/draft estimates aren't a
      // loss yet and would otherwise drag the rate down.
      const estimates = estimatesData;
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
      for (const p of paymentsData) {
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
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent?: "green" | "amber" | "red" | "blue";
  /** Makes the card a link to the report/list behind the number. */
  href?: string;
}) {
  const accentClass = {
    green: "bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400",
    amber: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400",
    red: "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400",
    blue: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400",
  }[accent ?? "blue"] ?? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400";

  const body = (
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-neutral-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-neutral-100">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", accentClass)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
  );

  const cardClass = "rounded-xl border bg-card p-5 shadow-sm";
  return href ? (
    <Link href={href} className={cn(cardClass, "block transition-shadow hover:shadow-md hover:border-slate-300 dark:hover:border-neutral-700")}>
      {body}
    </Link>
  ) : (
    <div className={cardClass}>{body}</div>
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

  // Each card opens the report behind its number (pre-filtered to this year);
  // a login that can see these figures via the accounting lists but not the
  // Report Center gets the equivalent filtered list instead of a dead end.
  const reports = can("view_report_center");
  const links = {
    revenue: reports ? "/crm/admin/reports/r/invoiced-income-by-client" : "/crm/accounting/invoices",
    outstanding: reports ? "/crm/admin/reports/r/ar-aging" : "/crm/accounting/invoices?filter=open",
    overdue: "/crm/accounting/invoices?filter=past_due",
    won: reports ? "/crm/admin/reports/r/won-estimates-by-service" : "/crm/estimates?stage=accepted,invoiced",
  };

  return (
    <section>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500">
        Revenue
      </h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KPICard
          icon={DollarSign}
          label="Revenue YTD"
          href={links.revenue}
          value={formatCurrency(data.revenueYTD)}
          sub={`${data.invoiceCountYTD} invoices`}
          accent="green"
        />
        <KPICard
          icon={Receipt}
          label="Outstanding AR"
          href={links.outstanding}
          value={formatCurrency(data.outstandingAR)}
          sub="Unpaid invoices"
          accent="blue"
        />
        <KPICard
          icon={AlertCircle}
          label="Overdue AR"
          href={links.overdue}
          value={formatCurrency(data.overdueAR)}
          sub="Past due date"
          accent={data.overdueAR > 0 ? "red" : "green"}
        />
        <KPICard
          icon={TrendingUp}
          label="Won Estimates YTD"
          href={links.won}
          value={formatCurrency(data.estimatesValueWon)}
          sub={formatPct(data.estimatesWon, data.estimatesTotal) + " close rate YTD"}
          accent="blue"
        />
      </div>
    </section>
  );
}
