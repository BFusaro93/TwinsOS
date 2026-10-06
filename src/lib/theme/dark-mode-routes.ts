/**
 * Dark mode is rolled out one module at a time. A route only honors the
 * user's dark preference once its prefix is listed here; everywhere else
 * `ThemeProvider` forces light, so a half-converted page can never render
 * as white cards on a dark page.
 *
 * To ship a module: run scripts/dark-mode-codemod.mjs over it, review the
 * pages in both themes, then add its prefix below.
 */
export const DARK_MODE_ROUTE_PREFIXES: readonly string[] = [
  "/crm/crew",
  "/crm/scheduling/dispatch",
  "/crm/clients",
  "/crm/accounting/purchase-orders",
  "/cmms/work-orders",
  "/po/orders",
];

export function isDarkModeReady(pathname: string | null): boolean {
  if (!pathname) return false;
  return DARK_MODE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
