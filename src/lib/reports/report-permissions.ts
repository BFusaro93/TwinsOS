/**
 * Maps a Report Center report's `key` (from src/lib/reports/registry.ts) to
 * the crm_roles permission key(s) that gate seeing/running it. Any one of
 * the listed keys grants access (some reports have more than one because
 * the permission catalog names it slightly differently than the report's
 * own key — e.g. "job-costing-report" vs. permission "sched_rpt_job_costing").
 *
 * A report with no entry here has no gate at all (visible to every role) —
 * these are reports that exist with no corresponding permission catalog
 * entry. Reports with a permission key that has no matching report were
 * removed from the catalog as dead entries (see crm-roles.ts history).
 */
export const REPORT_PERMISSION_KEYS: Record<string, string[]> = {
  "forms-summary": ["crm_rpt_forms_summary"],
  "paused-services": ["sched_rpt_paused_services"],
  "sales-activity-detail": ["acct_rpt_sales_activity_detail"],
  "custom-package-renewal": ["sched_rpt_custom_package_renewal"],
  "over-under": ["sched_rpt_over_under"],
  "product-service-usage": ["sched_rpt_product_service_usage"],
  "client-timeline": ["crm_rpt_client_timeline"],
  "lead-timeline": ["crm_rpt_lead_timeline"],
  "income-not-invoiced": ["acct_rpt_income_not_invoiced"],
  "unapplied-payments": ["acct_rpt_unapplied_payments"],
  "sales-commission-export": ["acct_rpt_sales_commission_export"],
  "client-balance": ["crm_rpt_client_balance"],
  "client-contact-list": ["crm_rpt_client_contact_list"],
  "client-phone-list": ["crm_rpt_client_phone_list"],
  "client-method-of-payment": ["crm_rpt_client_method_of_payment"],
  "client-referral": ["crm_rpt_client_referral"],
  "new-clients": ["crm_rpt_new_clients"],
  "terminations": ["crm_rpt_terminations"],
  "cancellation-count": ["crm_rpt_cancellation_count"],
  "new-client-count": ["crm_rpt_new_client_count"],
  "clients-by-completed-jobs": ["crm_rpt_clients_by_completed_jobs"],
  "client-contracts": ["crm_rpt_client_contracts"],
  "estimates-by-stage": ["crm_rpt_estimates_by_stage"],
  "won-estimates-by-service": ["crm_rpt_won_estimates_by_service"],
  "won-estimates-service-summary": ["crm_rpt_won_estimates_service_products", "crm_rpt_won_estimates_service_value"],
  "invoiced-income-by-client": ["acct_rpt_invoiced_income_by_client"],
  "invoices-with-balances": ["acct_rpt_invoices_with_balances"],
  "pre-payments": ["acct_rpt_pre_payments"],
  "profit-loss-accrual": ["acct_rpt_profit_loss_accrual"],
  "profit-loss-cash": ["acct_rpt_profit_loss_cash"],
  "sales-tax": ["acct_rpt_sales_tax"],
  "cogs": ["sched_rpt_cogs"],
  "job-cost-summary": ["sched_rpt_job_cost_summary"],
  "job-costing-report": ["sched_rpt_job_costing"],
  "job-hours-summary": ["sched_rpt_job_hours_summary"],
  "new-leads": ["crm_rpt_new_leads"],
  "lead-aging-summary": ["crm_rpt_lead_aging_summary"],
  "closed-leads-summary": ["crm_rpt_closed_leads_summary"],
  "company-scorecard": ["crm_rpt_company_scorecard"],
  "sales-summary-by-source": ["crm_rpt_sales_summary_by_source"],
  "ar-aging": ["acct_rpt_ar_aging"],
  "ar-aging-snapshot": ["acct_rpt_ar_aging_snapshot"],
  "invoice-audit-summary": ["acct_rpt_invoice_audit_summary"],
  "payment-audit-summary": ["acct_rpt_payment_audit_summary"],
  "revenue-by-postal-code": ["acct_rpt_revenue_by_postal_code"],
  "revenue-by-service-summary": ["acct_rpt_revenue_by_service_summary", "acct_rpt_revenue_per_service"],
  "daily-production": ["acct_rpt_daily_production"],
  "sales-activity-summary": ["acct_rpt_sales_activity_summary"],
  "sales-by-date-sold": ["sched_rpt_sales_by_date_sold"],
  "employee-directory": ["sched_rpt_employee_directory"],
  "contractor-phone-list": ["sched_rpt_contractor_phone_list"],
  "vendor-contact-list": ["sched_rpt_vendor_contact_list"],
  "inventory-product-list": ["sched_rpt_inventory_product_list"],
  "non-inventory-product-list": ["sched_rpt_non_inventory_product_list"],
  "backlog-services": ["sched_rpt_backlog_services"],
  "client-count-by-service": ["sched_rpt_client_count_by_service"],
  "package-summary": ["sched_rpt_package_summary"],
  "chemical-tracking-report": ["sched_rpt_chemical_tracking"],
  "client-services-report": ["sched_rpt_client_services"],
  "visits-report": ["sched_rpt_visits"],
  "revenue-projection": ["sched_rpt_revenue_budgeted_hours"],
  "approved-sales-by-sales-rep": ["sched_rpt_sales_count_by_sales_rep", "acct_rpt_booked_revenue_by_sales_rep"],
};

/**
 * Maps a raw analysis dataset (an `rpt_*` view key from
 * src/lib/reports/datasets.ts) to the crm_roles permission key(s) that gate
 * querying it through the Custom Analysis builder / dashboard panels. Any one
 * of the listed keys grants access.
 *
 * Base-table RLS is org-wide, not role-aware, so without this anyone holding
 * `view_report_center` could pull pay rates, labor cost, invoice/payment
 * history or estimate pricing via an ad-hoc analysis even when their role is
 * denied every prebuilt report over that data. Datasets with no entry here
 * (clients, jobs, visits, services, products, vendors, contracts, chemicals,
 * WIP, sales-rep month, contract usage) are gated only by view_report_center.
 * Every key must exist in src/types/crm-roles.ts.
 */
const ACCOUNTING_DATASET_KEYS = [
  "acct_rpt_invoiced_income_by_client",
  "acct_rpt_invoices_with_balances",
  "acct_rpt_ar_aging",
];

const ESTIMATE_DATASET_KEYS = [
  "estimate_list",
  "crm_rpt_estimates_by_stage",
  "crm_rpt_won_estimates_by_service",
];

export const DATASET_PERMISSION_KEYS: Record<string, string[]> = {
  rpt_employees: ["sched_rpt_employee_directory"],
  rpt_timesheets: ["sched_rpt_job_hours_summary", "sched_rpt_employee_directory"],
  rpt_invoices: ACCOUNTING_DATASET_KEYS,
  rpt_invoice_line_items: ACCOUNTING_DATASET_KEYS,
  rpt_payments: ["acct_rpt_payment_audit_summary", ...ACCOUNTING_DATASET_KEYS],
  rpt_estimates: ESTIMATE_DATASET_KEYS,
  rpt_estimate_line_items: ESTIMATE_DATASET_KEYS,
};

/** True when the given permission set (from usePermissions()) allows querying
 *  a dataset. Client-side mirror of the analysis/run route's dataset gate —
 *  lets dashboards blank a panel instead of surfacing a 403 error state. */
export function canQueryDataset(
  dataset: string,
  can: (key: string) => boolean
): boolean {
  const keys = DATASET_PERMISSION_KEYS[dataset];
  if (!keys) return true; // ungated beyond view_report_center
  return keys.some((k) => can(k));
}

/** True when the given permission set (from usePermissions()) grants access to a report. */
export function canViewReport(
  reportKey: string,
  can: (key: string) => boolean
): boolean {
  const keys = REPORT_PERMISSION_KEYS[reportKey];
  if (!keys) return true; // no catalog entry for this report — ungated
  return keys.some((k) => can(k));
}
