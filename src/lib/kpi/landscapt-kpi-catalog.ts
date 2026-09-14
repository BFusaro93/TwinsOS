import type { KpiScorecardConfig, KpiUnit } from "@/types/crm-kpi-scorecard";

// ============================================================
// Landscapt KPI Scorecard — metric catalog.
//
// Every metric a user can put on their scorecard. `auto: true` metrics are
// computed live from Landscapt data by src/lib/kpi/landscapt-kpi-compute.ts
// (the key there MUST match the key here); `auto: false` metrics have no
// Landscapt data source and are typed in by hand each year.
//
// Keys for the metrics carried over from the legacy Twins scorecard
// (src/components/operations/KpiDashboard.tsx) are kept identical so the
// two scorecards read the same, but they live in separate tables
// (crm_kpi_scorecard_entries vs kpi_actuals) and never share values.
// ============================================================

export type KpiCategoryKey = "financial" | "operations" | "sales" | "people";

export interface KpiCatalogMetric {
  key: string;
  label: string;
  unit: KpiUnit;
  /** Suggested home category — the user can place it anywhere. */
  category: KpiCategoryKey;
  /** Computed from Landscapt data (true) or manually entered (false). */
  auto: boolean;
  /** Where the number comes from, or why it can't be derived. Shown in the picker. */
  source: string;
  defaultTarget: number | null;
  lowerIsBetter?: boolean;
  /** Was on the legacy Twins scorecard (used for the default layout). */
  legacy?: boolean;
  /** Value is a point-in-time snapshot, not scoped to the selected year. */
  snapshot?: boolean;
}

export const KPI_CATEGORY_LABELS: Record<KpiCategoryKey, string> = {
  financial: "Financial",
  operations: "Operations",
  sales: "Sales",
  people: "People",
};

export const KPI_CATALOG: KpiCatalogMetric[] = [
  // ── Financial ─────────────────────────────────────────────────────────────
  {
    key: "revenue_sold",
    label: "Revenue (Sold)",
    unit: "currency",
    category: "financial",
    auto: true,
    legacy: true,
    defaultTarget: null,
    source: "Jobs: sum of job totals whose Date Sold falls in the year.",
  },
  {
    key: "revenue_invoiced",
    label: "Revenue (Invoiced)",
    unit: "currency",
    category: "financial",
    auto: true,
    legacy: true,
    defaultTarget: null,
    source: "Invoices: sum of issued (not draft/void) invoice totals dated in the year.",
  },
  {
    key: "gross_margin_ytd",
    label: "Gross Margin YTD",
    unit: "percent",
    category: "financial",
    auto: true,
    legacy: true,
    defaultTarget: 50,
    source:
      "Job costing: (visit revenue − crew labor cost − materials) ÷ revenue across completed visits in the year. Same math as the Job Costing report.",
  },
  {
    key: "noi_margin_ytd",
    label: "NOI Margin YTD",
    unit: "percent",
    category: "financial",
    auto: false,
    legacy: true,
    defaultTarget: 20,
    source: "Not tracked — Landscapt has no operating-expense ledger (comes from your accounting system).",
  },
  {
    key: "net_margin_ytd",
    label: "Net Margin YTD",
    unit: "percent",
    category: "financial",
    auto: false,
    legacy: true,
    defaultTarget: 15,
    source: "Not tracked — net income lives in your accounting system.",
  },
  {
    key: "overhead_ratio",
    label: "Overhead Ratio",
    unit: "percent",
    category: "financial",
    auto: false,
    legacy: true,
    defaultTarget: 25,
    lowerIsBetter: true,
    source: "Not tracked — overhead spend is not recorded in Landscapt (only the estimating overhead % assumption).",
  },
  {
    key: "ar_days",
    label: "AR Days",
    unit: "days",
    category: "financial",
    auto: true,
    legacy: true,
    defaultTarget: 30,
    lowerIsBetter: true,
    source:
      "Invoices: open issued balance ÷ (issued revenue in the year ÷ days elapsed in the year). Days-sales-outstanding.",
  },
  {
    key: "ap_days",
    label: "AP Days",
    unit: "days",
    category: "financial",
    auto: false,
    legacy: true,
    defaultTarget: 30,
    lowerIsBetter: true,
    source: "Not tracked — vendor bills and payments are not recorded in Landscapt.",
  },
  {
    key: "cash_collected_ytd",
    label: "Cash Collected YTD",
    unit: "currency",
    category: "financial",
    auto: true,
    defaultTarget: null,
    source: "Payments: cash received (excludes account credits and AR write-offs), net of refunds, dated in the year.",
  },
  {
    key: "gross_profit_ytd",
    label: "Gross Profit YTD",
    unit: "currency",
    category: "financial",
    auto: true,
    defaultTarget: null,
    source: "Job costing: visit revenue − labor − materials across completed visits in the year.",
  },
  {
    key: "labor_pct_revenue",
    label: "Labor % of Revenue",
    unit: "percent",
    category: "financial",
    auto: true,
    defaultTarget: 35,
    lowerIsBetter: true,
    source: "Job costing: crew labor cost ÷ visit revenue on completed visits in the year.",
  },
  {
    key: "materials_pct_revenue",
    label: "Materials % of Revenue",
    unit: "percent",
    category: "financial",
    auto: true,
    defaultTarget: 15,
    lowerIsBetter: true,
    source: "Job costing: materials logged to visits/jobs ÷ visit revenue on completed visits in the year.",
  },
  {
    key: "rev_per_man_hour",
    label: "Revenue per Man-Hour",
    unit: "currency",
    category: "financial",
    auto: true,
    defaultTarget: null,
    source: "Job Visits: visit revenue ÷ actual man-hours on completed visits in the year.",
  },
  {
    key: "avg_invoice_value",
    label: "Average Invoice Value",
    unit: "currency",
    category: "financial",
    auto: true,
    defaultTarget: null,
    source: "Invoices: average issued invoice total dated in the year.",
  },
  {
    key: "ar_outstanding",
    label: "AR Outstanding",
    unit: "currency",
    category: "financial",
    auto: true,
    snapshot: true,
    defaultTarget: null,
    lowerIsBetter: true,
    source: "Invoices: open balance on issued invoices, as of today.",
  },
  {
    key: "ar_over_60_pct",
    label: "AR Over 60 Days %",
    unit: "percent",
    category: "financial",
    auto: true,
    snapshot: true,
    defaultTarget: 10,
    lowerIsBetter: true,
    source: "Invoices: open balance more than 60 days overdue ÷ total open balance, as of today.",
  },
  {
    key: "contract_mrr",
    label: "Contract Monthly Recurring Revenue",
    unit: "currency",
    category: "financial",
    auto: true,
    snapshot: true,
    defaultTarget: null,
    source: "Contracts: sum of monthly amounts on active contracts, as of today.",
  },
  {
    key: "uninvoiced_balance",
    label: "Uninvoiced Work",
    unit: "currency",
    category: "financial",
    auto: true,
    snapshot: true,
    defaultTarget: null,
    lowerIsBetter: true,
    source: "Clients: completed-but-not-yet-invoiced balance across all accounts, as of today.",
  },

  // ── Operations ────────────────────────────────────────────────────────────
  {
    key: "labor_efficiency",
    label: "Labor Efficiency (YTD)",
    unit: "percent",
    category: "operations",
    auto: false,
    legacy: true,
    defaultTarget: 100,
    source:
      "Manual for now — on-site hours ÷ payroll clocked hours needs a payroll (Gusto) hours feed that Landscapt doesn't have yet. See “Budget vs Actual Hours” for the Landscapt-native version.",
  },
  {
    key: "budget_vs_actual_hours_pct",
    label: "Budget vs Actual Hours",
    unit: "percent",
    category: "operations",
    auto: true,
    defaultTarget: 100,
    source:
      "Job Visits: budgeted man-hours ÷ actual man-hours on completed visits in the year. 100% = on budget; above 100% = under budget.",
  },
  {
    key: "avb_variance",
    label: "AvB Variance (Est vs Actual)",
    unit: "hours",
    category: "operations",
    auto: true,
    legacy: true,
    defaultTarget: null,
    source: "Job Visits: budgeted man-hours − actual man-hours on completed visits in the year. Positive = under budget.",
  },
  {
    key: "ot_pct_hours",
    label: "OT % of Total Hours",
    unit: "percent",
    category: "operations",
    auto: true,
    legacy: true,
    defaultTarget: 10,
    lowerIsBetter: true,
    source:
      "Timesheets: per employee per week, hours above 40 ÷ total clocked hours. Approximate — only visit clock time is tracked, not shop or drive time.",
  },
  {
    key: "fleet_avg_safety_score",
    label: "Fleet Avg Safety Score (YTD)",
    unit: "number",
    category: "operations",
    auto: false,
    legacy: true,
    defaultTarget: 90,
    source: "Not tracked — telematics safety scores (Samsara) are not integrated with Landscapt.",
  },
  {
    key: "visits_completed_ytd",
    label: "Visits Completed YTD",
    unit: "number",
    category: "operations",
    auto: true,
    defaultTarget: null,
    source: "Job Visits: count of visits completed in the year.",
  },
  {
    key: "visit_completion_rate",
    label: "Visit Completion Rate",
    unit: "percent",
    category: "operations",
    auto: true,
    defaultTarget: 95,
    source: "Job Visits: completed ÷ (completed + skipped + cancelled) visits scheduled in the year.",
  },
  {
    key: "skipped_visit_pct",
    label: "Skipped Visit %",
    unit: "percent",
    category: "operations",
    auto: true,
    defaultTarget: 3,
    lowerIsBetter: true,
    source: "Job Visits: skipped ÷ (completed + skipped + cancelled) visits scheduled in the year.",
  },
  {
    key: "hours_variance_pct",
    label: "Hours Over Budget %",
    unit: "percent",
    category: "operations",
    auto: true,
    defaultTarget: 0,
    lowerIsBetter: true,
    source: "Job Visits: (actual − budgeted man-hours) ÷ budgeted man-hours on completed visits in the year.",
  },
  {
    key: "rev_per_man_hr_vs_target",
    label: "Rev / Man-Hr vs Target",
    unit: "percent",
    category: "operations",
    auto: true,
    defaultTarget: 100,
    source:
      "Job costing: actual revenue per man-hour ÷ the man-hour-weighted service target rate ($/man-hr on each service). 100% = on target.",
  },
  {
    key: "avg_ticket_resolution_days",
    label: "Avg Ticket Resolution (Days)",
    unit: "days",
    category: "operations",
    auto: true,
    defaultTarget: 3,
    lowerIsBetter: true,
    source: "Tickets: average days from opened to closed for tickets closed in the year.",
  },
  {
    key: "open_tickets",
    label: "Open Tickets",
    unit: "number",
    category: "operations",
    auto: true,
    snapshot: true,
    defaultTarget: null,
    lowerIsBetter: true,
    source: "Tickets: tickets not yet closed, as of today.",
  },

  // ── Sales ─────────────────────────────────────────────────────────────────
  {
    key: "new_clients_ytd",
    label: "New Clients YTD",
    unit: "number",
    category: "sales",
    auto: true,
    legacy: true,
    defaultTarget: null,
    source: "Clients: accounts whose Client Since date falls in the year (excluding accounts still marked Lead).",
  },
  {
    key: "lead_conversion_rate",
    label: "Lead Conversion Rate",
    unit: "percent",
    category: "sales",
    auto: true,
    legacy: true,
    defaultTarget: 45,
    source: "Clients: accounts created in the year that have since become clients ÷ all accounts created in the year.",
  },
  {
    key: "close_ratio",
    label: "Close Ratio (Estimates Won %)",
    unit: "percent",
    category: "sales",
    auto: true,
    legacy: true,
    defaultTarget: 45,
    source: "Estimates: won ÷ (won + lost) estimates dated in the year.",
  },
  {
    key: "new_leads_ytd",
    label: "New Leads YTD",
    unit: "number",
    category: "sales",
    auto: true,
    legacy: true,
    defaultTarget: null,
    source: "Clients: accounts created in the year (every account starts as a lead).",
  },
  {
    key: "won_estimates_ytd",
    label: "Won Estimates YTD",
    unit: "currency",
    category: "sales",
    auto: true,
    legacy: true,
    defaultTarget: null,
    source: "Estimates: total value of won (or invoiced) estimates dated in the year.",
  },
  {
    key: "estimates_sent_ytd",
    label: "Estimates Sent YTD",
    unit: "number",
    category: "sales",
    auto: true,
    defaultTarget: null,
    source: "Estimates: count of non-draft estimates dated in the year.",
  },
  {
    key: "avg_estimate_value",
    label: "Average Estimate Value",
    unit: "currency",
    category: "sales",
    auto: true,
    defaultTarget: null,
    source: "Estimates: average total of non-draft estimates dated in the year.",
  },
  {
    key: "open_pipeline",
    label: "Open Estimate Pipeline",
    unit: "currency",
    category: "sales",
    auto: true,
    snapshot: true,
    defaultTarget: null,
    source: "Estimates: total value of estimates in Quote, Sent, or Approved stage, as of today.",
  },
  {
    key: "client_cancellations_ytd",
    label: "Client Cancellations YTD",
    unit: "number",
    category: "sales",
    auto: true,
    defaultTarget: null,
    lowerIsBetter: true,
    source: "Clients: accounts closed as Cancelled or Lost during the year.",
  },
  {
    key: "client_retention_rate",
    label: "Client Retention Rate",
    unit: "percent",
    category: "sales",
    auto: true,
    defaultTarget: 90,
    source: "Clients: accounts that were clients on Jan 1 and had not been closed by year end (or today) ÷ clients on Jan 1.",
  },
  {
    key: "maintenance_retention_rate",
    label: "Maintenance Retention Rate",
    unit: "percent",
    category: "sales",
    auto: true,
    defaultTarget: 90,
    source:
      "Jobs + Clients: clients with a recurring or package job before Jan 1 who, by year end (or today), are still open and still have a non-cancelled recurring/package job ÷ those clients on Jan 1.",
  },
  {
    key: "maintenance_retention_residential",
    label: "Maintenance Retention — Residential",
    unit: "percent",
    category: "sales",
    auto: true,
    defaultTarget: 90,
    source: "Maintenance Retention Rate, residential accounts only.",
  },
  {
    key: "maintenance_retention_commercial",
    label: "Maintenance Retention — Commercial",
    unit: "percent",
    category: "sales",
    auto: true,
    defaultTarget: 90,
    source: "Maintenance Retention Rate, commercial accounts only.",
  },
  {
    key: "active_clients",
    label: "Active Clients",
    unit: "number",
    category: "sales",
    auto: true,
    snapshot: true,
    defaultTarget: null,
    source: "Clients: accounts with Active status, as of today.",
  },
  {
    key: "referral_lead_pct",
    label: "Referral Lead %",
    unit: "percent",
    category: "sales",
    auto: true,
    defaultTarget: 25,
    source: "Clients: accounts created in the year with a referrer or a referral source ÷ all accounts created in the year.",
  },

  // ── People ────────────────────────────────────────────────────────────────
  {
    key: "employee_retention",
    label: "Employee Retention",
    unit: "percent",
    category: "people",
    auto: true,
    legacy: true,
    defaultTarget: 80,
    source: "Employees: staff employed on Jan 1 who were not released during the year ÷ staff employed on Jan 1.",
  },
  {
    key: "employee_enps",
    label: "Employee Engagement eNPS",
    unit: "number",
    category: "people",
    auto: false,
    legacy: true,
    defaultTarget: 60,
    source: "Not tracked — no employee survey tool in Landscapt.",
  },
  {
    key: "training_hrs_per_emp",
    label: "Training Hours Per Employee",
    unit: "hours",
    category: "people",
    auto: false,
    legacy: true,
    defaultTarget: 24,
    source: "Not tracked — training records are not kept in Landscapt.",
  },
  {
    key: "training_completion",
    label: "Training Completion Rate",
    unit: "percent",
    category: "people",
    auto: false,
    legacy: true,
    defaultTarget: 100,
    source: "Not tracked — training records are not kept in Landscapt.",
  },
  {
    key: "accident_free_workdays",
    label: "Accident Free Workdays",
    unit: "days",
    category: "people",
    auto: false,
    legacy: true,
    defaultTarget: 100,
    source: "Not tracked — workplace incidents are not logged in Landscapt (property Damage Cases are, see “Days Since Last Damage Case”).",
  },
  {
    key: "absenteeism_rate",
    label: "Absenteeism Rate",
    unit: "percent",
    category: "people",
    auto: false,
    legacy: true,
    defaultTarget: 3,
    lowerIsBetter: true,
    source: "Not tracked — attendance and time off are not recorded in Landscapt.",
  },
  {
    key: "active_employees",
    label: "Active Employees",
    unit: "number",
    category: "people",
    auto: true,
    snapshot: true,
    defaultTarget: null,
    source: "Employees: active, non-released staff, as of today.",
  },
  {
    key: "new_hires_ytd",
    label: "New Hires YTD",
    unit: "number",
    category: "people",
    auto: true,
    defaultTarget: null,
    source: "Employees: Date Hired (or Rehire Date) in the year.",
  },
  {
    key: "terminations_ytd",
    label: "Terminations YTD",
    unit: "number",
    category: "people",
    auto: true,
    defaultTarget: null,
    lowerIsBetter: true,
    source: "Employees: Date Released in the year.",
  },
  {
    key: "avg_tenure_years",
    label: "Average Tenure (Years)",
    unit: "number",
    category: "people",
    auto: true,
    snapshot: true,
    defaultTarget: 3,
    source: "Employees: average years since Date Hired for active staff, as of today.",
  },
  {
    key: "avg_weekly_hours_per_employee",
    label: "Avg Weekly Hours / Employee",
    unit: "hours",
    category: "people",
    auto: true,
    defaultTarget: 40,
    source: "Timesheets: clocked hours ÷ employee-weeks with any time in the year.",
  },
  {
    key: "days_since_last_damage_case",
    label: "Days Since Last Damage Case",
    unit: "days",
    category: "people",
    auto: true,
    snapshot: true,
    defaultTarget: 90,
    source: "Damage Cases: days since the most recent incident date, as of today.",
  },
];

export const KPI_CATALOG_BY_KEY: ReadonlyMap<string, KpiCatalogMetric> = new Map(
  KPI_CATALOG.map((m) => [m.key, m])
);

export const CUSTOM_METRIC_PREFIX = "custom:";

export function isCustomMetricKey(key: string): boolean {
  return key.startsWith(CUSTOM_METRIC_PREFIX);
}

/** Keys of every metric the server can compute. */
export const AUTO_METRIC_KEYS: ReadonlySet<string> = new Set(
  KPI_CATALOG.filter((m) => m.auto).map((m) => m.key)
);

/**
 * Default layout for a brand-new org scorecard — the legacy Twins scorecard
 * one-for-one (same categories, metrics, and weights) so the two read alike.
 * Unmapped legacy metrics stay on the card as manual entries.
 */
export const DEFAULT_KPI_SCORECARD_CONFIG: KpiScorecardConfig = {
  categories: [
    {
      key: "financial",
      label: "Financial",
      metrics: [
        { key: "revenue_sold", weight: 25 },
        { key: "revenue_invoiced", weight: 20 },
        { key: "gross_margin_ytd", weight: 20 },
        { key: "noi_margin_ytd", weight: 10 },
        { key: "net_margin_ytd", weight: 10 },
        { key: "overhead_ratio", weight: 5 },
        { key: "ar_days", weight: 5 },
        { key: "ap_days", weight: 5 },
      ],
    },
    {
      key: "operations",
      label: "Operations",
      metrics: [
        { key: "labor_efficiency", weight: 35 },
        { key: "avb_variance", weight: 30 },
        { key: "ot_pct_hours", weight: 20 },
        { key: "fleet_avg_safety_score", weight: 15 },
      ],
    },
    {
      key: "sales",
      label: "Sales",
      metrics: [
        { key: "new_clients_ytd", weight: 30 },
        { key: "lead_conversion_rate", weight: 25 },
        { key: "close_ratio", weight: 25 },
        { key: "new_leads_ytd", weight: 10 },
        { key: "won_estimates_ytd", weight: 10 },
      ],
    },
    {
      key: "people",
      label: "People",
      metrics: [
        { key: "employee_retention", weight: 20 },
        { key: "employee_enps", weight: 20 },
        { key: "training_hrs_per_emp", weight: 20 },
        { key: "training_completion", weight: 20 },
        { key: "accident_free_workdays", weight: 15 },
        { key: "absenteeism_rate", weight: 5 },
      ],
    },
  ],
};
