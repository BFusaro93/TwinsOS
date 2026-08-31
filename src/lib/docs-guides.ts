// Structured list of every full-length docs guide (the "Full guide" links
// scattered through docs-content.ts), used to build the guide library index.
// Keep in sync with the actual page files under
// src/app/(settings)/settings/support/*-guide/page.tsx — titles/descriptions
// here should match each page's own <DocsHero> exactly.

import {
  FolderKanban,
  CalendarClock,
  Container,
  Gauge,
  Users,
  Calculator,
  CalendarDays,
  Map,
  Clock,
  Snowflake,
  Receipt,
  FileSignature,
  Zap,
  ClipboardList,
  Ticket,
  AlertTriangle,
  Camera,
  Globe,
  BarChart3,
  GitMerge,
  Bell,
  ShieldCheck,
  FileInput,
  ListChecks,
  KeyRound,
  Workflow,
  Radio,
  ShoppingCart,
  Wrench,
  Building2,
  Plug,
  Layers,
  Boxes,
  PackageCheck,
  ClipboardCheck,
  CreditCard,
  Handshake,
  type LucideIcon,
} from "lucide-react";

export interface DocGuide {
  slug: string;
  kicker: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

/** Icon shown next to each kicker/category group in the guide sidebar. */
export const DOC_GUIDE_GROUP_ICONS: Record<string, LucideIcon> = {
  "Purchasing": ShoppingCart,
  "Equipt (CMMS)": Wrench,
  "Landscapt (CRM)": Building2,
  "Client Portal": Globe,
  "Reporting": BarChart3,
  "Administration": ShieldCheck,
  "Integrations": Plug,
};

export const DOC_GUIDES: DocGuide[] = [
  {
    slug: "projects-guide",
    kicker: "Purchasing",
    title: "Projects & Job Costing",
    description: "One Projects table, two different screens to view it from, and a separate rate-calculator tool that feeds it — untangled.",
    icon: FolderKanban,
  },
  {
    slug: "pm-schedules-guide",
    kicker: "Equipt (CMMS)",
    title: "Preventive Maintenance Schedules",
    description: "Calendar-based recurring service, from one schedule covering a whole fleet down to per-asset parts.",
    icon: CalendarClock,
  },
  {
    slug: "parts-inventory-guide",
    kicker: "Equipt (CMMS)",
    title: "Parts Inventory",
    description: "Adding parts, linking them to assets, keeping stock and cost in sync, and when to split a part number into two.",
    icon: Container,
  },
  {
    slug: "meters-guide",
    kicker: "Equipt (CMMS)",
    title: "Meters & Usage-Based Automations",
    description: "Track hours, miles, gallons, and cycles on any asset — and let Equipt open the work order for you the moment a threshold is crossed.",
    icon: Gauge,
  },
  {
    slug: "clients-guide",
    kicker: "Landscapt (CRM)",
    title: "Clients, Properties & Leads",
    description: "Client accounts, commercial hierarchies, service properties, and the activity timeline that ties it all together.",
    icon: Users,
  },
  {
    slug: "estimating-guide",
    kicker: "Landscapt (CRM)",
    title: "Estimates & the Budget Engine",
    description: "How an estimate is built, how its numbers are actually calculated, and how it becomes a job.",
    icon: Calculator,
  },
  {
    slug: "jobs-packages-guide",
    kicker: "Landscapt (CRM)",
    title: "Jobs & Packages",
    description: "The six job types, how a job's status differs from a visit's status, and how a Package template turns into a billed job.",
    icon: CalendarDays,
  },
  {
    slug: "dispatch-board-guide",
    kicker: "Landscapt (CRM)",
    title: "The Dispatch Board",
    description: "The daily scheduling screen crews and dispatchers live in — visits, crews, status, and how actual hours get calculated.",
    icon: Map,
  },
  {
    slug: "sales-meetings-guide",
    kicker: "Landscapt (CRM)",
    title: "Sales Meetings",
    description: "Booking appointments per sales rep, the double-booking warning, and the split between a rep's direct reminder and the client-facing automation trigger.",
    icon: Handshake,
  },
  {
    slug: "waiting-list-guide",
    kicker: "Landscapt (CRM)",
    title: "The Waiting List",
    description: "Jobs with a date range instead of a date, held for opportunistic scheduling — and how to actually get them dispatched.",
    icon: Clock,
  },
  {
    slug: "snow-guide",
    kicker: "Landscapt (CRM)",
    title: "Snow Jobs & Storm Dispatch",
    description: "Storm events, priority dispatch, and the invoicing flow built specifically for snow.",
    icon: Snowflake,
  },
  {
    slug: "invoicing-guide",
    kicker: "Landscapt (CRM)",
    title: "Invoicing & Payments",
    description: "How an invoice is born, how its status moves, and where the client's own PO number actually goes.",
    icon: Receipt,
  },
  {
    slug: "contracts-guide",
    kicker: "Landscapt (CRM)",
    title: "Contracts",
    description: "Ongoing billing agreements — monthly amounts, seasonal overrides, sub-properties, and how signing and invoicing actually work.",
    icon: FileSignature,
  },
  {
    slug: "automations-guide",
    kicker: "Landscapt (CRM)",
    title: "Communication Automations",
    description: "How sequences, triggers, and events work — and how Automations differ from Sales Campaigns.",
    icon: Zap,
  },
  {
    slug: "forms-guide",
    kicker: "Landscapt (CRM)",
    title: "Forms & Lead Capture",
    description: "Building, publishing, and sharing public forms — and what happens to a submission once it lands.",
    icon: ClipboardList,
  },
  {
    slug: "tickets-guide",
    kicker: "Landscapt (CRM)",
    title: "Tickets",
    description: "Support and service tickets — where they come from, how they're worked, and how they connect to the rest of a client's record.",
    icon: Ticket,
  },
  {
    slug: "damage-cases-guide",
    kicker: "Landscapt (CRM)",
    title: "Damage Cases",
    description: "Tracking property damage and warranty claims tied to a job — what a case captures, how cost rolls up, and a real current limitation in how it connects to a client record.",
    icon: AlertTriangle,
  },
  {
    slug: "job-photos-guide",
    kicker: "Landscapt (CRM)",
    title: "Job Photos",
    description: "Field photo documentation, annotation, and before/after comparisons — attached to a job site, not a person.",
    icon: Camera,
  },
  {
    slug: "client-portal-guide",
    kicker: "Client Portal",
    title: "The Client Portal",
    description: "A branded, self-serve site where Landscapt clients view their account, pay invoices, and act on estimates — entirely separate from staff login.",
    icon: Globe,
  },
  {
    slug: "report-center-guide",
    kicker: "Reporting",
    title: "Report Center & Dashboards",
    description: "Where the ~75 pre-built reports live, how a report actually runs, and how the curated dashboards differ from the ones you build yourself.",
    icon: BarChart3,
  },
  {
    slug: "reports-reference-guide",
    kicker: "Reporting",
    title: "Reports Reference",
    description: "What every report actually measures, its filters, and the gotchas to know before trusting the numbers — organized by section.",
    icon: ListChecks,
  },
  {
    slug: "approval-flows-guide",
    kicker: "Administration",
    title: "Approval Flows",
    description: "How Requisition and Purchase Order approval chains are configured, processed, and resolved.",
    icon: GitMerge,
  },
  {
    slug: "notification-preferences-guide",
    kicker: "Administration",
    title: "Notification Preferences",
    description: "How email and in-app notifications are configured, where the defaults come from, and how the bell keeps read state in sync.",
    icon: Bell,
  },
  {
    slug: "users-roles-guide",
    kicker: "Administration",
    title: "Users, Roles & Permissions",
    description: "How access works across Equipt, Landscapt, crew logins, and the client portal — and why they aren't all the same system.",
    icon: ShieldCheck,
  },
  {
    slug: "import-export-guide",
    kicker: "Administration",
    title: "Import & Export",
    description: "What Settings → Import / Export actually does for each entity, exactly how row validation and duplicate handling work, and the full mechanics of the bulk Purchase Order importer.",
    icon: FileInput,
  },
  {
    slug: "required-fields-guide",
    kicker: "Administration",
    title: "Required Fields",
    description: "What Required Fields actually controls, entity by entity — and where it stops.",
    icon: ListChecks,
  },
  {
    slug: "api-mcp-guide",
    kicker: "Integrations",
    title: "API Keys & MCP",
    description: "How scoped API keys work, and how to hand the same key to an AI agent over MCP.",
    icon: KeyRound,
  },
  {
    slug: "zapier-guide",
    kicker: "Integrations",
    title: "Connecting Zapier",
    description: "Every trigger, every action, and exactly what fires each one.",
    icon: Workflow,
  },
  {
    slug: "samsara-guide",
    kicker: "Integrations",
    title: "Samsara Integration",
    description: "What actually syncs, how vehicles get matched, and where to look when a reading doesn't show up.",
    icon: Radio,
  },
  {
    slug: "inventory-costing-guide",
    kicker: "Administration",
    title: "Inventory Costing Methods",
    description: "How the cost of a Part or Product is tracked as inventory moves in and out — and the one place FIFO doesn't behave quite the way the settings page implies.",
    icon: Layers,
  },
  {
    slug: "purchase-orders-guide",
    kicker: "Purchasing",
    title: "Purchase Orders, Requisitions & Receiving",
    description: "The full procurement path in one place — requesting, converting to a PO, approving, and receiving — plus the exact statuses and a few real footguns along the way.",
    icon: PackageCheck,
  },
  {
    slug: "product-catalog-guide",
    kicker: "Purchasing",
    title: "Managing the Products Catalog",
    description: "The single source of truth for every purchasable item — and how the Maintenance Part category quietly keeps a second table in sync behind the scenes.",
    icon: Boxes,
  },
  {
    slug: "work-orders-guide",
    kicker: "Equipt (CMMS)",
    title: "Work Orders & Maintenance Requests",
    description: "How a Work Order actually moves through status, how a Maintenance Request gets triaged into one, and what really happens to parts inventory along the way.",
    icon: ClipboardCheck,
  },
  {
    slug: "online-payments-guide",
    kicker: "Landscapt (CRM)",
    title: "Online Payments & Stripe",
    description: "How a client actually pays an invoice online, how Stripe Connect keeps every org's money in their own account, and how the platform takes zero cut.",
    icon: CreditCard,
  },
];

/** Set of every guide slug — used to tell a guide-detail page apart from the plain /settings/support pages it's nested under. */
export const DOC_GUIDE_SLUGS = new Set(DOC_GUIDES.map((g) => g.slug));

/** DOC_GUIDES grouped by kicker, in a fixed display order for the library index. */
export function groupedDocGuides(): { kicker: string; guides: DocGuide[] }[] {
  const order = [
    "Purchasing",
    "Equipt (CMMS)",
    "Landscapt (CRM)",
    "Client Portal",
    "Reporting",
    "Administration",
    "Integrations",
  ];
  return order
    .map((kicker) => ({ kicker, guides: DOC_GUIDES.filter((g) => g.kicker === kicker) }))
    .filter((group) => group.guides.length > 0);
}
