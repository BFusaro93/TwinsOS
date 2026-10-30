/**
 * Pages that exist at a breadcrumb ancestor path (a list or index page with
 * deeper pages beneath it). TopBar links only these crumbs — container
 * segments like /crm, /po or /crm/accounting have no page of their own, so
 * linking them would 404. A new nested page simply isn't linked until its
 * parent is added here.
 */
export const BREADCRUMB_LINKABLE_PATHS: ReadonlySet<string> = new Set([
  "/crm/accounting/invoices",
  "/crm/admin/reports",
  "/crm/clients",
  "/crm/communication/automations",
  "/crm/communication/forms",
  "/crm/crew",
  "/crm/docs",
  "/crm/estimates",
  "/crm/scheduling",
  "/crm/settings",
  "/crm/settings/documents",
  "/dashboards",
  "/photos/jobs",
  "/settings",
  "/settings/equipt",
  "/settings/support",
]);
