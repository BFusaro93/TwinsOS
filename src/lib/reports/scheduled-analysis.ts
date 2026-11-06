import type { AnalysisConfig } from "@/types/crm-reports";
import { getDataset } from "@/lib/reports/datasets";
import { DATASET_PERMISSION_KEYS } from "@/lib/reports/report-permissions";
import { dateWindowRangeAt, type DateWindow } from "@/lib/reports/schedule-date-window";

/**
 * Datasets a saved analysis may be scheduled on. The cron has no user session,
 * so RLS can't scope its queries; crm_run_report_for_org (migration
 * 20261226000200) scopes by an injected `org_id = <org>` filter, which needs
 * the view to HAVE an org_id column. Verified against information_schema:
 * only these four rpt_* views do. Keep in step with that migration's check.
 */
export const SCHEDULABLE_ANALYSIS_DATASETS: readonly string[] = [
  "rpt_audit_log",
  "rpt_contract_service_usage",
  "rpt_job_visits",
  "rpt_sales_rep_month",
];

/** null when `config` can be scheduled, otherwise the reason it can't. */
export function analysisScheduleProblem(config: AnalysisConfig): string | null {
  if (!SCHEDULABLE_ANALYSIS_DATASETS.includes(config.dataset)) {
    const label = getDataset(config.dataset)?.label ?? config.dataset;
    return `Analyses on "${label}" can't be scheduled yet — only job visits, contract service usage, sales rep by month and the audit log can.`;
  }
  if ((config.joins ?? []).length > 0) return "Analyses with joined datasets can't be scheduled.";
  return null;
}

/** Date/datetime columns of the analysis's dataset (choices for the date window). */
export function dateWindowColumns(dataset: string): { key: string; label: string }[] {
  return (getDataset(dataset)?.fields ?? [])
    .filter((c) => c.type === "date" || c.type === "datetime")
    .map((c) => ({ key: c.key, label: c.label }));
}

/** Permission keys that must each be satisfied (any-of within a group) to run this analysis. */
export function analysisPermissionGroups(config: AnalysisConfig): string[][] {
  const keys = DATASET_PERMISSION_KEYS[config.dataset];
  return keys ? [keys] : [];
}

/** `config` with the schedule's relative window appended as gte/lte filters
 *  (org-calendar dates; the RPC reads bare dates in the org's zone). */
export function withDateWindow(
  config: AnalysisConfig,
  column: string | null,
  window: DateWindow | null,
  now: Date,
  timeZone: string
): AnalysisConfig {
  if (!column || !window) return config;
  const { from, to } = dateWindowRangeAt(window, now, timeZone);
  return {
    ...config,
    filters: [
      ...config.filters,
      { column, op: "gte", value: from },
      { column, op: "lte", value: to },
    ],
  };
}
