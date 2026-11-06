import type { AnalysisConfig } from "@/types/crm-reports";
import { getDataset } from "@/lib/reports/datasets";
import { DATASET_PERMISSION_KEYS } from "@/lib/reports/report-permissions";
import { dateWindowRangeAt, type DateWindow } from "@/lib/reports/schedule-date-window";

/**
 * A saved analysis may be scheduled on any dataset. The cron has no user session,
 * so RLS can't scope its queries; crm_run_report_for_org (migration
 * 20261226000200) scopes by an injected `org_id = <org>` filter, which needs the
 * view to HAVE an org_id column — every rpt_* dataset does since migration
 * 20261226000300, and the function refuses any dataset that doesn't. Joins stay
 * unschedulable: a join key like invoice_number is only unique per org, so a
 * join without its own org condition could pull in another org's columns.
 */

/** null when `config` can be scheduled, otherwise the reason it can't. */
export function analysisScheduleProblem(config: AnalysisConfig): string | null {
  if (!getDataset(config.dataset)) return `Unknown dataset: ${config.dataset}`;
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
