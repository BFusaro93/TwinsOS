"use client";

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
// ============================================================

function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return formatKpiValue(cents / 100, "currency");
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return formatKpiValue(value, "percent");
}

// ── Small building blocks ─────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-slate-800">{title}</h2>
      {children}
    </div>
  );
}

function Card({ title, subtitle, children }: { title?: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {title && (
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
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

function RepTable({ rows, showAmount = true }: { rows: RepBreakdown[]; showAmount?: boolean }) {
  if (rows.length === 0) return <p className="text-xs text-slate-400">No data.</p>;
  return (
    <Table headers={showAmount ? ["Name", "Count", "Amount"] : ["Name", "Count"]}>
      {rows.map((r) => (
        <Row key={r.label} cells={showAmount ? [r.label, r.count.toLocaleString(), money(r.amountCents)] : [r.label, r.count.toLocaleString()]} />
      ))}
    </Table>
  );
}

function KpiTile({
  label,
  value,
  target,
  formatTarget,
}: {
  label: string;
  value: string;
  target?: number | null;
  formatTarget?: (t: number) => string;
}) {
  const showProgress = target !== undefined && target !== null && target > 0;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-800">{value}</p>
      {showProgress && target && formatTarget && (
        <p className="mt-1 text-xs text-slate-400">of {formatTarget(target)} goal</p>
      )}
    </div>
  );
}

const FLAG_STYLES: Record<FlagSeverity, { bg: string; border: string; text: string; icon: string }> = {
  alert: { bg: "bg-red-50", border: "border-red-400", text: "text-red-700", icon: "🚨" },
  caution: { bg: "bg-amber-50", border: "border-amber-400", text: "text-amber-700", icon: "⚠️" },
  good: { bg: "bg-green-50", border: "border-green-400", text: "text-green-700", icon: "✅" },
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
  ok: "bg-green-50 text-green-700",
  monitor: "bg-amber-50 text-amber-700",
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
          target={kpis.invoicedRevenueYtd.targetDollars}
          formatTarget={(t) => formatKpiValue(t, "currency")}
        />
        <KpiTile label="Outstanding A/R" value={money(kpis.arOutstandingCents)} />
        <KpiTile
          label="New Clients YTD"
          value={kpis.newClientsYtd.value?.toLocaleString() ?? "—"}
          target={kpis.newClientsYtd.target}
          formatTarget={(t) => t.toLocaleString()}
        />
        <KpiTile
          label="New Leads YTD"
          value={kpis.newLeadsYtd.value?.toLocaleString() ?? "—"}
          target={kpis.newLeadsYtd.target}
          formatTarget={(t) => t.toLocaleString()}
        />
      </div>

      {/* Flags */}
      {flags.length > 0 && (
        <Section title="Flags &amp; Priority Actions">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {flags.map((f, i) => (
              <FlagCard key={i} flag={f} />
            ))}
          </div>
        </Section>
      )}

      {/* Sales Dashboard */}
      <Section title="Sales Dashboard">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Monthly Clients &amp; Leads Trend">
            <Table headers={["Metric", ...monthLabels]}>
              <Row cells={["New Clients", ...sales.monthlyTrend.map((m) => m.newClients.toLocaleString())]} />
              <Row cells={["New Leads", ...sales.monthlyTrend.map((m) => m.newLeads.toLocaleString())]} />
              <Row cells={["Conversion %", ...sales.monthlyTrend.map((m) => pct(m.conversionPct))]} />
              <Row cells={["Terminated", ...sales.monthlyTrend.map((m) => m.terminated.toLocaleString())]} />
            </Table>
          </Card>

          <Card
            title="Close Ratios"
            subtitle={`${currentMonth?.label ?? ""} · ${sales.closeRatios.totalEstimates} estimates · ${money(sales.closeRatios.totalWonAmountCents)} won`}
          >
            <Table headers={["Sales Rep", "Won Count", "Count %", "Won Amount", "Amt %"]}>
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
            title="Open Pipeline"
            subtitle={`${money(sales.openPipeline.totalAmountCents)} · ${sales.openPipeline.totalCount} estimates`}
          >
            <Table headers={["Stage", "Value", "%"]}>
              {sales.openPipeline.byStage.map((s) => (
                <Row key={s.stage} cells={[s.stage, money(s.amountCents), pct(s.pct)]} />
              ))}
            </Table>
            <h4 className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-500">Top 5 Open Estimates</h4>
            <Table headers={["Client", "Value"]}>
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

          <Card title="Won Estimates YTD Leaderboard" subtitle={money(sales.wonEstimatesYtd.totalAmountCents) + " total won"}>
            <Table headers={["Sales Rep", "Won Value"]}>
              {sales.wonEstimatesYtd.rows.map((r) => (
                <Row key={r.label} cells={[r.label, money(r.amountCents)]} />
              ))}
              <Row bold cells={["Total Won YTD", money(sales.wonEstimatesYtd.totalAmountCents)]} />
            </Table>
            {sales.wonEstimatesYtd.openCountByRep.length > 0 && (
              <p className="text-xs italic text-slate-400">
                Open estimates by rep: {sales.wonEstimatesYtd.openCountByRep.map((r) => `${r.label} ${r.count}`).join(" | ")}
              </p>
            )}
          </Card>
        </div>

        <Card
          title={`New Clients — ${currentMonth?.label ?? ""}`}
          subtitle={`${sales.newClientsThisMonth.total} total`}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <RepTable rows={sales.newClientsThisMonth.byRep} showAmount={false} />
            <RepTable rows={sales.newClientsThisMonth.bySource} showAmount={false} />
          </div>
          {sales.newClientsThisMonth.ytdTopSources.length > 0 && (
            <p className="text-xs italic text-slate-400">
              YTD top sources: {sales.newClientsThisMonth.ytdTopSources.map((r) => `${r.label} ${r.count}`).join(" | ")}
            </p>
          )}
        </Card>
      </Section>

      {/* Operations */}
      <Section title="Operations">
        <Card title="Invoices &amp; Payments — 3-Month View">
          <Table headers={["Metric", ...opsMonthLabels]}>
            <Row cells={["Total Invoiced", ...operations.monthlyOps.map((m) => money(m.totalInvoicedCents))]} />
            <Row cells={["Sales Tax", ...operations.monthlyOps.map((m) => money(m.salesTaxCents))]} />
            <Row cells={["Unpaid", ...operations.monthlyOps.map((m) => money(m.unpaidCents))]} />
            <Row cells={["Percent Paid", ...operations.monthlyOps.map((m) => pct(m.percentPaid))]} />
            <Row cells={["Uninvoiced (live)", ...operations.monthlyOps.map((m) => (m.uninvoicedCents === null ? "—" : money(m.uninvoicedCents)))]} />
            <Row cells={["Payments Received", ...operations.monthlyOps.map((m) => money(m.paymentsReceivedCents))]} />
          </Table>
          <p className="text-xs italic text-slate-400">
            &quot;Uninvoiced&quot; is a live balance as of today, shown only in the current month&apos;s column — it isn&apos;t a historical figure.
          </p>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Open Tickets" subtitle={`${operations.tickets.unassignedOpen} unassigned`}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <RepTable rows={operations.tickets.byCategory} showAmount={false} />
              <RepTable rows={operations.tickets.byAssignee} showAmount={false} />
            </div>
            {operations.tickets.dueWithin7Days.length > 0 && (
              <p className="text-xs italic text-slate-400">
                Due in 7 days: {operations.tickets.dueWithin7Days.map((r) => `${r.label} ${r.count}`).join(" | ")}
              </p>
            )}
          </Card>

          <Card title="Unapplied &amp; Pre-Payments">
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
      <Section title="Collections / A/R">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiTile label="Current" value={money(collections.buckets.currentCents)} />
          <KpiTile label="1–30 Days" value={money(collections.buckets.d1_30Cents)} />
          <KpiTile label="31–60 Days" value={money(collections.buckets.d31_60Cents)} />
          <KpiTile label="61–90 Days" value={money(collections.buckets.d61_90Cents)} />
          <KpiTile label=">90 Days" value={money(collections.buckets.d90PlusCents)} />
          <KpiTile label="Total Outstanding" value={money(collections.buckets.totalCents)} />
        </div>

        <Card title="Top 10 Outstanding Balances">
          <Table headers={["Client", "Balance", "Status"]}>
            {collections.topBalances.map((b) => (
              <Row
                key={b.clientName}
                cells={[
                  b.clientName,
                  money(b.totalCents),
                  <AgingBadgePill key="badge" badge={b.badge} />,
                ]}
              />
            ))}
          </Table>
        </Card>
      </Section>
    </div>
  );
}
