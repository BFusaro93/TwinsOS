/**
 * Dark mode is rolled out one module at a time. A route only honors the
 * user's dark preference once its prefix is listed here; everywhere else
 * `ThemeProvider` forces light, so a half-converted page can never render
 * as white cards on a dark page.
 *
 * To ship a module: run scripts/dark-mode-codemod.mjs over it, review the
 * pages in both themes, then add its prefix below. A prefix also covers every
 * sub-route (detail pages); use EXACT for a path whose children aren't ready.
 */
export const DARK_MODE_ROUTE_PREFIXES: readonly string[] = [
  "/cmms",
  "/crm/accounting",
  "/crm/admin",
  "/crm/calls",
  "/crm/clients",
  "/crm/communication",
  "/crm/crew",
  "/crm/docs",
  "/crm/estimates",
  "/crm/home",
  "/crm/leads",
  "/crm/reports",
  "/crm/sales-meetings",
  "/crm/scheduling",
  "/crm/settings",
  "/crm/support",
  "/crm/team",
  "/crm/tickets",
  "/crm/vendors",
  "/dashboards/avb",
  "/dashboards/calculators",
  "/dashboards/crm",
  "/dashboards/custom",
  "/dashboards/equipt",
  "/dashboards/estimate-builder",
  "/dashboards/financials",
  "/dashboards/job-costing",
  "/dashboards/kpis",
  "/dashboards/landscapt-reports",
  "/dashboards/myday",
  "/dashboards/safety",
  "/dashboards/social-media",
  "/dashboards/twins-crm-report",
  "/dashboards/twins-kpis",
  "/docs",
  "/equipt",
  "/operations",
  "/photos/field/damage-report",
  "/photos/field/injury-report",
  "/photos/field/repair-request",
  "/po/orders",
  "/po/products",
  "/po/receiving",
  "/po/reports",
  "/po/requisitions",
  "/settings/docs",
  "/settings/equipt",
  "/settings/landscapt",
  "/settings/support",
  "/support",
  "/tools",
  "/vendors",
];

/** Routes that are ready only at exactly this path (their sub-routes are not). */
export const DARK_MODE_EXACT_ROUTES: readonly string[] = [
  "/settings",
  "/dashboards",
  "/home",
  "/photos/jobs",
  "/photos/projects",
];

export function isDarkModeReady(pathname: string | null): boolean {
  if (!pathname) return false;
  if (DARK_MODE_EXACT_ROUTES.includes(pathname)) return true;
  return DARK_MODE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
