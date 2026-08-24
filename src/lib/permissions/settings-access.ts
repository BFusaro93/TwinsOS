/**
 * The 5 settings_access permission keys under PERMISSION_TABS.home in
 * crm-roles.ts (account_settings, company_settings, crm_settings,
 * scheduling_settings, accounting_settings). The seeded CRM roles
 * (20260706000002_crm_roles_defaults_and_org_id_fix.sql) already assign
 * these individually per role — e.g. "Accounting" gets accounting_settings
 * without crm_settings.
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

export type LandscaptSettingsAccessKey = (typeof LANDSCAPT_SETTINGS_ACCESS_KEYS)[number];

/**
 * Which of the 5 keys gates each LandscaptSettingsTabs tab. Decided by
 * product (Brandon), since the 12 tabs don't map 1:1 onto the 5 keys —
 * several tabs share a key.
 *
 * Two tabs are intentionally absent, not gated by any of the 5:
 * - "notifications": every Landscapt user manages their own notification
 *   preferences — not an org-settings permission at all.
 * - "users" (Roles): already gated on its own terms — viewing roles is
 *   open to anyone who reaches this page, "Add Role" is gated by
 *   allow_roles_access (a different PERMISSION_TABS key), and actually
 *   writing a role is admin-only at the RLS layer regardless of any UI
 *   permission (20260901000004_crm_roles_admin_only_writes.sql).
 */
export const LANDSCAPT_TAB_PERMISSIONS: Partial<Record<string, LandscaptSettingsAccessKey>> = {
  general: "company_settings",
  crm: "crm_settings",
  estimates: "accounting_settings",
  services: "scheduling_settings",
  accounting: "accounting_settings",
  chemical_tracking: "crm_settings",
  required_fields: "crm_settings",
  import_export: "crm_settings",
  integrations: "crm_settings",
  client_portal: "crm_settings",
};
