import type { SupabaseClient } from "@supabase/supabase-js";
import { getSeedableDashboardTemplates } from "@/lib/reports/dashboard-templates";

/**
 * Clones any seedable dashboard template the org doesn't already have into
 * crm_dashboards as a normal, fully editable row. Safe to call on every
 * Report Center list load — `ignoreDuplicates` + the
 * crm_dashboards_org_template_key_idx unique index make it a no-op once an
 * org has (or has deleted) a given template, so a user who removes a
 * built-in dashboard doesn't get it silently recreated.
 */
export async function ensureSystemDashboardsSeeded(
  // crm_dashboards is newer than the generated Database types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>
): Promise<void> {
  const templates = getSeedableDashboardTemplates();
  if (templates.length === 0) return;

  const rows = templates.map((t) => ({
    name: t.name,
    description: t.description,
    config: t.config,
    is_system_seeded: true,
    source_template_key: t.key,
  }));

  const { error } = await supabase
    .from("crm_dashboards")
    .upsert(rows, {
      onConflict: "org_id,source_template_key",
      ignoreDuplicates: true,
    });

  if (error) {
    // Non-fatal — the dashboards list still loads without the seed;
    // don't block the request over a seeding failure.
    console.error("ensureSystemDashboardsSeeded failed", error.message);
  }
}
