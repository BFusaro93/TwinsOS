// Search index for the Settings area. Settings are spread over three hubs (Master Account, Equipt /
// Purchasing, Landscapt) with many tabs and collapsible sections each, so this flat list is what
// "Search settings" matches against. Each entry deep-links to a tab and, where the setting lives in
// a collapsible section, to that section (the section opens and scrolls into view).
//
// Keep it in step with the tabs: when a tab or section is added, renamed or moved, update its entry
// here. `section` must equal the AccordionSection title exactly (compared case-insensitively).

export type SettingsArea = "master" | "equipt" | "landscapt";

export type SettingsSearchEntry = {
  area: SettingsArea;
  /** The ?tab= key of the hub the setting lives on. */
  tab: string;
  /** Human tab name, shown as the breadcrumb. */
  tabLabel: string;
  title: string;
  /** Exact AccordionSection title to open, if the setting sits in a collapsible section. */
  section?: string;
  /** Extra words people might type that the title doesn't contain. */
  keywords?: string;
};

export const SETTINGS_AREA_LABELS: Record<SettingsArea, string> = {
  master: "Master Account",
  equipt: "Equipt",
  landscapt: "Landscapt",
};

const M = (tab: string, tabLabel: string, title: string, keywords?: string): SettingsSearchEntry => ({
  area: "master", tab, tabLabel, title, keywords,
});
const E = (tab: string, tabLabel: string, title: string, keywords?: string, section?: string): SettingsSearchEntry => ({
  area: "equipt", tab, tabLabel, title, keywords, section,
});
const L = (tab: string, tabLabel: string, title: string, keywords?: string, section?: string): SettingsSearchEntry => ({
  area: "landscapt", tab, tabLabel, title, keywords, section,
});

export const SETTINGS_SEARCH_INDEX: SettingsSearchEntry[] = [
  // ── Master Account ──────────────────────────────────────────────────────────
  M("organization", "Organization", "Organization info", "company name address phone"),
  M("organization", "Organization", "Operating time zone", "timezone"),
  M("organization", "Organization", "Default sales tax rate", "tax"),
  M("organization", "Organization", "Break-even labor rate", "labor cost overhead"),
  M("organization", "Organization", "Loaded labor rate (LLR)", "labor burden"),
  M("organization", "Organization", "Overtime and unpaid crew pauses", "overtime breaks payroll hours"),
  M("organization", "Organization", "Change history", "audit trail log"),
  M("branding", "Branding", "Logo and brand color", "branding upload"),
  M("users", "Users", "Users and invites", "invite deactivate reactivate reset password team"),
  M("subscription", "Subscription", "Plan and billing", "subscription plan upgrade"),
  M("integrations", "Integrations", "Zapier", "automation connect"),
  M("integrations", "Integrations", "API keys", "api developer token"),
  M("integrations", "Integrations", "Connected apps", "oauth mcp"),
  M("integrations", "Integrations", "Home page shortcuts", "tiles links home"),

  // ── Landscapt ───────────────────────────────────────────────────────────────
  L("general", "General", "Company info", "organization name address phone"),
  L("users", "Roles", "Roles and permissions", "access crm roles who can"),
  L("crm", "Clients", "Client defaults", "account numbering billing terms prefix", "Client Defaults"),
  L("crm", "Clients", "Service lines you offer", "turn on services lines we offer snow services turn off hide snow jobs invoicing plow", "Services"),
  L("crm", "Clients", "Crew app settings", "crew tablet clock in", "Crew App"),
  L("crm", "Clients", "Cancellation reasons", undefined, "Cancellation Reasons"),
  L("crm", "Clients", "Client sources", "lead source referral", "Client Sources"),
  L("crm", "Clients", "Contact types", undefined, "Contact Types"),
  L("crm", "Clients", "Ticket categories", undefined, "Ticket Categories"),
  L("crm", "Clients", "Tags", "client tags labels", "Tags"),
  L("crm", "Clients", "Custom client fields", "takeoff fields measurements number fields", "Custom Client Fields"),
  L("crm", "Clients", "Email templates", "documents", "Email Templates"),
  L("estimates", "Estimates", "Estimate stages", "pipeline", "Estimate Stages"),
  L("estimates", "Estimates", "Estimate approval flow", "approve", "Estimate Approval Flow"),
  L("estimates", "Estimates", "Won reasons", undefined, "Won Reasons"),
  L("estimates", "Estimates", "Lost reasons", undefined, "Lost Reasons"),
  L("estimates", "Estimates", "Labor rates", "burden wage", "Labor Rates"),
  L("estimates", "Estimates", "Overhead recovery", "markup overhead", "Overhead Recovery"),
  L("estimates", "Estimates", "Service bundles", "estimate templates", "Service Bundles"),
  L("notifications", "Notifications", "Notification preferences", "email alerts"),
  L("notifications", "Notifications", "Estimate decision, new ticket and injury report recipients", "who gets notified"),
  L("services", "Services", "Services", "service catalog rates pricing", "Services"),
  L("services", "Services", "Service categories", undefined, "Service Categories"),
  L("services", "Services", "Snow routes", "master routes plow", "Snow Routes"),
  L("accounting", "Accounting", "Sales tax", "tax rate", "Sales Tax"),
  L("accounting", "Accounting", "Card payments (Stripe)", "credit card online payments autopay connect", "Card Payments (Stripe)"),
  L("accounting", "Accounting", "QuickBooks", "qbo accounting sync", "QuickBooks"),
  L("accounting", "Accounting", "Credit card processing fee", "surcharge convenience fee", "Credit Card Processing Fee"),
  L("accounting", "Accounting", "Invoice numbering", "next invoice number", "Invoice Numbering"),
  L("accounting", "Accounting", "Estimate numbering", "next estimate number", "Estimate Numbering"),
  L("accounting", "Accounting", "Payment methods", "check cash ach", "Payment Methods"),
  L("accounting", "Accounting", "Discounts", undefined, "Discounts"),
  L("accounting", "Accounting", "Other charges", "late fee trip charge", "Other Charges"),
  L("accounting", "Accounting", "Invoice templates", "pdf layout", "Invoice Templates"),
  L("accounting", "Accounting", "Invoice email templates", undefined, "Invoice Email Templates"),
  L("chemical_tracking", "Chemical Tracking", "Chemical tracking settings", "application methods targets volume units area units client notice"),
  L("required_fields", "Required Fields", "Required fields", "mandatory form validation"),
  L("import_export", "Import / Export", "Import and export data", "csv upload download migrate clients invoices"),
  L("integrations", "Integrations", "QuickBooks connection", "qbo"),
  L("integrations", "Integrations", "Google Maps", "maps key address"),
  L("integrations", "Integrations", "Text messaging (SMS)", "twilio a2p 10dlc phone number"),
  L("client_portal", "Client Portal", "Client portal settings", "portal branding support contact features visible ticket categories"),
  L("commissions", "Commissions", "Commission plans", "sales rep assignments"),

  // ── Equipt / Purchasing ─────────────────────────────────────────────────────
  E("customizations", "Customizations", "Locations", undefined, "Locations"),
  E("customizations", "Customizations", "Part categories", undefined, "Part Categories"),
  E("customizations", "Customizations", "Work order categories", undefined, "Work Order Categories"),
  E("customizations", "Customizations", "Asset types", undefined, "Asset Types"),
  E("customizations", "Customizations", "Fuel types", undefined, "Fuel Types"),
  E("customizations", "Customizations", "Vendor types", undefined, "Vendor Types"),
  E("customizations", "Customizations", "Quick reference part number fields", undefined, "Quick Reference Part # Fields"),
  E("required_fields", "Required Fields", "Required fields", "mandatory form validation"),
  E("approval_flows", "Approval Flows", "Approval flows", "requisition purchase order approvers"),
  E("costing", "Costing", "Inventory costing method", "fifo weighted average manual"),
  E("import_export", "Import / Export", "Import and export data", "csv upload download parts assets vendors purchase orders"),
  E("notifications", "Notifications", "Notification preferences", "email alerts"),
  E("integrations", "Integrations", "Samsara", "telematics vehicle sync odometer api key"),
  E("request_portal", "Request Portal", "Maintenance request portal", "public request form"),
];

export function settingsEntryHref(e: SettingsSearchEntry): string {
  const base = e.area === "master" ? "/settings" : `/settings/${e.area}`;
  const params = new URLSearchParams({ tab: e.tab });
  if (e.section) params.set("section", e.section);
  return `${base}?${params.toString()}`;
}
