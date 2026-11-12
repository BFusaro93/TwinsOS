import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";
import { orgHasAddon } from "@/lib/stripe/addon-access";
import { crewMayRunAnalysis } from "@/lib/reports/crew-dashboard-access";
import { getSeedableDashboardTemplates } from "@/lib/reports/dashboard-templates";
import type { AnalysisConfig, VisualSpec } from "@/types/crm-reports";

/**
 * The Advanced Reporting add-on unlocks the build-your-own reporting tools:
 * custom analyses (My Reports + the analysis builder), Custom Dashboards
 * (including crew-visible ones), the Graphics Library, and scheduled report
 * email delivery. Bundled on Enterprise and during a trial; purchasable on
 * Starter/Growth. The prebuilt report catalog, the Dashboard tab, KPI
 * Scorecard, Company Report and job-costing reports stay on every plan.
 *
 * The built-in dashboards every org is seeded with (Sales Overview, A/R
 * Overview, Operations Dashboard — `is_system_seeded`) stay viewable on every
 * plan: their panels may run through analysis/run when the request matches a
 * shipped template panel exactly (isBuiltInDashboardPanel). Editing one, or
 * building any other dashboard, needs the add-on — and an edited built-in's
 * changed panels no longer match a template, so they lock too.
 *
 * Enforcement points are the API routes for those tools plus the
 * report-schedules cron — the UI gate (AdvancedReportingGate) only hides
 * them. Saved analyses/dashboards/graphics/schedules are never deleted when
 * an org lacks the add-on; they come back when it's purchased. DELETE stays
 * open so a downgraded org can still clean up.
 */
// Stored built-in dashboards are copies of the code templates: a template
// change must ship with a migration rewriting the stored copies (as
// 20261224000501_dashboard_panels_pretax_revenue did), or an org without the
// add-on sees that panel locked.
export const ADVANCED_REPORTING_REQUIRED_MESSAGE =
  "Custom reports, custom dashboards, the Graphics Library and scheduled report emails are part of the Advanced Reporting add-on. An admin can add it in Settings → Subscription.";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function callerHasAdvancedReporting(supabase: any): Promise<boolean> {
  // my_org_id() — honours staff impersonation, same as RLS.
  const orgId = await getEffectiveOrgId(supabase);
  if (!orgId) return false;
  // Service client: organization_addons visibility shouldn't depend on the
  // caller's role (crew logins view crew dashboards too).
  return orgHasAddon(createServiceClient(), orgId, "advanced_reporting");
}

/** Returns a 403 response when the caller's org lacks the add-on, else null. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function advancedReportingDenied(supabase: any): Promise<NextResponse | null> {
  if (await callerHasAdvancedReporting(supabase)) return null;
  return advancedReportingRequiredResponse();
}

export function advancedReportingRequiredResponse(): NextResponse {
  return NextResponse.json(
    { error: ADVANCED_REPORTING_REQUIRED_MESSAGE, code: "addon_required", addon: "advanced_reporting" },
    { status: 403 }
  );
}

let builtInVisuals: VisualSpec[] | null = null;

/** True when `config` is exactly one panel of a shipped built-in dashboard
 *  template (plus the date-range / sales-rep filters the dashboard viewer
 *  appends at run time) — same exact-match rules as crew dashboard panels. */
export function isBuiltInDashboardPanel(config: AnalysisConfig): boolean {
  if (!builtInVisuals) {
    builtInVisuals = getSeedableDashboardTemplates().flatMap((t) =>
      t.config.tabs.flatMap((tab) =>
        tab.panels.flatMap((panel) => (panel.visual?.config?.dataset ? [panel.visual] : []))
      )
    );
  }
  return crewMayRunAnalysis(config, builtInVisuals);
}
