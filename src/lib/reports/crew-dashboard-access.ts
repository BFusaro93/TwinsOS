import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardConfig } from "@/types/crm-reports";

/**
 * Crew-role logins (profiles.role = 'crew') are shared field accounts with no
 * crm_employees record, so has_settings_permission('view_report_center') is
 * always false for them. Rather than granting them the whole Report Center,
 * admins opt individual dashboards in via crm_dashboards.visible_to_crew.
 *
 * These helpers let the dashboards + report-run API routes make a narrow
 * exception for crew: they may open only crew-visible dashboards, run only
 * the prebuilt reports those dashboards embed, and query only the datasets
 * those dashboards' visual panels use. Everything is still org-scoped by RLS.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

export async function isCrewCaller(supabase: AnyClient, userId: string): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).single();
  return data?.role === "crew";
}

interface CrewDashboardRow {
  id: string;
  config: DashboardConfig;
}

async function fetchCrewVisibleDashboards(supabase: AnyClient): Promise<CrewDashboardRow[]> {
  const { data } = await supabase
    .from("crm_dashboards")
    .select("id, config")
    .eq("visible_to_crew", true)
    .is("deleted_at", null);
  return (data ?? []) as CrewDashboardRow[];
}

/** Prebuilt report keys + analysis datasets a crew login may execute, derived
 *  from the panels of every crew-visible dashboard in their org. */
export async function getCrewRunnableScope(
  supabase: AnyClient
): Promise<{ reportKeys: Set<string>; datasets: Set<string> }> {
  const dashboards = await fetchCrewVisibleDashboards(supabase);
  const reportKeys = new Set<string>();
  const datasets = new Set<string>();
  for (const d of dashboards) {
    for (const tab of d.config?.tabs ?? []) {
      for (const panel of tab.panels ?? []) {
        if (panel.reportKey) reportKeys.add(panel.reportKey);
        else if (panel.visual?.config?.dataset) datasets.add(panel.visual.config.dataset);
      }
    }
  }
  return { reportKeys, datasets };
}
