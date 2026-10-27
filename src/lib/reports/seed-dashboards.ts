import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSeedableDashboardTemplates } from "@/lib/reports/dashboard-templates";

/**
 * Clones any seedable dashboard template the org doesn't already have into
 * crm_dashboards as a normal, fully editable row. Safe to call on every
 * Report Center list load — `ignoreDuplicates` + the
 * crm_dashboards_org_template_key_idx unique index make it a no-op once an
 * org has (or has deleted) a given template, so a user who removes a
 * built-in dashboard doesn't get it silently recreated.
 *
 * `supabase` is the CALLER's session client and is only used to resolve the
 * org (my_org_id(), which honors staff impersonation). The insert itself goes
 * through the service role: crm_dashboards writes now require
 * manage_report_center in RLS, and this runs for view-only users too (anyone
 * with view_report_center loading the list). The org comes from the session,
 * never from a request parameter.
 */
export async function ensureSystemDashboardsSeeded(
  // crm_dashboards is newer than the generated Database types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>
): Promise<void> {
  const templates = getSeedableDashboardTemplates();
  if (templates.length === 0) return;

  const { data: orgId } = await supabase.rpc("my_org_id");
  if (!orgId || typeof orgId !== "string") return;
  // The service-role insert below bypasses the read-only RLS policies, so
  // honor them here: no seeding into a canceled / expired-trial org.
  const { data: readOnly } = await supabase.rpc("my_org_is_read_only");
  if (readOnly) return;

  const rows = templates.map((t) => ({
    org_id: orgId,
    name: t.name,
    description: t.description,
    config: t.config,
    is_system_seeded: true,
    source_template_key: t.key,
  }));

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { error } = await admin
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
