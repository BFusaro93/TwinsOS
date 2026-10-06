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
  "/crm/crew",
  "/crm/scheduling",
  "/crm/accounting",
  "/crm/estimates",
  "/crm/clients",
  "/crm/home",
  "/crm/leads",
  "/crm/calls",
  "/crm/tickets",
  "/crm/sales-meetings",
  "/crm/vendors",
  "/crm/team",
  "/crm/communication",
  "/crm/admin",
  "/crm/reports",
  "/crm/settings",
  "/cmms",
  "/po/orders",
  "/po/requisitions",
  "/po/receiving",
  "/po/products",
  "/po/reports",
  "/vendors",
  "/equipt",
  "/dashboards/equipt",
  "/dashboards/landscapt-reports",
  "/dashboards/myday",
  "/dashboards/social-media",
  "/dashboards/calculators",
  "/dashboards/estimate-builder",
  "/dashboards/job-costing",
  "/dashboards/kpis",
  "/dashboards/custom",
  "/tools",
  "/photos/field/damage-report",
  "/photos/field/injury-report",
  "/settings/landscapt",
  "/settings/equipt",
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
