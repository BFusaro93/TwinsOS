import { getReport } from "@/lib/reports/registry";
import { DATASET_PERMISSION_KEYS, REPORT_PERMISSION_KEYS } from "@/lib/reports/report-permissions";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RpcClient = { rpc: (...args: any[]) => PromiseLike<{ data: unknown; error: unknown }> };

/**
 * Server-side: may the caller see this prebuilt report's data? Same gates the
 * run route applies to a non-crew caller — the report's REPORT_PERMISSION_KEYS
 * and, for a declarative report, its dataset's DATASET_PERMISSION_KEYS.
 * view_report_center is the caller's own concern. Admins pass inside
 * has_settings_permission.
 *
 * Used where a report is delivered without going through the run route (the
 * scheduled-email cron renders it with the service role), so creating the
 * schedule must not let someone mail themselves data their role can't open.
 */
export async function canAccessReportData(
  supabase: RpcClient,
  reportKey: string,
  timeZone: string
): Promise<boolean> {
  const reportKeys = REPORT_PERMISSION_KEYS[reportKey];
  if (reportKeys && !(await hasAnySettingsPermission(supabase, reportKeys))) return false;
  const def = getReport(reportKey);
  if (def?.analysis) {
    const datasetKeys = DATASET_PERMISSION_KEYS[def.analysis({}, timeZone).dataset];
    if (datasetKeys && !(await hasAnySettingsPermission(supabase, datasetKeys))) return false;
  }
  return true;
}
