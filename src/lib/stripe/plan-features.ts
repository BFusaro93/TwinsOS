import type { BillablePlan } from "./plans";

/** A feature's value per plan: true/false for included/not, or a short string for a limit/description. */
type FeatureValue = boolean | string;

export interface PlanFeature {
  key: string;
  label: string;
  /** One-line explanation shown under the label, same pattern as Home Works' comparison table. */
  description: string;
  /** Eligible to appear in the compact plan-card highlight list. */
  highlight: boolean;
  /** When set, only these plans show this feature in their highlight list (still shown for every plan in the full table). Use to keep a plan's card from listing every feature it happens to include. */
  highlightOnlyFor?: BillablePlan[];
  values: Record<BillablePlan, FeatureValue>;
}

export interface PlanFeatureCategory {
  category: string;
  features: PlanFeature[];
}

// Ordered for the comparison table; highlight: true features also populate
// each plan card's short bullet list in SubscriptionTab (filtered per plan
// to only the ones actually included for it, and further filtered by
// highlightOnlyFor when set).
export const PLAN_FEATURE_CATEGORIES: PlanFeatureCategory[] = [
  {
    category: "Core",
    features: [
      {
        key: "landscapt",
        label: "Landscapt (CRM / Field Service)",
        description: "Clients, estimates, scheduling, invoicing, and payments for landscaping and snow operations.",
        highlight: true,
        values: { starter: true, cmms: false, growth: true, enterprise: true },
      },
      {
        key: "equipt",
        label: "Equipt (Asset Management / Maintenance)",
        description: "Asset registry, preventive maintenance, work orders, and parts inventory.",
        highlight: true,
        values: { starter: false, cmms: true, growth: true, enterprise: true },
      },
      {
        key: "crews",
        label: "Field crew / mobile logins",
        description: "Shared clock-in accounts for field crews — never count toward your seat limit.",
        highlight: true,
        values: { starter: "Unlimited", cmms: false, growth: "Unlimited", enterprise: "Unlimited" },
      },
      {
        key: "seats",
        label: "Office/admin seats included",
        description: "Named logins for staff who need their own account and permissions.",
        highlight: true,
        values: { starter: "5", cmms: "5", growth: "10", enterprise: "20" },
      },
    ],
  },
  {
    category: "Purchasing (Equipt)",
    features: [
      {
        key: "requisitions",
        label: "Purchase requisitions & approvals",
        description: "Internal requests to buy, routed through a configurable approval chain before becoming a PO.",
        highlight: false,
        values: { starter: false, cmms: true, growth: true, enterprise: true },
      },
      {
        key: "purchase_orders",
        label: "Purchase orders & receiving",
        description: "Formal POs to vendors, with goods receipt tracking that updates parts inventory automatically.",
        highlight: true,
        highlightOnlyFor: ["cmms"],
        values: { starter: false, cmms: true, growth: true, enterprise: true },
      },
      {
        key: "vendors",
        label: "Vendor management",
        description: "One vendor list shared across purchasing and maintenance.",
        highlight: false,
        values: { starter: false, cmms: true, growth: true, enterprise: true },
      },
    ],
  },
  {
    category: "Maintenance (Equipt)",
    features: [
      {
        key: "work_orders",
        label: "Work orders",
        description: "Track inspection, repair, and maintenance tasks against your asset registry.",
        highlight: true,
        highlightOnlyFor: ["cmms"],
        values: { starter: false, cmms: true, growth: true, enterprise: true },
      },
      {
        key: "pm_schedules",
        label: "Preventive maintenance schedules",
        description: "Recurring maintenance triggered by calendar intervals or meter readings.",
        highlight: false,
        values: { starter: false, cmms: true, growth: true, enterprise: true },
      },
      {
        key: "meters",
        label: "Meter-based maintenance triggers",
        description: "Fire PM schedules off hours, mileage, or cycle counts instead of just a calendar date.",
        highlight: true,
        highlightOnlyFor: ["cmms"],
        values: { starter: false, cmms: true, growth: true, enterprise: true },
      },
      {
        key: "parts_inventory",
        label: "Parts & asset inventory",
        description: "Track spare parts and consumables, linked to the assets that typically use them.",
        highlight: true,
        highlightOnlyFor: ["cmms"],
        values: { starter: false, cmms: true, growth: true, enterprise: true },
      },
    ],
  },
  {
    category: "Sales & Scheduling (Landscapt)",
    features: [
      {
        key: "estimates",
        label: "Estimates with budget-based job costing",
        description: "Production rates, labor burden, and overhead markup roll up into a configurable margin.",
        highlight: true,
        values: { starter: true, cmms: false, growth: true, enterprise: true },
      },
      {
        key: "ai_estimate_drafting",
        label: "AI-drafted estimate line items",
        description: "Describe the work in plain language and get suggested line items from Claude, based on your services and past won estimates. Limited to 50 drafts per organization per day.",
        highlight: true,
        values: { starter: true, cmms: false, growth: true, enterprise: true },
      },
      {
        key: "dispatch",
        label: "Dispatch board & scheduling",
        description: "Daily crew scheduling view, modeled after Service Autopilot's dispatch board.",
        highlight: false,
        values: { starter: true, cmms: false, growth: true, enterprise: true },
      },
      {
        key: "waiting_list",
        label: "Waiting list & snow dispatch",
        description: "Geo-tagged jobs queued for opportunistic scheduling, plus storm-based snow dispatch.",
        highlight: false,
        values: { starter: true, cmms: false, growth: true, enterprise: true },
      },
      {
        key: "contracts",
        label: "Recurring contracts & packages",
        description: "Fixed monthly billing for bundled service programs, with sub-property billing support.",
        highlight: false,
        values: { starter: true, cmms: false, growth: true, enterprise: true },
      },
    ],
  },
  {
    category: "Invoicing & Payments",
    features: [
      {
        key: "invoicing",
        label: "Invoicing",
        description: "Draft-to-paid invoicing with a configurable status workflow.",
        highlight: true,
        values: { starter: true, cmms: false, growth: true, enterprise: true },
      },
      {
        key: "online_payments",
        label: "Accept credit card & ACH payments online",
        description: "Clients pay by card or bank transfer; staff can also charge a saved method directly.",
        highlight: true,
        values: { starter: true, cmms: false, growth: true, enterprise: true },
      },
      {
        key: "stripe_processing",
        label: "Stripe-powered payment processing",
        description: "Stripe's standard rates apply (2.9% + $0.30 per card charge; 0.8% per ACH transfer, capped at $5). A pass-through fee to recover the card cost from clients — 3.5% above $500 by default — is on by default and adjustable per org, including disabling it.",
        highlight: true,
        values: { starter: true, cmms: false, growth: true, enterprise: true },
      },
      {
        key: "autopay",
        label: "Saved payment methods & autopay",
        description: "Keep a card or bank account on file, with optional automatic charging on invoice due dates.",
        highlight: false,
        values: { starter: true, cmms: false, growth: true, enterprise: true },
      },
    ],
  },
  {
    category: "Communication & Automation",
    features: [
      {
        key: "automations",
        label: "Automation sequences",
        description: "Event-driven emails, texts, and alerts — e.g. job completed → follow-up email 24h later.",
        highlight: false,
        values: { starter: "Unlimited", cmms: "Unlimited", growth: "Unlimited", enterprise: "Unlimited" },
      },
      {
        key: "sms",
        label: "SMS / text messaging",
        description: "500 messages included, then $10 per 250 over.",
        highlight: false,
        values: { starter: "Add-on", cmms: false, growth: "Add-on", enterprise: "Add-on" },
      },
      {
        key: "client_portal",
        label: "Client self-service portal",
        description: "Clients view and pay invoices, view estimates, and submit tickets without calling in.",
        highlight: false,
        values: { starter: "Add-on", cmms: false, growth: true, enterprise: true },
      },
      {
        key: "call_notes",
        label: "Call notes & reminders",
        description: "Log a call on a client's activity timeline and set a follow-up reminder from it.",
        highlight: false,
        values: { starter: true, cmms: false, growth: true, enterprise: true },
      },
    ],
  },
  {
    category: "Reporting & Advanced",
    features: [
      {
        key: "basic_reporting",
        label: "Standard reports",
        description: "The built-in report library covering day-to-day operations.",
        highlight: false,
        values: { starter: true, cmms: true, growth: true, enterprise: true },
      },
      {
        key: "advanced_reporting",
        label: "Advanced reporting & job costing analytics",
        description: "Deeper financial and operational analysis beyond the standard report library.",
        highlight: false,
        values: { starter: "Add-on", cmms: "Add-on", growth: "Add-on", enterprise: true },
      },
      {
        key: "route_optimization",
        label: "Route optimization",
        description: "Automatically sequence stops to minimize drive time between jobs or service calls.",
        highlight: false,
        values: { starter: "Add-on", cmms: false, growth: "Add-on", enterprise: true },
      },
      {
        key: "api_access",
        label: "API access",
        description: "Programmatic access to your data for custom integrations.",
        highlight: false,
        values: { starter: "Add-on", cmms: "Add-on", growth: "Add-on", enterprise: true },
      },
      {
        key: "zapier",
        label: "Zapier integration",
        description: "Connect to thousands of apps with Zapier — no add-on, included on every plan.",
        highlight: false,
        values: { starter: true, cmms: true, growth: true, enterprise: true },
      },
    ],
  },
  {
    category: "Support",
    features: [
      {
        key: "support",
        label: "Support",
        description: "How you reach us when something needs a human.",
        highlight: true,
        values: { starter: "Email", cmms: "Email", growth: "Email & chat", enterprise: "Dedicated account manager" },
      },
    ],
  },
];

export function getHighlightsForPlan(plan: BillablePlan): string[] {
  const highlights: string[] = [];
  for (const category of PLAN_FEATURE_CATEGORIES) {
    for (const feature of category.features) {
      if (!feature.highlight) continue;
      if (feature.highlightOnlyFor && !feature.highlightOnlyFor.includes(plan)) continue;
      const value = feature.values[plan];
      if (value === false) continue;
      highlights.push(value === true ? feature.label : `${feature.label}: ${value}`);
    }
  }
  return highlights;
}
