// Downloadable one-sheeters served from /public/guides. Each PDF is built from an HTML
// source in docs/sales/ (same name pattern) — re-export the PDF there, then copy it here.

export type GuideDownload = {
  slug: string;
  title: string;
  product: "Landscapt" | "Equipt";
  description: string;
  /** Path under /public, e.g. /guides/Landscapt-Snow-Operations.pdf */
  file: string;
  /** Feature page that explains the same topic, if there is one. */
  featurePath?: string;
};

export const GUIDE_DOWNLOADS: GuideDownload[] = [
  {
    slug: "switching-checklist",
    title: "Switching to Landscapt: transition checklist",
    product: "Landscapt",
    description:
      "Everything to export and send when moving from Service Autopilot or Homeworks, and what we handle for you.",
    file: "/guides/Landscapt-Switching-Checklist.pdf",
  },
  {
    slug: "estimating",
    title: "Estimating & job costing",
    product: "Landscapt",
    description: "Budget-based estimates, proposals and deposits, conversion to jobs, and actual-vs-estimated costing.",
    file: "/guides/Landscapt-Estimating-Job-Costing.pdf",
    featurePath: "/features/landscapt/estimating",
  },
  {
    slug: "dispatch",
    title: "Dispatch & scheduling",
    product: "Landscapt",
    description: "Recurring schedules, the daily dispatch board, waiting list, route order, and the crew app.",
    file: "/guides/Landscapt-Dispatch-Scheduling.pdf",
    featurePath: "/features/landscapt/scheduling",
  },
  {
    slug: "invoicing",
    title: "Invoicing & payments",
    product: "Landscapt",
    description: "Auto-invoicing, contract billing, online card payments, the client portal, and QuickBooks.",
    file: "/guides/Landscapt-Invoicing-Payments.pdf",
    featurePath: "/features/landscapt/invoicing",
  },
  {
    slug: "snow",
    title: "Snow operations",
    product: "Landscapt",
    description: "Storm events, priority dispatch, crew tracking, client messaging, and snow billing.",
    file: "/guides/Landscapt-Snow-Operations.pdf",
    featurePath: "/features/landscapt/snow",
  },
  {
    slug: "chemical",
    title: "Chemical tracking",
    product: "Landscapt",
    description: "Application records, compliance reporting, and inventory depletion for chemical work.",
    file: "/guides/Landscapt-Chemical-Tracking.pdf",
  },
  {
    slug: "payroll",
    title: "Payroll & time tracking",
    product: "Landscapt",
    description: "Crew time capture, timesheets, and hours that flow into payroll and job costing.",
    file: "/guides/Landscapt-Payroll-Time-Tracking.pdf",
  },
  {
    slug: "equipt",
    title: "Maintenance & purchasing",
    product: "Equipt",
    description: "Assets, work orders, preventive maintenance, parts inventory, and requisition-to-PO purchasing.",
    file: "/guides/Equipt-Maintenance-Purchasing.pdf",
    featurePath: "/features/equipt/work-orders",
  },
];

export function getGuideDownload(slug: string): GuideDownload | undefined {
  return GUIDE_DOWNLOADS.find((g) => g.slug === slug);
}
