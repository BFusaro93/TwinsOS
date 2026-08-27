// Structured list of every full-length docs guide (the "Full guide" links
// scattered through docs-content.ts), used to build the guide library index.
// Keep in sync with the actual page files under
// src/app/(settings)/settings/support/*-guide/page.tsx — titles/descriptions
// here should match each page's own <DocsHero> exactly.

export interface DocGuide {
  slug: string;
  kicker: string;
  title: string;
  description: string;
}

export const DOC_GUIDES: DocGuide[] = [
  {
    slug: "projects-guide",
    kicker: "Purchasing",
    title: "Projects & Job Costing",
    description: "One Projects table, two different screens to view it from, and a separate rate-calculator tool that feeds it — untangled.",
  },
  {
    slug: "pm-schedules-guide",
    kicker: "Maintenance (CMMS)",
    title: "Preventive Maintenance Schedules",
    description: "Calendar-based recurring service, from one schedule covering a whole fleet down to per-asset parts.",
  },
  {
    slug: "parts-inventory-guide",
    kicker: "Maintenance (CMMS)",
    title: "Parts Inventory",
    description: "Adding parts, linking them to assets, keeping stock and cost in sync, and when to split a part number into two.",
  },
  {
    slug: "meters-guide",
    kicker: "Maintenance (CMMS)",
    title: "Meters & Usage-Based Automations",
    description: "Track hours, miles, gallons, and cycles on any asset — and let Equipt open the work order for you the moment a threshold is crossed.",
  },
  {
    slug: "clients-guide",
    kicker: "Landscapt / CRM",
    title: "Clients, Properties & Leads",
    description: "Client accounts, commercial hierarchies, service properties, and the activity timeline that ties it all together.",
  },
  {
    slug: "estimating-guide",
    kicker: "Landscapt / CRM",
    title: "Estimates & the Budget Engine",
    description: "How an estimate is built, how its numbers are actually calculated, and how it becomes a job.",
  },
  {
    slug: "jobs-packages-guide",
    kicker: "Landscapt / CRM",
    title: "Jobs & Packages",
    description: "The six job types, how a job's status differs from a visit's status, and how a Package template turns into a billed job.",
  },
  {
    slug: "dispatch-board-guide",
    kicker: "Landscapt / CRM",
    title: "The Dispatch Board",
    description: "The daily scheduling screen crews and dispatchers live in — visits, crews, status, and how actual hours get calculated.",
  },
  {
    slug: "waiting-list-guide",
    kicker: "Landscapt / CRM",
    title: "The Waiting List",
    description: "Jobs with a date range instead of a date, held for opportunistic scheduling — and how to actually get them dispatched.",
  },
  {
    slug: "snow-guide",
    kicker: "Landscapt / CRM",
    title: "Snow Jobs & Storm Dispatch",
    description: "Storm events, priority dispatch, and the invoicing flow built specifically for snow.",
  },
  {
    slug: "invoicing-guide",
    kicker: "Landscapt / CRM",
    title: "Invoicing & Payments",
    description: "How an invoice is born, how its status moves, and where the client's own PO number actually goes.",
  },
  {
    slug: "contracts-guide",
    kicker: "Landscapt / CRM",
    title: "Contracts",
    description: "Ongoing billing agreements — monthly amounts, seasonal overrides, sub-properties, and how signing and invoicing actually work.",
  },
  {
    slug: "automations-guide",
    kicker: "Landscapt / CRM",
    title: "Communication Automations",
    description: "How sequences, triggers, and events work — and how Automations differ from Sales Campaigns.",
  },
  {
    slug: "forms-guide",
    kicker: "Landscapt / CRM",
    title: "Forms & Lead Capture",
    description: "Building, publishing, and sharing public forms — and what happens to a submission once it lands.",
  },
  {
    slug: "tickets-guide",
    kicker: "Landscapt / CRM",
    title: "Tickets",
    description: "Support and service tickets — where they come from, how they're worked, and how they connect to the rest of a client's record.",
  },
  {
    slug: "damage-cases-guide",
    kicker: "Landscapt / CRM",
    title: "Damage Cases",
    description: "Tracking property damage and warranty claims tied to a job — what a case captures, how cost rolls up, and a real current limitation in how it connects to a client record.",
  },
  {
    slug: "job-photos-guide",
    kicker: "Landscapt / CRM · Equipt",
    title: "Job Photos",
    description: "Field photo documentation, annotation, and before/after comparisons — attached to a job site, not a person.",
  },
  {
    slug: "client-portal-guide",
    kicker: "Client Portal",
    title: "The Client Portal",
    description: "A branded, self-serve site where Landscapt clients view their account, pay invoices, and act on estimates — entirely separate from staff login.",
  },
  {
    slug: "report-center-guide",
    kicker: "Reporting",
    title: "Report Center & Dashboards",
    description: "Where the ~75 pre-built reports live, how a report actually runs, and how the curated dashboards differ from the ones you build yourself.",
  },
  {
    slug: "approval-flows-guide",
    kicker: "Administration",
    title: "Approval Flows",
    description: "How Requisition and Purchase Order approval chains are configured, processed, and resolved.",
  },
  {
    slug: "notification-preferences-guide",
    kicker: "Administration",
    title: "Notification Preferences",
    description: "How email and in-app notifications are configured, where the defaults come from, and how the bell keeps read state in sync.",
  },
  {
    slug: "users-roles-guide",
    kicker: "Administration",
    title: "Users, Roles & Permissions",
    description: "How access works across Equipt, Landscapt, crew logins, and the client portal — and why they aren't all the same system.",
  },
  {
    slug: "import-export-guide",
    kicker: "Administration",
    title: "Import & Export",
    description: "What Settings → Import / Export actually does for each entity, exactly how row validation and duplicate handling work, and the full mechanics of the bulk Purchase Order importer.",
  },
  {
    slug: "required-fields-guide",
    kicker: "Administration",
    title: "Required Fields",
    description: "What Required Fields actually controls, entity by entity — and where it stops.",
  },
  {
    slug: "api-mcp-guide",
    kicker: "Integrations",
    title: "API Keys & MCP",
    description: "How scoped API keys work, and how to hand the same key to an AI agent over MCP.",
  },
  {
    slug: "zapier-guide",
    kicker: "Integrations",
    title: "Connecting Zapier",
    description: "Every trigger, every action, and exactly what fires each one.",
  },
  {
    slug: "samsara-guide",
    kicker: "Integrations",
    title: "Samsara Integration",
    description: "What actually syncs, how vehicles get matched, and where to look when a reading doesn't show up.",
  },
];

/** DOC_GUIDES grouped by kicker, in a fixed display order for the library index. */
export function groupedDocGuides(): { kicker: string; guides: DocGuide[] }[] {
  const order = [
    "Purchasing",
    "Maintenance (CMMS)",
    "Landscapt / CRM",
    "Landscapt / CRM · Equipt",
    "Client Portal",
    "Reporting",
    "Administration",
    "Integrations",
  ];
  return order
    .map((kicker) => ({ kicker, guides: DOC_GUIDES.filter((g) => g.kicker === kicker) }))
    .filter((group) => group.guides.length > 0);
}
