import { analysisConfigSchema, type AnalysisConfig } from "@/types/crm-reports";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";
import {
  analysisPermissionGroups,
  analysisScheduleProblem,
  dateWindowColumns,
} from "@/lib/reports/scheduled-analysis";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { rpc: (...args: any[]) => PromiseLike<{ data: unknown; error: unknown }>; from: (t: string) => any };

export type AnalysisScheduleCheck =
  | { ok: true; name: string; config: AnalysisConfig }
  | { ok: false; status: number; error: string };

/**
 * Route-side check (caller's own session) that a saved analysis may be
 * scheduled: it exists in the caller's org (RLS), uses a schedulable dataset,
 * and the caller can view it (view_report_center + the dataset's keys). The
 * cron re-checks the CREATOR's permissions at every send.
 */
export async function checkCallerCanScheduleAnalysis(
  supabase: Client,
  customReportId: string
): Promise<AnalysisScheduleCheck> {
  const { data } = await supabase
    .from("crm_custom_reports")
    .select("name, config")
    .eq("id", customReportId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return { ok: false, status: 404, error: "Saved analysis not found" };
  const parsed = analysisConfigSchema.safeParse(data.config);
  if (!parsed.success) return { ok: false, status: 400, error: "The saved analysis is invalid" };
  const problem = analysisScheduleProblem(parsed.data);
  if (problem) return { ok: false, status: 400, error: problem };
  if (!(await hasAnySettingsPermission(supabase, ["view_report_center"]))) {
    return { ok: false, status: 403, error: "Your role can't view this report" };
  }
  for (const keys of analysisPermissionGroups(parsed.data)) {
    if (!(await hasAnySettingsPermission(supabase, keys))) {
      return { ok: false, status: 403, error: "Your role can't view this report" };
    }
  }
  return { ok: true, name: data.name as string, config: parsed.data };
}

/** Error text when the window columns are inconsistent, else null. */
export function dateWindowProblem(
  dataset: string | null,
  column: string | null,
  window: string | null
): string | null {
  if (!column && !window) return null;
  if (!column || !window) return "Pick both a date column and a date window.";
  if (!dataset) return "Date windows apply to saved analyses only.";
  if (!dateWindowColumns(dataset).some((c) => c.key === column)) return "That column isn't a date column of the analysis's dataset.";
  return null;
}
