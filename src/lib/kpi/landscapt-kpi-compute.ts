import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { AnalysisConfig, AnalysisFilter, ReportResultRow } from "@/types/crm-reports";
import type { KpiComputedActuals } from "@/types/crm-kpi-scorecard";
import { runAnalysis } from "@/lib/reports/engine";
import { loadVisitCosting, weightedTargetRate, type CostedVisit } from "@/lib/visit-costing";
import { logger } from "@/lib/logger";

// ============================================================
// Landscapt KPI Scorecard — computes every `auto` metric in the catalog
// (src/lib/kpi/landscapt-kpi-catalog.ts) for one calendar year, from
// Landscapt data only. Everything runs through the caller's RLS-scoped
// server client: the rpt_* views are security_invoker and crm_run_report
// is SECURITY INVOKER, so results are already limited to the caller's org.
//
// Simple sums/counts go through the Report Center analysis engine (DB-side
// aggregation, no row paging). Metrics that need row-level logic (lead
// conversion, retention, overtime) page the rows down in 1000-row chunks.
//
// Output values are in DISPLAY units: dollars (not cents), percent 0–100,
// hours, days, counts. null = nothing to compute from this year.
// ============================================================

type Client = SupabaseClient<Database>;

const log = logger.child("kpi/landscapt-compute");
const PAGE_SIZE = 1000;

interface YearWindow {
  year: number;
  from: string; // YYYY-01-01
  to: string; // YYYY-12-31
  fromTs: string;
  toTs: string;
  /** Days of the year elapsed as of today (full year for past years, 0 for future). */
  daysElapsed: number;
  /** Last instant considered "in" the year for snapshot-style logic. */
  periodEnd: Date;
}

function buildWindow(year: number, now = new Date()): YearWindow {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31, 23, 59, 59, 999);
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  let daysElapsed: number;
  let periodEnd: Date;
  if (now < jan1) {
    daysElapsed = 0;
    periodEnd = jan1;
  } else if (now > dec31) {
    daysElapsed = isLeap ? 366 : 365;
    periodEnd = dec31;
  } else {
    daysElapsed = Math.floor((now.getTime() - jan1.getTime()) / 86_400_000) + 1;
    periodEnd = now;
  }
  return {
    year,
    from,
    to,
    fromTs: `${from} 00:00:00`,
    toTs: `${to} 23:59:59.999`,
    daysElapsed,
    periodEnd,
  };
}

// ── Small numeric helpers ────────────────────────────────────────────────────

function round(value: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

function pctOf(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return round((numerator / denominator) * 100);
}

function dollars(cents: number | null | undefined): number | null {
  if (cents === null || cents === undefined) return null;
  return Math.round(cents / 100);
}

function num(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// ── Report Center accounting rules (kept inline so this module only depends
//    on dataset columns that exist on every environment) ───────────────────
//
// Rule A — Issued invoices: everything except draft and void.
// Rule B — Cash received: crm_payments rows that are not account credits and
//          not "AR Write-off", net of refunds.

const ISSUED_INVOICE_STATUSES = ["printed", "sent", "viewed", "partial", "paid", "overdue"];
const AR_WRITE_OFF_METHOD = "AR Write-off";

function issuedInvoiceFilter(): AnalysisFilter[] {
  return [{ column: "status", op: "in", value: ISSUED_INVOICE_STATUSES }];
}

// ── Engine wrappers ──────────────────────────────────────────────────────────

function dateFilters(column: string, w: YearWindow, datetime = false): AnalysisFilter[] {
  return [
    { column, op: "gte", value: datetime ? w.fromTs : w.from },
    { column, op: "lte", value: datetime ? w.toTs : w.to },
  ];
}

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

/** Grand-total row (ungrouped aggregate) or null if the engine returned none. */
async function total(
  supabase: Client,
  dataset: string,
  filters: AnalysisFilter[],
  aggregates: AnalysisConfig["aggregates"]
): Promise<ReportResultRow | null> {
  const rows = await aggregate(supabase, dataset, filters, aggregates);
  return rows[0] ?? null;
}

// ── Row pagers ───────────────────────────────────────────────────────────────

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

// ── Per-area computations ────────────────────────────────────────────────────

type Values = Record<string, number | null>;

async function computeInvoices(supabase: Client, w: YearWindow): Promise<Values> {
  const [inYear, openAll, openOver60] = await Promise.all([
    total(
      supabase,
      "rpt_invoices",
      [...issuedInvoiceFilter(), ...dateFilters("invoice_date", w)],
      [
        { column: "total_cents", fn: "sum" },
        { column: "total_cents", fn: "avg" },
        { column: "total_cents", fn: "count" },
      ]
    ),
    total(
      supabase,
      "rpt_invoices",
      [...issuedInvoiceFilter(), { column: "balance_cents", op: "gt", value: 0 }],
      [{ column: "balance_cents", fn: "sum" }]
    ),
    total(
      supabase,
      "rpt_invoices",
      [
        ...issuedInvoiceFilter(),
        { column: "balance_cents", op: "gt", value: 0 },
        { column: "days_overdue", op: "gt", value: 60 },
      ],
      [{ column: "balance_cents", fn: "sum" }]
    ),
  ]);

  const revenueCents = num(inYear?.sum_total_cents);
  const invoiceCount = num(inYear?.count_total_cents);
  const arCents = num(openAll?.sum_balance_cents);
  const arOver60Cents = num(openOver60?.sum_balance_cents);

  // DSO: open AR ÷ average daily issued revenue for the year so far.
  let arDays: number | null = null;
  if (revenueCents > 0 && w.daysElapsed > 0) {
    arDays = round(arCents / (revenueCents / w.daysElapsed));
  }

  return {
    revenue_invoiced: invoiceCount > 0 ? dollars(revenueCents) : null,
    avg_invoice_value: invoiceCount > 0 ? dollars(num(inYear?.avg_total_cents)) : null,
    ar_outstanding: dollars(arCents),
    ar_over_60_pct: arCents > 0 ? pctOf(arOver60Cents, arCents) : null,
    ar_days: arDays,
  };
}

interface PaymentRow {
  amount_cents: number | null;
  refunded_amount_cents: number | null;
}

async function computePayments(supabase: Client, w: YearWindow): Promise<Values> {
  // Rule B applied on the base table (see header comment).
  const rows = await fetchAll<PaymentRow>((from, to) =>
    supabase
      .from("crm_payments")
      .select("amount_cents, refunded_amount_cents")
      .is("deleted_at", null)
      .eq("is_credit", false)
      .neq("method", AR_WRITE_OFF_METHOD)
      .gte("payment_date", w.from)
      .lte("payment_date", w.to)
      .order("payment_date", { ascending: true })
      .range(from, to)
  );
  if (rows.length === 0) return { cash_collected_ytd: null };
  const netCents = rows.reduce((s, r) => s + (r.amount_cents ?? 0) - (r.refunded_amount_cents ?? 0), 0);
  return { cash_collected_ytd: dollars(netCents) };
}

async function computeJobsSold(supabase: Client, w: YearWindow): Promise<Values> {
  const row = await total(
    supabase,
    "rpt_jobs",
    dateFilters("date_sold", w),
    [
      { column: "total_cents", fn: "sum" },
      { column: "total_cents", fn: "count" },
    ]
  );
  const count = num(row?.count_total_cents);
  return { revenue_sold: count > 0 ? dollars(num(row?.sum_total_cents)) : null };
}

async function computeEstimates(supabase: Client, w: YearWindow): Promise<Values> {
  const [byStageInYear, byStageAll] = await Promise.all([
    aggregate(
      supabase,
      "rpt_estimates",
      dateFilters("estimate_date", w),
      [
        { column: "total_cents", fn: "sum" },
        { column: "total_cents", fn: "count" },
      ],
      ["stage"]
    ),
    aggregate(
      supabase,
      "rpt_estimates",
      [{ column: "stage", op: "in", value: ["quote", "sent", "approved"] }],
      [{ column: "total_cents", fn: "sum" }],
      ["stage"]
    ),
  ]);

  const sums = new Map<string, { cents: number; count: number }>();
  for (const r of byStageInYear) {
    const stage = String(r.stage ?? "");
    sums.set(stage, { cents: num(r.sum_total_cents), count: num(r.count_total_cents) });
  }
  const get = (stage: string) => sums.get(stage) ?? { cents: 0, count: 0 };

  const won = { cents: get("won").cents + get("invoiced").cents, count: get("won").count + get("invoiced").count };
  const lost = get("lost");
  const nonDraft = [...sums.entries()]
    .filter(([stage]) => stage !== "draft")
    .reduce((acc, [, v]) => ({ cents: acc.cents + v.cents, count: acc.count + v.count }), { cents: 0, count: 0 });

  const pipelineCents = byStageAll.reduce((sum, r) => sum + num(r.sum_total_cents), 0);

  return {
    won_estimates_ytd: won.count > 0 ? dollars(won.cents) : null,
    close_ratio: won.count + lost.count > 0 ? pctOf(won.count, won.count + lost.count) : null,
    estimates_sent_ytd: nonDraft.count > 0 || sums.size > 0 ? nonDraft.count : null,
    avg_estimate_value: nonDraft.count > 0 ? dollars(nonDraft.cents / nonDraft.count) : null,
    open_pipeline: dollars(pipelineCents),
  };
}

async function computeContractsAndBalances(supabase: Client): Promise<Values> {
  const [contracts, clients, active] = await Promise.all([
    total(
      supabase,
      "rpt_contracts",
      [{ column: "is_active", op: "eq", value: true }],
      [{ column: "monthly_amount_cents", fn: "sum" }]
    ),
    total(supabase, "rpt_clients", [], [{ column: "balance_uninvoiced_cents", fn: "sum" }]),
    total(
      supabase,
      "rpt_clients",
      [{ column: "status", op: "eq", value: "active" }],
      [{ column: "status", fn: "count" }]
    ),
  ]);
  return {
    contract_mrr: dollars(num(contracts?.sum_monthly_amount_cents)),
    uninvoiced_balance: dollars(num(clients?.sum_balance_uninvoiced_cents)),
    active_clients: num(active?.count_status),
  };
}

interface ClientRow {
  id: string;
  account_type: string;
  status: string;
  created_at: string;
  client_since: string | null;
  closed_at: string | null;
  source: string | null;
  referred_by: string | null;
  referred_by_client_id: string | null;
}

interface MaintenanceJobRow {
  client_id: string;
  status: string;
  created_at: string;
  recurrence_end: string | null;
}

/** Job types that constitute ongoing maintenance (vs. one-time/project work). */
const MAINTENANCE_JOB_TYPES = ["recurring", "package"];

async function computeClients(supabase: Client, w: YearWindow): Promise<Values> {
  const [rows, maintenanceJobs] = await Promise.all([
    fetchAll<ClientRow>((from, to) =>
      supabase
        .from("clients")
        .select("id, account_type, status, created_at, client_since, closed_at, source, referred_by, referred_by_client_id")
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .range(from, to)
    ),
    fetchAll<MaintenanceJobRow>((from, to) =>
      supabase
        .from("crm_jobs")
        .select("client_id, status, created_at, recurrence_end")
        .in("job_type", MAINTENANCE_JOB_TYPES)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .range(from, to)
    ),
  ]);

  const jan1 = new Date(w.year, 0, 1).getTime();
  const end = w.periodEnd.getTime();
  const inYear = (v: string | null) => {
    if (!v) return false;
    const t = new Date(v).getTime();
    return t >= jan1 && t <= end;
  };
  const before = (v: string | null, at: number) => !!v && new Date(v).getTime() < at;

  const createdInYear = rows.filter((r) => inYear(r.created_at));
  const converted = createdInYear.filter((r) => r.client_since && r.status !== "lead").length;
  const referrals = createdInYear.filter(
    (r) => !!r.referred_by || !!r.referred_by_client_id || /referr/i.test(r.source ?? "")
  ).length;

  const newClients = rows.filter((r) => r.status !== "lead" && inYear(r.client_since)).length;
  const cancellations = rows.filter(
    (r) => (r.status === "cancelled" || r.status === "lost") && inYear(r.closed_at)
  ).length;

  // Retention: clients on Jan 1 (client_since before Jan 1, not closed before
  // Jan 1) who were still not closed by period end.
  const base = rows.filter((r) => before(r.client_since, jan1) && !before(r.closed_at, jan1));
  const retained = base.filter((r) => !r.closed_at || new Date(r.closed_at).getTime() > end).length;

  // Maintenance retention: a "maintenance client" has a recurring or package
  // job. Base = clients with such a job created before Jan 1 who weren't
  // closed before Jan 1. Retained = still open at period end AND still holding
  // a non-cancelled maintenance job whose recurrence hasn't ended before Jan 1.
  const hadMaintenanceBefore = new Set<string>();
  const hasLiveMaintenance = new Set<string>();
  for (const j of maintenanceJobs) {
    if (new Date(j.created_at).getTime() < jan1) hadMaintenanceBefore.add(j.client_id);
    const ended = j.recurrence_end ? new Date(`${j.recurrence_end}T23:59:59`).getTime() < jan1 : false;
    if (j.status !== "cancelled" && !ended) hasLiveMaintenance.add(j.client_id);
  }
  const maintenanceBase = rows.filter(
    (r) => hadMaintenanceBefore.has(r.id) && !before(r.closed_at, jan1)
  );
  const isRetainedMaintenance = (r: ClientRow) =>
    (!r.closed_at || new Date(r.closed_at).getTime() > end) && hasLiveMaintenance.has(r.id);
  const retentionFor = (subset: ClientRow[]) =>
    subset.length > 0 ? pctOf(subset.filter(isRetainedMaintenance).length, subset.length) : null;

  return {
    maintenance_retention_rate: retentionFor(maintenanceBase),
    maintenance_retention_residential: retentionFor(maintenanceBase.filter((r) => r.account_type === "residential")),
    maintenance_retention_commercial: retentionFor(maintenanceBase.filter((r) => r.account_type === "commercial")),
    new_leads_ytd: createdInYear.length > 0 ? createdInYear.length : rows.length > 0 ? 0 : null,
    new_clients_ytd: rows.length > 0 ? newClients : null,
    lead_conversion_rate: createdInYear.length > 0 ? pctOf(converted, createdInYear.length) : null,
    referral_lead_pct: createdInYear.length > 0 ? pctOf(referrals, createdInYear.length) : null,
    client_cancellations_ytd: rows.length > 0 ? cancellations : null,
    client_retention_rate: base.length > 0 ? pctOf(retained, base.length) : null,
  };
}

async function computeVisits(supabase: Client, w: YearWindow): Promise<Values> {
  const [costing, byStatus] = await Promise.all([
    loadVisitCosting(supabase, { from: w.from, to: w.to }),
    aggregate(
      supabase,
      "rpt_job_visits",
      [
        ...dateFilters("scheduled_date", w),
        { column: "status", op: "in", value: ["completed", "skipped", "cancelled"] },
      ],
      [{ column: "status", fn: "count" }],
      ["status"]
    ),
  ]);

  const visits: CostedVisit[] = costing.visits;
  let revenue = 0,
    labor = 0,
    materials = 0,
    budgeted = 0,
    actual = 0,
    targetWeighted = 0;
  for (const v of visits) {
    revenue += v.revenueCents;
    labor += v.laborCostCents;
    materials += v.materialsCostCents;
    budgeted += v.budgetedHours;
    actual += v.manHours;
    targetWeighted += weightedTargetRate(v.services, costing.services) * v.manHours;
  }
  const grossProfit = revenue - labor - materials;
  const revPerManHr = actual > 0 ? revenue / actual : 0;
  const targetRate = actual > 0 ? targetWeighted / actual : 0;

  const statusCounts = new Map<string, number>();
  for (const r of byStatus) statusCounts.set(String(r.status ?? ""), num(r.count_status));
  const completed = statusCounts.get("completed") ?? 0;
  const skipped = statusCounts.get("skipped") ?? 0;
  const cancelled = statusCounts.get("cancelled") ?? 0;
  const resolved = completed + skipped + cancelled;

  const has = visits.length > 0;
  return {
    visits_completed_ytd: has ? visits.length : null,
    gross_margin_ytd: revenue > 0 ? pctOf(grossProfit, revenue) : null,
    gross_profit_ytd: has ? dollars(grossProfit) : null,
    labor_pct_revenue: revenue > 0 ? pctOf(labor, revenue) : null,
    materials_pct_revenue: revenue > 0 ? pctOf(materials, revenue) : null,
    rev_per_man_hour: actual > 0 ? dollars(revPerManHr) : null,
    budget_vs_actual_hours_pct: actual > 0 && budgeted > 0 ? pctOf(budgeted, actual) : null,
    avb_variance: has && budgeted > 0 ? round(budgeted - actual) : null,
    hours_variance_pct: budgeted > 0 ? pctOf(actual - budgeted, budgeted) : null,
    rev_per_man_hr_vs_target: targetRate > 0 && revPerManHr > 0 ? pctOf(revPerManHr, targetRate) : null,
    visit_completion_rate: resolved > 0 ? pctOf(completed, resolved) : null,
    skipped_visit_pct: resolved > 0 ? pctOf(skipped, resolved) : null,
  };
}

interface TimesheetRow {
  member_name: string | null;
  work_date: string | null;
  hours: number | null;
}

/** ISO-week bucket key (Monday-based) for a YYYY-MM-DD date string. */
function weekKey(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

async function computeTimesheets(supabase: Client, w: YearWindow): Promise<Values> {
  const rows = await fetchAll<TimesheetRow>((from, to) =>
    supabase
      .from("rpt_timesheets")
      .select("member_name, work_date, hours")
      .gte("work_date", w.from)
      .lte("work_date", w.to)
      .not("hours", "is", null)
      .order("work_date", { ascending: true })
      .range(from, to)
  );

  const weekly = new Map<string, number>();
  let totalHours = 0;
  for (const r of rows) {
    if (!r.work_date || !r.hours) continue;
    const key = `${r.member_name ?? "?"}|${weekKey(r.work_date)}`;
    weekly.set(key, (weekly.get(key) ?? 0) + r.hours);
    totalHours += r.hours;
  }
  let otHours = 0;
  for (const hours of weekly.values()) otHours += Math.max(0, hours - 40);

  return {
    ot_pct_hours: totalHours > 0 ? pctOf(otHours, totalHours) : null,
    avg_weekly_hours_per_employee: weekly.size > 0 ? round(totalHours / weekly.size) : null,
  };
}

interface EmployeeRow {
  date_hired: string | null;
  date_released: string | null;
  rehire_date: string | null;
  is_active: boolean;
}

async function computeEmployees(supabase: Client, w: YearWindow): Promise<Values> {
  const { data, error } = await supabase
    .from("crm_employees")
    .select("date_hired, date_released, rehire_date, is_active")
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as EmployeeRow[];

  const jan1 = new Date(w.year, 0, 1).getTime();
  const end = w.periodEnd.getTime();
  const ts = (v: string | null) => (v ? new Date(v).getTime() : null);
  const inYear = (v: string | null) => {
    const t = ts(v);
    return t !== null && t >= jan1 && t <= end;
  };

  // Employed on Jan 1: hired before Jan 1 (or unknown hire date but active),
  // and not released before Jan 1.
  const employedJan1 = rows.filter((r) => {
    const hired = ts(r.date_hired);
    const released = ts(r.date_released);
    const wasHired = hired !== null ? hired < jan1 : r.is_active;
    const wasReleased = released !== null && released < jan1;
    return wasHired && !wasReleased;
  });
  const retained = employedJan1.filter((r) => {
    const released = ts(r.date_released);
    return released === null || released > end;
  }).length;

  const newHires = rows.filter((r) => inYear(r.date_hired) || inYear(r.rehire_date)).length;
  const terminations = rows.filter((r) => inYear(r.date_released)).length;

  const active = rows.filter((r) => r.is_active && !r.date_released);
  const tenures = active
    .map((r) => ts(r.date_hired))
    .filter((t): t is number => t !== null)
    .map((t) => (Date.now() - t) / (365.25 * 86_400_000));
  const avgTenure = tenures.length > 0 ? round(tenures.reduce((s, t) => s + t, 0) / tenures.length) : null;

  return {
    employee_retention: employedJan1.length > 0 ? pctOf(retained, employedJan1.length) : null,
    active_employees: rows.length > 0 ? active.length : null,
    new_hires_ytd: rows.length > 0 ? newHires : null,
    terminations_ytd: rows.length > 0 ? terminations : null,
    avg_tenure_years: avgTenure,
  };
}

interface TicketRow {
  created_at: string;
  closed_at: string | null;
}

async function computeTickets(supabase: Client, w: YearWindow): Promise<Values> {
  const [closed, open] = await Promise.all([
    fetchAll<TicketRow>((from, to) =>
      supabase
        .from("crm_tickets")
        .select("created_at, closed_at")
        .is("deleted_at", null)
        .gte("closed_at", w.fromTs)
        .lte("closed_at", w.toTs)
        .order("closed_at", { ascending: true })
        .range(from, to)
    ),
    supabase
      .from("crm_tickets")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .is("closed_at", null),
  ]);
  if (open.error) throw new Error(open.error.message);

  const days = closed
    .filter((t) => t.closed_at)
    .map((t) => (new Date(t.closed_at as string).getTime() - new Date(t.created_at).getTime()) / 86_400_000)
    .filter((d) => d >= 0);
  const avg = days.length > 0 ? round(days.reduce((s, d) => s + d, 0) / days.length) : null;

  return {
    avg_ticket_resolution_days: avg,
    open_tickets: open.count ?? null,
  };
}

async function computeDamageCases(supabase: Client): Promise<Values> {
  const { data, error } = await supabase
    .from("damage_cases")
    .select("date_of_incident")
    .is("deleted_at", null)
    .order("date_of_incident", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const last = data?.[0]?.date_of_incident;
  if (!last) return { days_since_last_damage_case: null };
  const days = Math.floor((Date.now() - new Date(`${last}T00:00:00`).getTime()) / 86_400_000);
  return { days_since_last_damage_case: Math.max(0, days) };
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Computes every auto metric for `year`. Each data area is isolated: a
 * failure in one (e.g. a view missing on a drifted environment) logs and
 * yields nulls for that area's metrics instead of failing the whole card.
 */
export async function computeLandscaptKpiActuals(
  supabase: Client,
  year: number
): Promise<KpiComputedActuals> {
  const w = buildWindow(year);

  const areas: Array<[string, () => Promise<Values>]> = [
    ["invoices", () => computeInvoices(supabase, w)],
    ["payments", () => computePayments(supabase, w)],
    ["jobs", () => computeJobsSold(supabase, w)],
    ["estimates", () => computeEstimates(supabase, w)],
    ["contracts", () => computeContractsAndBalances(supabase)],
    ["clients", () => computeClients(supabase, w)],
    ["visits", () => computeVisits(supabase, w)],
    ["timesheets", () => computeTimesheets(supabase, w)],
    ["employees", () => computeEmployees(supabase, w)],
    ["tickets", () => computeTickets(supabase, w)],
    ["damage_cases", () => computeDamageCases(supabase)],
  ];

  const settled = await Promise.allSettled(areas.map(([, fn]) => fn()));
  const values: Values = {};
  settled.forEach((res, i) => {
    if (res.status === "fulfilled") {
      Object.assign(values, res.value);
    } else {
      log.error(`KPI area "${areas[i][0]}" failed`, { year, error: String(res.reason) });
    }
  });

  return { period: String(year), values, computedAt: new Date().toISOString() };
}
