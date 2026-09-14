"use client";

import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Banknote,
  Landmark,
  Megaphone,
  Settings2,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { useCompanyReport } from "@/lib/hooks/use-company-report";
import { formatKpiValue } from "@/lib/kpi/scorecard-math";
import type {
  ClientBalanceRow,
  CompanyReportData,
  CompanyReportFlag,
  FlagSeverity,
  RepBreakdown,
} from "@/types/company-report";

// ============================================================
// Company Report — Landscapt-native replacement for the old screenshot-fed
// "CRM Report" (/dashboards/twins-crm-report keeps the original for Twins
// until it's retired). Every number is computed live server-side by
// src/lib/company-report/compute.ts; this component is purely
// presentational — no client-side math beyond formatting.
//
// Color language: each section carries one accent color (icon chip, table
// header tint, card-title underline) so a reader can tell sections apart at
// a glance without reading headings — Sales blue, Operations amber,
// Collections rose. The KPI row and aging tiles get their own per-metric
// accents on top of that.
// ============================================================

type Accent = "emerald" | "rose" | "blue" | "violet" | "amber" | "orange" | "slate";

const ACCENT = {
  emerald: { chipBg: "bg-emerald-50", chipText: "text-emerald-600", value: "text-emerald-700", head: "bg-emerald-50/70 text-emerald-800", underline: "decoration-emerald-400", border: "border-emerald-400" },
  rose: { chipBg: "bg-rose-50", chipText: "text-rose-600", value: "text-rose-700", head: "bg-rose-50/70 text-rose-800", underline: "decoration-rose-400", border: "border-rose-400" },
  blue: { chipBg: "bg-blue-50", chipText: "text-blue-600", value: "text-blue-700", head: "bg-blue-50/70 text-blue-800", underline: "decoration-blue-400", border: "border-blue-400" },
  violet: { chipBg: "bg-violet-50", chipText: "text-violet-600", value: "text-violet-700", head: "bg-violet-50/70 text-violet-800", underline: "decoration-violet-400", border: "border-violet-400" },
  amber: { chipBg: "bg-amber-50", chipText: "text-amber-600", value: "text-amber-700", head: "bg-amber-50/70 text-amber-800", underline: "decoration-amber-400", border: "border-amber-400" },
  orange: { chipBg: "bg-orange-50", chipText: "text-orange-600", value: "text-orange-700", head: "bg-orange-50/70 text-orange-800", underline: "decoration-orange-400", border: "border-orange-400" },
  slate: { chipBg: "bg-slate-100", chipText: "text-slate-500", value: "text-slate-800", head: "bg-slate-50 text-slate-500", underline: "decoration-slate-300", border: "border-slate-300" },
} satisfies Record<Accent, { chipBg: string; chipText: string; value: string; head: string; underline: string; border: string }>;

function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return formatKpiValue(cents / 100, "currency");
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return formatKpiValue(value, "percent");
}

/** Threshold-based color for a "higher is healthier" percent, e.g. Percent Paid, Conversion %. */
function healthColorClass(value: number | null | undefined): string {
  if (value === null || value === undefined) return "text-slate-700";
  if (value >= 90) return "text-emerald-600";
  if (value >= 70) return "text-amber-600";
  return "text-red-600";
}

// ── Small building blocks ─────────────────────────────────────────────────────

function SectionIcon({ icon: Icon, accent }: { icon: LucideIcon; accent: Accent }) {
  const a = ACCENT[accent];
  return (
    <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${a.chipBg} ${a.chipText}`}>
      <Icon className="h-4 w-4" />
    </span>
  );
}

function Section({ title, icon, accent, children }: { title: string; icon: LucideIcon; accent: Accent; children: React.ReactNode }) {
  const a = ACCENT[accent];
  return (
    <div className="flex flex-col gap-4">
      <h2 className={`flex items-center gap-2 text-lg font-bold text-slate-800 underline decoration-2 underline-offset-8 ${a.underline}`}>
        <SectionIcon icon={icon} accent={accent} />
        {title}
      </h2>
      {children}
    </div>
  );
}

function Card({
  title,
  subtitle,
  accent = "slate",
  children,
}: {
  title?: string;
  subtitle?: string;
  accent?: Accent;
  children: React.ReactNode;
}) {
  const a = ACCENT[accent];
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {title && (
        <div className={`border-l-4 ${a.border} pl-3`}>
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

function Table({ headers, accent = "slate", children }: { headers: string[]; accent?: Accent; children: React.ReactNode }) {
  const a = ACCENT[accent];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className={`rounded-md text-xs font-semibold uppercase tracking-wide ${a.head}`}>
            {headers.map((h, i) => (
              <th key={h} className={`px-2 py-2 ${i === 0 ? "text-left" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Row({ cells, bold }: { cells: React.ReactNode[]; bold?: boolean }) {
  return (
    <tr className={`border-b border-slate-50 last:border-0 ${bold ? "bg-slate-50 font-semibold" : ""}`}>
      {cells.map((c, i) => (
        <td key={i} className={`px-2 py-1.5 ${i === 0 ? "text-left text-slate-700" : "text-right text-slate-700"}`}>
          {c}
        </td>
      ))}
    </tr>
  );
}

function RepTable({ rows, accent = "slate", showAmount = true }: { rows: RepBreakdown[]; accent?: Accent; showAmount?: boolean }) {
  if (rows.length === 0) return <p className="text-xs text-slate-400">No data.</p>;
  return (
    <Table accent={accent} headers={showAmount ? ["Name", "Count", "Amount"] : ["Name", "Count"]}>
      {rows.map((r) => (
        <Row key={r.label} cells={showAmount ? [r.label, r.count.toLocaleString(), money(r.amountCents)] : [r.label, r.count.toLocaleString()]} />
      ))}
    </Table>
  );
}

function KpiTile({
  label,
  value,
  icon: Icon,
  accent,
  target,
  formatTarget,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  accent?: Accent;
  target?: number | null;
  formatTarget?: (t: number) => string;
}) {
  const a = ACCENT[accent ?? "slate"];
  const showProgress = target !== undefined && target !== null && target > 0;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        {Icon && (
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${a.chipBg} ${a.chipText}`}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <p className={`mt-1 text-2xl font-bold ${a.value}`}>{value}</p>
      {showProgress && target && formatTarget && (
        <p className="mt-1 text-xs text-slate-400">of {formatTarget(target)} goal</p>
      )}
    </div>
  );
}

const FLAG_STYLES: Record<FlagSeverity, { bg: string; border: string; text: string; icon: string }> = {
  alert: { bg: "bg-red-50", border: "border-red-400", text: "text-red-700", icon: "🚨" },
  caution: { bg: "bg-amber-50", border: "border-amber-400", text: "text-amber-700", icon: "⚠️" },
  good: { bg: "bg-emerald-50", border: "border-emerald-400", text: "text-emerald-700", icon: "✅" },
};

function FlagCard({ flag }: { flag: CompanyReportFlag }) {
  const style = FLAG_STYLES[flag.severity];
  return (
    <div className={`rounded-lg border-l-4 ${style.border} ${style.bg} p-3`}>
      <p className={`text-sm font-semibold ${style.text}`}>
        <span className="mr-1.5">{style.icon}</span>
        {flag.title}
      </p>
      <p className="mt-0.5 text-xs text-slate-600">{flag.detail}</p>
    </div>
  );
}

const BADGE_STYLES: Record<ClientBalanceRow["badge"], string> = {
  ok: "bg-emerald-100 text-emerald-700",
  monitor: "bg-amber-100 text-amber-700",
  action: "bg-orange-100 text-orange-700",
  escalate: "bg-red-100 text-red-700",
};

function AgingBadgePill({ badge }: { badge: ClientBalanceRow["badge"] }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${BADGE_STYLES[badge]}`}>{badge}</span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CompanyReport() {
  const { data, isLoading, error } = useCompanyReport();

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Company Report" description="Loading a live snapshot of Landscapt data…" />
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</p>
        )}
      </div>
    );
  }

  return <CompanyReportBody data={data} />;
}

function CompanyReportBody({ data }: { data: CompanyReportData }) {
  const { kpis, sales, operations, collections, flags } = data;
  const currentMonth = sales.monthlyTrend[sales.monthlyTrend.length - 1];
  const monthLabels = sales.monthlyTrend.map((m) => m.label);
  const opsMonthLabels = operations.monthlyOps.map((m) => m.label);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Company Report"
        description={`Live snapshot — YTD ${data.ytdRangeLabel} · Generated ${new Date(data.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
      />

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Invoiced Revenue YTD"
          value={money(kpis.invoicedRevenueYtd.valueCents)}
          icon={Banknote}
          accent="emerald"
          target={kpis.invoicedRevenueYtd.targetDollars}
          formatTarget={(t) => formatKpiValue(t, "currency")}
        />
        <KpiTile label="Outstanding A/R" value={money(kpis.arOutstandingCents)} icon={Landmark} accent="rose" />
        <KpiTile
          label="New Clients YTD"
          value={kpis.newClientsYtd.value?.toLocaleString() ?? "—"}
          icon={UserPlus}
          accent="blue"
          target={kpis.newClientsYtd.target}
          formatTarget={(t) => t.toLocaleString()}
        />
        <KpiTile
          label="New Leads YTD"
          value={kpis.newLeadsYtd.value?.toLocaleString() ?? "—"}
          icon={Megaphone}
          accent="violet"
          target={kpis.newLeadsYtd.target}
          formatTarget={(t) => t.toLocaleString()}
        />
      </div>

      {/* Flags */}
      {flags.length > 0 && (
        <Section title="Flags &amp; Priority Actions" icon={AlertTriangle} accent="amber">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {flags.map((f, i) => (
              <FlagCard key={i} flag={f} />
            ))}
          </div>
        </Section>
      )}

      {/* Sales Dashboard */}
      <Section title="Sales Dashboard" icon={TrendingUp} accent="blue">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card accent="blue" title="Monthly Clients &amp; Leads Trend">
            <Table accent="blue" headers={["Metric", ...monthLabels]}>
              <Row cells={["New Clients", ...sales.monthlyTrend.map((m) => m.newClients.toLocaleString())]} />
              <Row cells={["New Leads", ...sales.monthlyTrend.map((m) => m.newLeads.toLocaleString())]} />
              <Row cells={["Conversion %", ...sales.monthlyTrend.map((m, i) => <span key={i} className={healthColorClass(m.conversionPct)}>{pct(m.conversionPct)}</span>)]} />
              <Row cells={["Terminated", ...sales.monthlyTrend.map((m) => m.terminated.toLocaleString())]} />
            </Table>
          </Card>

          <Card
            accent="blue"
            title="Close Ratios"
            subtitle={`${currentMonth?.label ?? ""} · ${sales.closeRatios.totalEstimates} estimates · ${money(sales.closeRatios.totalWonAmountCents)} won`}
          >
            <Table accent="blue" headers={["Sales Rep", "Won Count", "Count %", "Won Amount", "Amt %"]}>
              {sales.closeRatios.rows.map((r) => (
                <Row
                  key={r.salesRep}
                  cells={[r.salesRep, r.wonCount.toLocaleString(), pct(r.countPct), money(r.wonAmountCents), pct(r.amountPct)]}
                />
              ))}
            </Table>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card
            accent="blue"
            title="Open Pipeline"
            subtitle={`${money(sales.openPipeline.totalAmountCents)} · ${sales.openPipeline.totalCount} estimates`}
          >
            <Table accent="blue" headers={["Stage", "Value", "%"]}>
              {sales.openPipeline.byStage.map((s) => (
                <Row key={s.stage} cells={[s.stage, money(s.amountCents), pct(s.pct)]} />
              ))}
            </Table>
            <h4 className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-500">Top 5 Open Estimates</h4>
            <Table accent="blue" headers={["Client", "Value"]}>
              {sales.openPipeline.topEstimates.map((e, i) => (
                <Row key={i} cells={[e.clientName, money(e.amountCents)]} />
              ))}
            </Table>
            {sales.openPipeline.byRep.length > 0 && (
              <p className="text-xs italic text-slate-400">
                Pipeline by rep: {sales.openPipeline.byRep.map((r) => `${r.label} ${money(r.amountCents)}`).join(" | ")}
              </p>
            )}
          </Card>

          <Card accent="blue" title="Won Estimates YTD Leaderboard" subtitle={money(sales.wonEstimatesYtd.totalAmountCents) + " total won"}>
            <Table accent="blue" headers={["Sales Rep", "Won Value"]}>
              {sales.wonEstimatesYtd.rows.map((r) => (
                <Row key={r.label} cells={[r.label, <span key="v" className="font-semibold text-emerald-600">{money(r.amountCents)}</span>]} />
              ))}
              <Row bold cells={["Total Won YTD", <span key="v" className="font-bold text-emerald-700">{money(sales.wonEstimatesYtd.totalAmountCents)}</span>]} />
            </Table>
            {sales.wonEstimatesYtd.openCountByRep.length > 0 && (
              <p className="text-xs italic text-slate-400">
                Open estimates by rep: {sales.wonEstimatesYtd.openCountByRep.map((r) => `${r.label} ${r.count}`).join(" | ")}
              </p>
            )}
          </Card>
        </div>

        <Card accent="blue" title={`New Clients — ${currentMonth?.label ?? ""}`} subtitle={`${sales.newClientsThisMonth.total} total`}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <RepTable rows={sales.newClientsThisMonth.byRep} accent="blue" showAmount={false} />
            <RepTable rows={sales.newClientsThisMonth.bySource} accent="blue" showAmount={false} />
          </div>
          {sales.newClientsThisMonth.ytdTopSources.length > 0 && (
            <p className="text-xs italic text-slate-400">
              YTD top sources: {sales.newClientsThisMonth.ytdTopSources.map((r) => `${r.label} ${r.count}`).join(" | ")}
            </p>
          )}
        </Card>
      </Section>

      {/* Operations */}
      <Section title="Operations" icon={Settings2} accent="amber">
        <Card accent="amber" title="Invoices &amp; Payments — 3-Month View">
          <Table accent="amber" headers={["Metric", ...opsMonthLabels]}>
            <Row cells={["Total Invoiced", ...operations.monthlyOps.map((m) => money(m.totalInvoicedCents))]} />
            <Row cells={["Sales Tax", ...operations.monthlyOps.map((m) => money(m.salesTaxCents))]} />
            <Row cells={["Unpaid", ...operations.monthlyOps.map((m, i) => <span key={i} className={m.unpaidCents > 0 ? "text-amber-600" : "text-slate-700"}>{money(m.unpaidCents)}</span>)]} />
            <Row cells={["Percent Paid", ...operations.monthlyOps.map((m, i) => <span key={i} className={healthColorClass(m.percentPaid)}>{pct(m.percentPaid)}</span>)]} />
            <Row cells={["Uninvoiced (live)", ...operations.monthlyOps.map((m, i) => (m.uninvoicedCents === null ? "—" : <span key={i} className="text-amber-600">{money(m.uninvoicedCents)}</span>))]} />
            <Row cells={["Payments Received", ...operations.monthlyOps.map((m, i) => <span key={i} className="text-emerald-600">{money(m.paymentsReceivedCents)}</span>)]} />
          </Table>
          <p className="text-xs italic text-slate-400">
            &quot;Uninvoiced&quot; is a live balance as of today, shown only in the current month&apos;s column — it isn&apos;t a historical figure.
          </p>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card accent="amber" title="Open Tickets" subtitle={`${operations.tickets.unassignedOpen} unassigned`}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <RepTable rows={operations.tickets.byCategory} accent="amber" showAmount={false} />
              <RepTable rows={operations.tickets.byAssignee} accent="amber" showAmount={false} />
            </div>
            {operations.tickets.dueWithin7Days.length > 0 && (
              <p className="text-xs italic text-slate-400">
                Due in 7 days: {operations.tickets.dueWithin7Days.map((r) => `${r.label} ${r.count}`).join(" | ")}
              </p>
            )}
          </Card>

          <Card accent="amber" title="Unapplied &amp; Pre-Payments">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-slate-600">Unapplied Payments</p>
                <p className="mt-1 text-xs text-slate-500">
                  {money(operations.unappliedPayments.appliedCents)} applied |{" "}
                  <span className="font-medium text-amber-600">{money(operations.unappliedPayments.unusedCents)} unused</span>
                </p>
                {operations.unappliedPayments.topUnused.map((r, i) => (
                  <p key={i} className="text-xs text-slate-400">
                    {r.clientName}: {money(r.unusedCents)}
                  </p>
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-600">Pre-Payments on Account</p>
                <p className="mt-1 text-xs text-slate-500">
                  <span className="font-medium text-amber-600">{money(operations.prePayments.unusedCents)} sitting idle</span> of{" "}
                  {money(operations.prePayments.receivedCents)} received
                </p>
                {operations.prePayments.topUnused.map((r, i) => (
                  <p key={i} className="text-xs text-slate-400">
                    {r.clientName}: {money(r.unusedCents)}
                  </p>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </Section>

      {/* Collections / A/R */}
      <Section title="Collections / A/R" icon={Users} accent="rose">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiTile label="Current" value={money(collections.buckets.currentCents)} accent="emerald" />
          <KpiTile label="1–30 Days" value={money(collections.buckets.d1_30Cents)} accent="blue" />
          <KpiTile label="31–60 Days" value={money(collections.buckets.d31_60Cents)} accent="amber" />
          <KpiTile label="61–90 Days" value={money(collections.buckets.d61_90Cents)} accent="orange" />
          <KpiTile label=">90 Days" value={money(collections.buckets.d90PlusCents)} accent="rose" />
          <KpiTile label="Total Outstanding" value={money(collections.buckets.totalCents)} accent="slate" />
        </div>

        <Card accent="rose" title="Top 10 Outstanding Balances">
          <Table accent="rose" headers={["Client", "Balance", "Status"]}>
            {collections.topBalances.map((b) => (
              <Row
                key={b.clientName}
                cells={[b.clientName, money(b.totalCents), <AgingBadgePill key="badge" badge={b.badge} />]}
              />
            ))}
          </Table>
        </Card>
      </Section>
    </div>
  );
}
