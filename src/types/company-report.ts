// ============================================================
// Company Report — the Landscapt-native replacement for the old
// screenshot-fed "CRM Report" (Service Autopilot summary uploaded by hand).
// Computed live from Landscapt data by src/lib/company-report/compute.ts.
// Always "as of now" — YTD from Jan 1 of the current year, trailing 3
// calendar months ending with the current month (MTD).
// ============================================================

export interface RepBreakdown {
  label: string;
  count: number;
  amountCents: number;
}

export interface MonthlyClientTrend {
  /** e.g. "Jun 2026", "Aug 2026 MTD" for the current month. */
  label: string;
  newClients: number;
  newLeads: number;
  /** newClients / newLeads for that month, percent 0-100, null if no leads. */
  conversionPct: number | null;
  terminated: number;
}

export interface CloseRatioRow {
  salesRep: string;
  wonCount: number;
  wonAmountCents: number;
  /** wonCount / totalEstimatesThisMonth (all reps, all stages), percent. */
  countPct: number;
  /** wonAmountCents / totalWonAmountThisMonth (all reps), percent. */
  amountPct: number;
}

export interface PipelineStage {
  stage: string;
  amountCents: number;
  pct: number;
}

export interface EstimateSummary {
  clientName: string;
  amountCents: number;
}

export interface SalesSection {
  monthlyTrend: MonthlyClientTrend[];
  closeRatios: {
    totalEstimates: number;
    totalWonAmountCents: number;
    rows: CloseRatioRow[];
  };
  openPipeline: {
    totalAmountCents: number;
    totalCount: number;
    byStage: PipelineStage[];
    topEstimates: EstimateSummary[];
    byRep: RepBreakdown[];
  };
  wonEstimatesYtd: {
    totalAmountCents: number;
    rows: RepBreakdown[];
    openCountByRep: RepBreakdown[];
  };
  newClientsThisMonth: {
    total: number;
    byRep: RepBreakdown[];
    bySource: RepBreakdown[];
    ytdTopSources: RepBreakdown[];
  };
}

export interface MonthlyOpsRow {
  label: string;
  totalInvoicedCents: number;
  salesTaxCents: number;
  unpaidCents: number;
  percentPaid: number | null;
  /** Only populated for the current month — a live balance, not a historical figure. */
  uninvoicedCents: number | null;
  paymentsReceivedCents: number;
}

export interface TicketBreakdown {
  byCategory: RepBreakdown[];
  byAssignee: RepBreakdown[];
  unassignedOpen: number;
  dueWithin7Days: RepBreakdown[];
}

export interface PaymentPoolSummary {
  /** Payments matching the pool's filter (prepayment or any), cash rule applied. */
  receivedCents: number;
  unusedCents: number;
  appliedCents: number;
  topUnused: Array<{ clientName: string; unusedCents: number }>;
}

export interface OperationsSection {
  monthlyOps: MonthlyOpsRow[];
  tickets: TicketBreakdown;
  unappliedPayments: PaymentPoolSummary;
  prePayments: PaymentPoolSummary;
}

export type AgingBadge = "ok" | "monitor" | "action" | "escalate";

export interface AgingBucketTotals {
  currentCents: number;
  d1_30Cents: number;
  d31_60Cents: number;
  d61_90Cents: number;
  d90PlusCents: number;
  totalCents: number;
}

export interface ClientBalanceRow {
  clientName: string;
  totalCents: number;
  d61_90Cents: number;
  d90PlusCents: number;
  badge: AgingBadge;
}

export interface CollectionsSection {
  buckets: AgingBucketTotals;
  topBalances: ClientBalanceRow[];
}

export type FlagSeverity = "alert" | "caution" | "good";

export interface CompanyReportFlag {
  severity: FlagSeverity;
  title: string;
  detail: string;
}

export interface KpiWithTarget {
  valueCents: number | null;
  /** Dollars, not cents — matches crm_kpi_scorecard_entries.target_value units. */
  targetDollars: number | null;
}

export interface CompanyReportKpis {
  invoicedRevenueYtd: KpiWithTarget;
  arOutstandingCents: number | null;
  newClientsYtd: { value: number | null; target: number | null };
  newLeadsYtd: { value: number | null; target: number | null };
}

export interface CompanyReportData {
  generatedAt: string;
  /** e.g. "Jan 1 – Aug 21, 2026". */
  ytdRangeLabel: string;
  kpis: CompanyReportKpis;
  sales: SalesSection;
  operations: OperationsSection;
  collections: CollectionsSection;
  flags: CompanyReportFlag[];
}
