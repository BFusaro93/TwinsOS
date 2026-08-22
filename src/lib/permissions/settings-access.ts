/**
 * The 5 settings_access permission keys under PERMISSION_TABS.home in
 * crm-roles.ts (account_settings, company_settings, crm_settings,
 * scheduling_settings, accounting_settings). The seeded CRM roles
 * (20260706000002_crm_roles_defaults_and_org_id_fix.sql) already assign
 * these individually per role — e.g. "Accounting" gets accounting_settings
 * without crm_settings — but LandscaptSettingsTabs isn't split into
 * per-tab permission checks yet, so it gates on having ANY of these rather
 * than one specific key (which would wrongly lock out a role like
 * Accounting that has a different one of the five).
 *
 * Kept in its own tiny module (rather than exported from
 * LandscaptSettingsTabs.tsx) so SettingsSidebar can import just this
 * constant without pulling that component's much larger dependency graph
 * into every Settings page's bundle.
 */
export const LANDSCAPT_SETTINGS_ACCESS_KEYS = [
  "account_settings",
  "company_settings",
  "crm_settings",
  "scheduling_settings",
  "accounting_settings",
] as const;
