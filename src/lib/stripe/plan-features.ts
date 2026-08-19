import type { BillablePlan } from "./plans";

/** A feature's value per plan: true/false for included/not, or a short string for a limit/description. */
type FeatureValue = boolean | string;

export interface PlanFeature {
  key: string;
  label: string;
  /** Shown in the compact plan-card highlight list (kept short — 5-6 per plan). */
  highlight: boolean;
  values: Record<BillablePlan, FeatureValue>;
}

export interface PlanFeatureCategory {
  category: string;
  features: PlanFeature[];
}

// Ordered for the comparison table; highlight: true features also populate
// each plan card's short bullet list in SubscriptionTab (filtered per plan
// to only the ones that are actually included for it).
export const PLAN_FEATURE_CATEGORIES: PlanFeatureCategory[] = [
  {
    category: "Core",
    features: [
      {
        key: "landscapt",
        label: "Landscapt (CRM / Field Service)",
        highlight: true,
        values: { starter: true, cmms: false, growth: true, enterprise: true },
      },
      {
        key: "equipt",
        label: "Equipt (CMMS / Maintenance)",
        highlight: true,
        values: { starter: false, cmms: true, growth: true, enterprise: true },
      },
      {
        key: "crews",
        label: "Field crew / mobile logins",
        highlight: true,
        values: { starter: "Unlimited", cmms: "Unlimited", growth: "Unlimited", enterprise: "Unlimited" },
      },
      {
        key: "seats",
        label: "Office/admin seats included",
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
        highlight: false,
        values: { starter: false, cmms: true, growth: true, enterprise: true },
      },
      {
        key: "purchase_orders",
        label: "Purchase orders & receiving",
        highlight: false,
        values: { starter: false, cmms: true, growth: true, enterprise: true },
      },
      {
        key: "vendors",
        label: "Vendor management",
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
        highlight: false,
        values: { starter: false, cmms: true, growth: true, enterprise: true },
      },
      {
        key: "pm_schedules",
        label: "Preventive maintenance schedules",
        highlight: false,
        values: { starter: false, cmms: true, growth: true, enterprise: true },
      },
      {
        key: "parts_inventory",
        label: "Parts & asset inventory",
        highlight: false,
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
        highlight: true,
        values: { starter: true, cmms: false, growth: true, enterprise: true },
      },
      {
        key: "dispatch",
        label: "Dispatch board & scheduling",
        highlight: false,
        values: { starter: true, cmms: false, growth: true, enterprise: true },
      },
      {
        key: "waiting_list",
        label: "Waiting list & snow dispatch",
        highlight: false,
        values: { starter: true, cmms: false, growth: true, enterprise: true },
      },
      {
        key: "contracts",
        label: "Recurring contracts & packages",
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
        highlight: true,
        values: { starter: true, cmms: true, growth: true, enterprise: true },
      },
      {
        key: "online_payments",
        label: "Accept credit card & ACH payments online",
        highlight: true,
        values: { starter: true, cmms: true, growth: true, enterprise: true },
      },
      {
        key: "autopay",
        label: "Saved payment methods & autopay",
        highlight: false,
        values: { starter: true, cmms: true, growth: true, enterprise: true },
      },
    ],
  },
  {
    category: "Communication & Automation",
    features: [
      {
        key: "automations",
        label: "Automation sequences",
        highlight: false,
        values: { starter: "Up to 3 active", cmms: "Up to 3 active", growth: "Unlimited", enterprise: "Unlimited" },
      },
      {
        key: "sms",
        label: "SMS / text messaging",
        highlight: false,
        values: { starter: "Add-on", cmms: "Add-on", growth: "Add-on", enterprise: "Add-on" },
      },
      {
        key: "client_portal",
        label: "Client self-service portal",
        highlight: false,
        values: { starter: "Add-on", cmms: false, growth: true, enterprise: true },
      },
    ],
  },
  {
    category: "Reporting & Advanced",
    features: [
      {
        key: "basic_reporting",
        label: "Standard reports",
        highlight: false,
        values: { starter: true, cmms: true, growth: true, enterprise: true },
      },
      {
        key: "advanced_reporting",
        label: "Advanced reporting & job costing analytics",
        highlight: false,
        values: { starter: "Add-on", cmms: "Add-on", growth: "Add-on", enterprise: true },
      },
      {
        key: "route_optimization",
        label: "Route optimization",
        highlight: false,
        values: { starter: "Add-on", cmms: false, growth: "Add-on", enterprise: true },
      },
      {
        key: "api_access",
        label: "API access",
        highlight: false,
        values: { starter: false, cmms: false, growth: "Add-on", enterprise: true },
      },
    ],
  },
  {
    category: "Support",
    features: [
      {
        key: "support",
        label: "Support",
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
      const value = feature.values[plan];
      if (value === false) continue;
      highlights.push(value === true ? feature.label : `${feature.label}: ${value}`);
    }
  }
  return highlights;
}
