import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { AnalysisConfig, AnalysisFilter, ReportResultRow } from "@/types/crm-reports";
import type {
  AgingBadge,
  AgingBucketTotals,
  ClientBalanceRow,
  CloseRatioRow,
  CollectionsSection,
  CompanyReportData,
  EstimateSummary,
  MonthlyClientTrend,
  MonthlyOpsRow,
  OperationsSection,
  PaymentPoolSummary,
  PipelineStage,
  RepBreakdown,
  SalesSection,
  TicketBreakdown,
} from "@/types/company-report";
import { runAnalysis } from "@/lib/reports/engine";
import { logger } from "@/lib/logger";

// ============================================================
// Company Report — Landscapt-native replacement for the old screenshot-fed
// "CRM Report". Every number here is computed live from Landscapt data
// through the same crm_run_report RPC / analysis engine the Report Center
// uses (rpt_clients, rpt_estimates, rpt_invoices), plus direct queries
// against crm_payments / crm_invoices / crm_tickets for the handful of
// figures the engine's group-by/aggregate shape can't express (per-client
// aging buckets, cash-rule payment pools, ticket assignee/category counts).
//
// Self-contained on purpose: the "issued invoice" and "cash payment" rules
// are inlined here (same definitions as src/lib/kpi/landscapt-kpi-compute.ts)
// rather than imported from src/lib/reports/helpers.ts, because a separate,
// not-yet-committed session is mid-edit on that file and its exports don't
// match what's live. See that module's header comment for the same note.
//
// Always "as of now": YTD = Jan 1 of the current year through today; the
// monthly trend/close-ratio sections cover the trailing 3 calendar months
// ending with the current month (MTD). There is no year picker — unlike the
// KPI Scorecard, the original SA report never had one either.
// ============================================================

type Client = SupabaseClient<Database>;

const log = logger.child("company-report/compute");
const PAGE_SIZE = 1000;

const ISSUED_INVOICE_STATUSES = ["printed", "sent", "viewed", "partial", "paid", "overdue"];
const AR_WRITE_OFF_METHOD = "AR Write-off";
const OPEN_ESTIMATE_STAGES = ["quote", "sent", "approved"];
const WON_ESTIMATE_STAGES = ["won", "invoiced"];

function issuedInvoiceFilter(): AnalysisFilter[] {
  return [{ column: "status", op: "in", value: ISSUED_INVOICE_STATUSES }];
}

interface MonthWindow {
  label: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD, inclusive
  isCurrent: boolean;
}

function monthLabel(year: number, month0: number, isCurrent: boolean): string {
  const name = new Date(year, month0, 1).toLocaleDateString("en-US", { month: "short" });
  return isCurrent ? `${name} ${year} MTD` : `${name} ${year}`;
}

/** The trailing 3 calendar months ending with the current month (today = MTD). */
function trailingMonths(now: Date): MonthWindow[] {
  const windows: MonthWindow[] = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month0 = d.getMonth();
    const isCurrent = i === 0;
    const from = `${year}-${String(month0 + 1).padStart(2, "0")}-01`;
    const lastDay = isCurrent ? now.getDate() : new Date(year, month0 + 1, 0).getDate();
    const to = `${year}-${String(month0 + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    windows.push({ label: monthLabel(year, month0, isCurrent), from, to, isCurrent });
  }
  return windows;
}

function round(value: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

function pctOf(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return round((numerator / denominator) * 100);
}

function num(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function dateFilters(column: string, from: string, to: string): AnalysisFilter[] {
  return [
    { column, op: "gte", value: from },
    { column, op: "lte", value: to },
  ];
}

// ── Engine wrappers (same shape as landscapt-kpi-compute.ts) ────────────────

async function aggregate(
  supabase: Client,
  dataset: string,
  filters: AnalysisFilter[],
  aggregates: AnalysisConfig["aggregates"],
  groupBy: string[] = []
): Promise<ReportResultRow[]> {
  const config: AnalysisConfig = {
    dataset,
    columns: [],
    filters,
    groupBy,
    aggregates,
    sortDir: "asc",
    limit: 1000,
  };
  const result = await runAnalysis(supabase, config);
  return result.rows;
}

async function total(
  supabase: Client,
  dataset: string,
  filters: AnalysisFilter[],
  aggregates: AnalysisConfig["aggregates"]
): Promise<ReportResultRow | null> {
  const rows = await aggregate(supabase, dataset, filters, aggregates);
  return rows[0] ?? null;
}

async function topRows(
  supabase: Client,
  dataset: string,
  columns: string[],
  filters: AnalysisFilter[],
  sortColumn: string,
  limit: number
): Promise<ReportResultRow[]> {
  const config: AnalysisConfig = {
    dataset,
    columns,
    filters,
    groupBy: [],
    aggregates: [],
    sortColumn,
    sortDir: "desc",
    limit,
  };
  const result = await runAnalysis(supabase, config);
  return result.rows;
}

async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await page(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

function repRows(rows: ReportResultRow[], labelKey: string, countKey: string, amountKey?: string): RepBreakdown[] {
  return rows
    .map((r) => {
      const raw = r[labelKey];
      const label = raw === null || raw === undefined || raw === "" ? "(none)" : String(raw);
      return { label, count: num(r[countKey]), amountCents: amountKey ? num(r[amountKey]) : 0 };
    })
    .sort((a, b) => (amountKey ? b.amountCents - a.amountCents : b.count - a.count));
}

// ── Sales section ────────────────────────────────────────────────────────────

async function computeMonthlyTrend(supabase: Client, months: MonthWindow[]): Promise<MonthlyClientTrend[]> {
  const rows = await Promise.all(
    months.map(async (m) => {
      const [leads, clients, terminated] = await Promise.all([
        total(supabase, "rpt_clients", dateFilters("created_at", m.from, `${m.to} 23:59:59.999`), [
          { column: "status", fn: "count" },
        ]),
        total(
          supabase,
          "rpt_clients",
          [...dateFilters("client_since", m.from, m.to), { column: "status", op: "neq", value: "lead" }],
          [{ column: "status", fn: "count" }]
        ),
        total(
          supabase,
          "rpt_clients",
          [
            ...dateFilters("closed_at", m.from, `${m.to} 23:59:59.999`),
            { column: "status", op: "in", value: ["cancelled", "lost"] },
          ],
          [{ column: "status", fn: "count" }]
        ),
      ]);
      const newLeads = num(leads?.count_status);
      const newClients = num(clients?.count_status);
      return {
        label: m.label,
        newClients,
        newLeads,
        conversionPct: pctOf(newClients, newLeads),
        terminated: num(terminated?.count_status),
      };
    })
  );
  return rows;
}

async function computeCloseRatios(supabase: Client, month: MonthWindow) {
  const [totals, byRep] = await Promise.all([
    total(supabase, "rpt_estimates", dateFilters("estimate_date", month.from, month.to), [
      { column: "estimate_number", fn: "count" },
    ]),
    aggregate(
      supabase,
      "rpt_estimates",
      [
        ...dateFilters("estimate_date", month.from, month.to),
        { column: "stage", op: "in", value: WON_ESTIMATE_STAGES },
      ],
      [
        { column: "total_cents", fn: "sum" },
        { column: "total_cents", fn: "count" },
      ],
      ["sales_rep"]
    ),
  ]);

  const totalEstimates = num(totals?.count_estimate_number);
  const totalWonAmountCents = byRep.reduce((s, r) => s + num(r.sum_total_cents), 0);

  const rows: CloseRatioRow[] = byRep
    .map((r) => {
      const wonAmountCents = num(r.sum_total_cents);
      const wonCount = num(r.count_total_cents);
      return {
        salesRep: String(r.sales_rep ?? "(unassigned)"),
        wonCount,
        wonAmountCents,
        countPct: pctOf(wonCount, totalEstimates) ?? 0,
        amountPct: pctOf(wonAmountCents, totalWonAmountCents) ?? 0,
      };
    })
    .sort((a, b) => b.wonAmountCents - a.wonAmountCents);

  return { totalEstimates, totalWonAmountCents, rows };
}

async function computeOpenPipeline(supabase: Client) {
  const openFilter: AnalysisFilter[] = [{ column: "stage", op: "in", value: OPEN_ESTIMATE_STAGES }];
  const [byStage, byRep, topEstimates] = await Promise.all([
    aggregate(
      supabase,
      "rpt_estimates",
      openFilter,
      [
        { column: "total_cents", fn: "sum" },
        { column: "total_cents", fn: "count" },
      ],
      ["stage"]
    ),
    aggregate(supabase, "rpt_estimates", openFilter, [{ column: "total_cents", fn: "sum" }], ["sales_rep"]),
    topRows(supabase, "rpt_estimates", ["client_name", "total_cents"], openFilter, "total_cents", 5),
  ]);

  const totalAmountCents = byStage.reduce((s, r) => s + num(r.sum_total_cents), 0);
  const totalCount = byStage.reduce((s, r) => s + num(r.count_total_cents), 0);

  const stages: PipelineStage[] = byStage
    .map((r) => ({
      stage: String(r.stage ?? "(none)"),
      amountCents: num(r.sum_total_cents),
      pct: pctOf(num(r.sum_total_cents), totalAmountCents) ?? 0,
    }))
    .sort((a, b) => b.amountCents - a.amountCents);

  const topRowsOut: EstimateSummary[] = topEstimates.map((r) => ({
    clientName: String(r.client_name ?? "(unknown)"),
    amountCents: num(r.total_cents),
  }));

  const byRepOut: RepBreakdown[] = byRep
    .map((r) => ({ label: String(r.sales_rep ?? "(unassigned)"), count: 0, amountCents: num(r.sum_total_cents) }))
    .sort((a, b) => b.amountCents - a.amountCents);

  return {
    totalAmountCents,
    totalCount,
    byStage: stages,
    topEstimates: topRowsOut,
    byRep: byRepOut,
  };
}

async function computeWonEstimatesYtd(supabase: Client, ytdFrom: string, now: string) {
  const wonFilter: AnalysisFilter[] = [
    ...dateFilters("estimate_date", ytdFrom, now),
    { column: "stage", op: "in", value: WON_ESTIMATE_STAGES },
  ];
  const openFilter: AnalysisFilter[] = [{ column: "stage", op: "in", value: OPEN_ESTIMATE_STAGES }];

  const [byRep, openByRep] = await Promise.all([
    aggregate(supabase, "rpt_estimates", wonFilter, [{ column: "total_cents", fn: "sum" }], ["sales_rep"]),
    aggregate(supabase, "rpt_estimates", openFilter, [{ column: "estimate_number", fn: "count" }], ["sales_rep"]),
  ]);

  const totalAmountCents = byRep.reduce((s, r) => s + num(r.sum_total_cents), 0);
  const rows: RepBreakdown[] = byRep
    .map((r) => ({ label: String(r.sales_rep ?? "(unassigned)"), count: 0, amountCents: num(r.sum_total_cents) }))
    .sort((a, b) => b.amountCents - a.amountCents);
  const openCountByRep: RepBreakdown[] = openByRep
    .map((r) => ({ label: String(r.sales_rep ?? "(unassigned)"), count: num(r.count_estimate_number), amountCents: 0 }))
    .sort((a, b) => b.count - a.count);

  return { totalAmountCents, rows, openCountByRep };
}

async function computeNewClientsThisMonth(supabase: Client, month: MonthWindow, ytdFrom: string, now: string) {
  const monthFilter: AnalysisFilter[] = [
    ...dateFilters("client_since", month.from, month.to),
    { column: "status", op: "neq", value: "lead" },
  ];
  const ytdFilter: AnalysisFilter[] = [
    ...dateFilters("client_since", ytdFrom, now),
    { column: "status", op: "neq", value: "lead" },
  ];

  const [byRep, bySource, ytdBySource] = await Promise.all([
    aggregate(supabase, "rpt_clients", monthFilter, [{ column: "status", fn: "count" }], ["sales_rep"]),
    aggregate(supabase, "rpt_clients", monthFilter, [{ column: "status", fn: "count" }], ["source"]),
    aggregate(supabase, "rpt_clients", ytdFilter, [{ column: "status", fn: "count" }], ["source"]),
  ]);

  const total = byRep.reduce((s, r) => s + num(r.count_status), 0);
  return {
    total,
    byRep: repRows(byRep, "sales_rep", "count_status").filter((r) => r.count > 0),
    bySource: repRows(bySource, "source", "count_status").filter((r) => r.count > 0),
    ytdTopSources: repRows(ytdBySource, "source", "count_status")
      .filter((r) => r.count > 0)
      .slice(0, 6),
  };
}

async function computeSales(supabase: Client, months: MonthWindow[], ytdFrom: string, now: string): Promise<SalesSection> {
  const currentMonth = months[months.length - 1];
  const [monthlyTrend, closeRatios, openPipeline, wonEstimatesYtd, newClientsThisMonth] = await Promise.all([
    computeMonthlyTrend(supabase, months),
    computeCloseRatios(supabase, currentMonth),
    computeOpenPipeline(supabase),
    computeWonEstimatesYtd(supabase, ytdFrom, now),
    computeNewClientsThisMonth(supabase, currentMonth, ytdFrom, now),
  ]);
  return { monthlyTrend, closeRatios, openPipeline, wonEstimatesYtd, newClientsThisMonth };
}

// ── Operations section ───────────────────────────────────────────────────────

interface PaymentPoolRow {
  amount_cents: number | null;
  unused_amount_cents: number | null;
  refunded_amount_cents: number | null;
  clients: { display_name: string | null } | null;
}

async function sumCashPayments(supabase: Client, from: string, to: string): Promise<number> {
  const rows = await fetchAll<{ amount_cents: number | null; refunded_amount_cents: number | null }>((f, t) =>
    supabase
      .from("crm_payments")
      .select("amount_cents, refunded_amount_cents")
      .is("deleted_at", null)
      .eq("is_credit", false)
      .neq("method", AR_WRITE_OFF_METHOD)
      .gte("payment_date", from)
      .lte("payment_date", to)
      .order("payment_date", { ascending: true })
      .range(f, t)
  );
  return rows.reduce((s, r) => s + (r.amount_cents ?? 0) - (r.refunded_amount_cents ?? 0), 0);
}

async function computeMonthlyOps(supabase: Client, months: MonthWindow[]): Promise<MonthlyOpsRow[]> {
  return Promise.all(
    months.map(async (m) => {
      const [invoiced, cashCents, clientsUninvoiced] = await Promise.all([
        total(
          supabase,
          "rpt_invoices",
          [...issuedInvoiceFilter(), ...dateFilters("invoice_date", m.from, m.to)],
          [
            { column: "total_cents", fn: "sum" },
            { column: "tax_cents", fn: "sum" },
            { column: "balance_cents", fn: "sum" },
          ]
        ),
        sumCashPayments(supabase, m.from, m.to),
        m.isCurrent
          ? total(supabase, "rpt_clients", [], [{ column: "balance_uninvoiced_cents", fn: "sum" }])
          : Promise.resolve(null),
      ]);

      const totalInvoicedCents = num(invoiced?.sum_total_cents);
      const unpaidCents = num(invoiced?.sum_balance_cents);
      return {
        label: m.label,
        totalInvoicedCents,
        salesTaxCents: num(invoiced?.sum_tax_cents),
        unpaidCents,
        percentPaid: totalInvoicedCents > 0 ? round(((totalInvoicedCents - unpaidCents) / totalInvoicedCents) * 100) : null,
        uninvoicedCents: m.isCurrent ? num(clientsUninvoiced?.sum_balance_uninvoiced_cents) : null,
        paymentsReceivedCents: cashCents,
      };
    })
  );
}

interface TicketRow {
  category: string | null;
  assigned_to: string | null;
  due_date: string | null;
}

async function computeTickets(supabase: Client, now: Date): Promise<TicketBreakdown> {
  const rows = await fetchAll<TicketRow>((from, to) =>
    supabase
      .from("crm_tickets")
      .select("category, assigned_to, due_date")
      .is("deleted_at", null)
      .is("closed_at", null)
      .order("created_at", { ascending: true })
      .range(from, to)
  );

  const byCategory = new Map<string, number>();
  const byAssignee = new Map<string, number>();
  const dueSoon = new Map<string, number>();
  const in7Days = new Date(now.getTime() + 7 * 86_400_000);
  let unassigned = 0;

  for (const r of rows) {
    const cat = r.category || "Unspecified";
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
    const assignee = r.assigned_to || "Unassigned";
    byAssignee.set(assignee, (byAssignee.get(assignee) ?? 0) + 1);
    if (!r.assigned_to) unassigned++;
    if (r.due_date && new Date(r.due_date) <= in7Days && r.assigned_to) {
      dueSoon.set(r.assigned_to, (dueSoon.get(r.assigned_to) ?? 0) + 1);
    }
  }

  const toBreakdown = (m: Map<string, number>): RepBreakdown[] =>
    [...m.entries()].map(([label, count]) => ({ label, count, amountCents: 0 })).sort((a, b) => b.count - a.count);

  return {
    byCategory: toBreakdown(byCategory),
    byAssignee: toBreakdown(byAssignee),
    unassignedOpen: unassigned,
    dueWithin7Days: toBreakdown(dueSoon),
  };
}

async function computePaymentPool(
  supabase: Client,
  isPrepayment: boolean,
  from: string,
  to: string
): Promise<PaymentPoolSummary> {
  const rows = await fetchAll<PaymentPoolRow>((f, t) =>
    supabase
      .from("crm_payments")
      .select("amount_cents, unused_amount_cents, refunded_amount_cents, clients:client_id(display_name)")
      .is("deleted_at", null)
      .eq("is_credit", false)
      .neq("method", AR_WRITE_OFF_METHOD)
      .eq("is_prepayment", isPrepayment)
      .gt("unused_amount_cents", 0)
      .gte("payment_date", from)
      .lte("payment_date", to)
      .order("unused_amount_cents", { ascending: false })
      .range(f, t)
  );

  let receivedCents = 0;
  let unusedCents = 0;
  for (const r of rows) {
    const amount = (r.amount_cents ?? 0) - (r.refunded_amount_cents ?? 0);
    receivedCents += amount;
    unusedCents += r.unused_amount_cents ?? 0;
  }

  return {
    receivedCents,
    unusedCents,
    appliedCents: receivedCents - unusedCents,
    topUnused: rows.slice(0, 3).map((r) => ({
      clientName: r.clients?.display_name ?? "(unknown)",
      unusedCents: r.unused_amount_cents ?? 0,
    })),
  };
}

async function computeOperations(supabase: Client, months: MonthWindow[], now: Date, ytdFrom: string, nowStr: string): Promise<OperationsSection> {
  const [monthlyOps, tickets, unappliedPayments, prePayments] = await Promise.all([
    computeMonthlyOps(supabase, months),
    computeTickets(supabase, now),
    computePaymentPool(supabase, false, "1970-01-01", nowStr),
    computePaymentPool(supabase, true, ytdFrom, nowStr),
  ]);
  return { monthlyOps, tickets, unappliedPayments, prePayments };
}

// ── Collections / A/R section ────────────────────────────────────────────────

interface InvoiceAgingRow {
  due_date: string | null;
  invoice_date: string | null;
  balance_cents: number | null;
  status: string;
  clients: { display_name: string | null } | null;
}

function badgeFor(d61_90Cents: number, d90PlusCents: number, totalCents: number): AgingBadge {
  // Mechanical thresholds — not a reconstruction of any prior AI judgment.
  // Fully (or almost fully) aged past 90 days and a meaningful dollar amount
  // is the clearest "needs a human" signal; smaller or partially-aged
  // balances get a softer badge.
  const agedShare = totalCents > 0 ? (d61_90Cents + d90PlusCents) / totalCents : 0;
  if (d90PlusCents >= 5_00000 && d90PlusCents / totalCents >= 0.9) return "escalate";
  if (d90PlusCents > 0 && agedShare >= 0.5 && totalCents >= 1_00000) return "action";
  if (agedShare > 0) return "monitor";
  return "ok";
}

async function computeCollections(supabase: Client): Promise<CollectionsSection> {
  const rows = await fetchAll<InvoiceAgingRow>((from, to) =>
    supabase
      .from("crm_invoices")
      .select("due_date, invoice_date, balance_cents, status, clients:client_id(display_name)")
      .gt("balance_cents", 0)
      .is("deleted_at", null)
      .in("status", ISSUED_INVOICE_STATUSES)
      .range(from, to)
  );

  const nowMs = Date.now();
  const byClient = new Map<string, AgingBucketTotals & { name: string }>();
  const buckets: AgingBucketTotals = {
    currentCents: 0,
    d1_30Cents: 0,
    d31_60Cents: 0,
    d61_90Cents: 0,
    d90PlusCents: 0,
    totalCents: 0,
  };

  for (const r of rows) {
    const balance = r.balance_cents ?? 0;
    const anchor = r.due_date ?? r.invoice_date;
    const daysPastDue = anchor ? Math.floor((nowMs - new Date(anchor).getTime()) / 86_400_000) : 0;
    const name = r.clients?.display_name ?? "(unknown)";
    const existing =
      byClient.get(name) ??
      ({ name, currentCents: 0, d1_30Cents: 0, d31_60Cents: 0, d61_90Cents: 0, d90PlusCents: 0, totalCents: 0 } as AgingBucketTotals & {
        name: string;
      });

    if (daysPastDue <= 0) {
      buckets.currentCents += balance;
      existing.currentCents += balance;
    } else if (daysPastDue <= 30) {
      buckets.d1_30Cents += balance;
      existing.d1_30Cents += balance;
    } else if (daysPastDue <= 60) {
      buckets.d31_60Cents += balance;
      existing.d31_60Cents += balance;
    } else if (daysPastDue <= 90) {
      buckets.d61_90Cents += balance;
      existing.d61_90Cents += balance;
    } else {
      buckets.d90PlusCents += balance;
      existing.d90PlusCents += balance;
    }
    buckets.totalCents += balance;
    existing.totalCents += balance;
    byClient.set(name, existing);
  }

  const topBalances: ClientBalanceRow[] = [...byClient.values()]
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, 10)
    .map((c) => ({
      clientName: c.name,
      totalCents: c.totalCents,
      d61_90Cents: c.d61_90Cents,
      d90PlusCents: c.d90PlusCents,
      badge: badgeFor(c.d61_90Cents, c.d90PlusCents, c.totalCents),
    }));

  return { buckets, topBalances };
}

// ── Entry point ──────────────────────────────────────────────────────────────

export async function computeCompanyReport(supabase: Client, now = new Date()): Promise<CompanyReportData> {
  const year = now.getFullYear();
  const ytdFrom = `${year}-01-01`;
  const nowStr = now.toISOString().slice(0, 10);
  const months = trailingMonths(now);

  const areas: Array<[string, () => Promise<unknown>]> = [
    ["sales", () => computeSales(supabase, months, ytdFrom, nowStr)],
    ["operations", () => computeOperations(supabase, months, now, ytdFrom, nowStr)],
    ["collections", () => computeCollections(supabase)],
  ];

  const [salesResult, operationsResult, collectionsResult] = await Promise.allSettled(
    areas.map(([, fn]) => fn())
  );

  const emptySales: SalesSection = {
    monthlyTrend: [],
    closeRatios: { totalEstimates: 0, totalWonAmountCents: 0, rows: [] },
    openPipeline: { totalAmountCents: 0, totalCount: 0, byStage: [], topEstimates: [], byRep: [] },
    wonEstimatesYtd: { totalAmountCents: 0, rows: [], openCountByRep: [] },
    newClientsThisMonth: { total: 0, byRep: [], bySource: [], ytdTopSources: [] },
  };
  const emptyOps: OperationsSection = {
    monthlyOps: [],
    tickets: { byCategory: [], byAssignee: [], unassignedOpen: 0, dueWithin7Days: [] },
    unappliedPayments: { receivedCents: 0, unusedCents: 0, appliedCents: 0, topUnused: [] },
    prePayments: { receivedCents: 0, unusedCents: 0, appliedCents: 0, topUnused: [] },
  };
  const emptyCollections: CollectionsSection = {
    buckets: { currentCents: 0, d1_30Cents: 0, d31_60Cents: 0, d61_90Cents: 0, d90PlusCents: 0, totalCents: 0 },
    topBalances: [],
  };

  function unwrap<T>(res: PromiseSettledResult<unknown>, area: string, empty: T): T {
    if (res.status === "fulfilled") return res.value as T;
    log.error(`Company Report area "${area}" failed`, { error: String(res.reason) });
    return empty;
  }

  const sales = unwrap(salesResult, "sales", emptySales);
  const operations = unwrap(operationsResult, "operations", emptyOps);
  const collections = unwrap(collectionsResult, "collections", emptyCollections);

  const ytdLabel = `Jan 1 – ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${year}`;

  const data: CompanyReportData = {
    generatedAt: new Date().toISOString(),
    ytdRangeLabel: ytdLabel,
    kpis: {
      invoicedRevenueYtd: { valueCents: null, targetDollars: null },
      arOutstandingCents: null,
      newClientsYtd: { value: null, target: null },
      newLeadsYtd: { value: null, target: null },
    },
    sales,
    operations,
    collections,
    flags: [],
  };
  return data;
}

export { trailingMonths };
