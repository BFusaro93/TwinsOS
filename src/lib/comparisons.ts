export type ComparisonRow = {
  label: string;
  landscapt: string;
  competitor: string;
};

export type Competitor = {
  slug: string;
  name: string;
  /** Short category label shown under the name, e.g. "Landscape-specific FSM". */
  category: string;
  tagline: string;
  bestFor: string;
  strengths: string[];
  considerations: string[];
  /** Soft, hedged pricing note — competitor pricing changes often, so this is framed as a ballpark, not a current quote. */
  pricingNote: string;
  /** Why a team evaluating this competitor might prefer Landscapt & Equipt instead. */
  switchReasons: { title: string; body: string }[];
  comparisonRows: ComparisonRow[];
};

export const COMPETITORS: Competitor[] = [
  {
    slug: "service-autopilot",
    name: "Service Autopilot",
    category: "Landscape & lawn care software",
    tagline: "A deep automation engine built for larger recurring-route operations.",
    bestFor: "Lawn and landscape companies past ~10 crews investing heavily in marketing/follow-up automation.",
    strengths: [
      "Mature CRM, routing, and dispatch built specifically for lawn care and snow operations",
      "Strong automated email/text marketing and follow-up campaigns",
      "QuickBooks-centric accounting workflow",
      "Chemical/fertilization application tracking",
    ],
    considerations: [
      "Deepest automation tools are gated behind the top pricing tier",
      "No self-serve free trial, plus an unpublished sign-up fee",
      "Setup complexity can be a lot for smaller crews",
      "Crew/mobile field logins are billed as additional users, not included free",
      "No Zapier, open API, or MCP server for custom integrations",
      "Credit card and ACH processing fees run higher than typical",
    ],
    pricingNote: "Tiered plans have historically ranged roughly $49–$499/mo depending on tier, plus a sign-up fee — confirm current pricing directly with Service Autopilot.",
    switchReasons: [
      {
        title: "Equipment maintenance in the same login",
        body: "Service Autopilot tracks assets as a field, not a maintenance system. Equipt runs preventive maintenance schedules, work orders, and parts inventory for your fleet — under the same account as your CRM, not a separate purchase.",
      },
      {
        title: "Free crew logins, real free trial",
        body: "Field crew mobile access doesn't count as a billable seat, and you start on a 30-day free trial with no card required — no unpublished setup fee, and no per-crew-member charge just to check a route.",
      },
      {
        title: "Open API, Zapier, and MCP included",
        body: "Connect Zapier, build against the REST API, or use the MCP server for custom integrations — none of those are available in Service Autopilot today.",
      },
    ],
    comparisonRows: [
      { label: "CRM, scheduling & dispatch", landscapt: "Included", competitor: "Included" },
      { label: "Snow operations", landscapt: "Included", competitor: "Included" },
      { label: "Chemical / fertilization tracking", landscapt: "Included", competitor: "Included" },
      { label: "Equipment / asset maintenance (CMMS)", landscapt: "Included (Equipt)", competitor: "Not offered" },
      { label: "Budget-based estimating engine", landscapt: "Included", competitor: "Manual/template-based" },
      { label: "Crew / field mobile logins", landscapt: "Free, unlimited", competitor: "Billed as additional users" },
      { label: "Zapier / open API / MCP", landscapt: "Included", competitor: "Not offered" },
      { label: "Free trial", landscapt: "30 days, no card", competitor: "None published" },
      { label: "Sign-up fee", landscapt: "None", competitor: "Unpublished fee reported" },
    ],
  },
  {
    slug: "jobber",
    name: "Jobber",
    category: "General field service software",
    tagline: "Fast to onboard, built broadly for home service trades rather than landscaping specifically.",
    bestFor: "Small crews (2–50 employees) that want scheduling, quoting, and invoicing working out of the box within a week.",
    strengths: [
      "Short learning curve — most teams onboard in about a week",
      "Clean scheduling, quoting, and invoicing workflow",
      "Broad payment-app integrations for on-site billing",
    ],
    considerations: [
      "No crew-level profitability or job-costing depth",
      "Route optimization doesn't account for equipment requirements",
      "Not built specifically for landscaping — no production-rate estimating or snow operations",
      "Every Individual plan — even paid ones — includes just 1 user; a Team plan is required to add more",
    ],
    pricingNote: "Individual plans have historically started around $39/mo but include only 1 user regardless of tier; Team plans start higher and bundle more seats, with additional users billed on top — confirm current pricing directly with Jobber.",
    switchReasons: [
      {
        title: "Built for landscaping, not general trades",
        body: "Estimating is based on production rates and labor burden specific to landscape and snow work, not a generic quote template.",
      },
      {
        title: "Job costing down to the crew",
        body: "See actual vs. budgeted cost per job and per crew, not just invoiced totals.",
      },
      {
        title: "More than one seat from day one",
        body: "Jobber's paid Individual plans include a single login no matter the tier — you need a separate Team plan just to add a second user. Landscapt plans include multiple seats from the start.",
      },
    ],
    comparisonRows: [
      { label: "Onboarding time", landscapt: "Guided setup", competitor: "~1 week (fast, broad-trade setup)" },
      { label: "Production-rate estimating", landscapt: "Included", competitor: "Not available" },
      { label: "Snow operations", landscapt: "Included", competitor: "Not available" },
      { label: "Crew-level job costing", landscapt: "Included", competitor: "Limited" },
      { label: "Equipment / asset maintenance (CMMS)", landscapt: "Included (Equipt)", competitor: "Not offered" },
      { label: "Users on entry-level plan", landscapt: "Multiple seats included", competitor: "1 user, even on paid Individual plans" },
    ],
  },
  {
    slug: "lmn",
    name: "LMN",
    category: "Landscape & hardscape business software",
    tagline: "Strong budgeting and job-costing tools for design-build and install-heavy landscape businesses.",
    bestFor: "Small-to-mid landscape and hardscape contractors with significant install/build revenue.",
    strengths: [
      "Budget-based estimating and detailed job costing",
      "Time tracking and payroll via a dedicated crew app",
      "Industry-specific cost modeling for landscape and hardscape work",
      "Zapier integration for connecting other tools",
    ],
    considerations: [
      "Built primarily around construction/install workflows, less depth on recurring maintenance CRM",
      "No native equipment/asset maintenance system",
      "Pricing scales with office + crew license counts",
    ],
    pricingNote: "Plans have historically started around $297/mo, with the mid-range Professional tier around $648/mo, scaling up for larger teams — confirm current pricing directly with LMN.",
    switchReasons: [
      {
        title: "One platform for maintenance and install",
        body: "Recurring maintenance CRM, dispatch, and client billing live alongside project/job costing — not weighted toward install work only.",
      },
      {
        title: "Fleet and equipment maintenance included",
        body: "Equipt runs preventive maintenance, work orders, and parts inventory for the same trucks and mowers LMN only tracks as line items.",
      },
      {
        title: "Snow operations built in",
        body: "Storm-based dispatch and snow-specific invoicing, not a workaround inside a landscaping-only workflow.",
      },
    ],
    comparisonRows: [
      { label: "Budget-based estimating", landscapt: "Included", competitor: "Included" },
      { label: "Job costing", landscapt: "Included", competitor: "Included" },
      { label: "Recurring maintenance CRM depth", landscapt: "Full CRM/FSM", competitor: "Lighter — install-focused" },
      { label: "Snow operations", landscapt: "Included", competitor: "Limited" },
      { label: "Equipment / asset maintenance (CMMS)", landscapt: "Included (Equipt)", competitor: "Not offered" },
      { label: "Licensing model", landscapt: "Per-seat, named users", competitor: "Office + crew license bundles" },
    ],
  },
  {
    slug: "aspire",
    name: "Aspire",
    category: "Commercial landscape software (ServiceTitan)",
    tagline: "A premium operating system for commercial landscape contractors over $1M in revenue.",
    bestFor: "Established commercial landscape contractors needing multi-branch visibility and deep purchasing/inventory controls.",
    strengths: [
      "Real-time reporting and multi-branch visibility",
      "Purchase orders with inventory tracking",
    ],
    considerations: [
      "Priced and built for contractors above $1M in annual revenue — heavy for smaller operations",
      "Acquired by ServiceTitan in 2023, shifting long-term product direction",
      "Equipment/asset maintenance tools are limited, not a full CMMS",
      "No visual drag-and-drop dispatch board for day-to-day scheduling",
    ],
    pricingNote: "Typically $2,500+/mo as a single license priced against company revenue rather than per user — confirm current pricing directly with Aspire.",
    switchReasons: [
      {
        title: "Commercial-grade without the $1M floor",
        body: "The same estimating rigor and purchasing controls, without a pricing model built around enterprise contractors only.",
      },
      {
        title: "A real dispatch board",
        body: "Plan and reschedule the day visually with drag-and-drop — Aspire has no dispatch board for day-to-day scheduling.",
      },
      {
        title: "A more complete equipment maintenance system",
        body: "Equipt handles preventive maintenance, work orders, and parts inventory for the fleet — Aspire's equipment tracking is limited by comparison.",
      },
    ],
    comparisonRows: [
      { label: "Target company size", landscapt: "Any size", competitor: "$1M+ commercial contractors" },
      { label: "Purchase orders & inventory", landscapt: "Included", competitor: "Included" },
      { label: "Real-time reporting", landscapt: "Included", competitor: "Included" },
      { label: "Dispatch board", landscapt: "Included", competitor: "Not offered" },
      { label: "Equipment / asset maintenance (CMMS)", landscapt: "Included (Equipt)", competitor: "Limited" },
      { label: "Licensing model", landscapt: "Per-seat", competitor: "Single license, priced against revenue" },
      { label: "Free trial", landscapt: "30 days, no card", competitor: "Demo-gated" },
    ],
  },
  {
    slug: "housecall-pro",
    name: "Housecall Pro",
    category: "General home service software",
    tagline: "A broad home-service platform with strong marketing tools, not landscaping-specific.",
    bestFor: "General trades (HVAC, plumbing, electrical, landscaping) wanting review-generation and marketing built in.",
    strengths: [
      "Automated review solicitation and customer marketing tools",
      "Straightforward scheduling, dispatching, and invoicing",
      "Broad trade coverage beyond landscaping",
    ],
    considerations: [
      "GPS tracking and QuickBooks sync are locked to higher tiers",
      "Add-on costs (price book, advanced proposals, GPS) are a commonly cited source of bill creep",
      "No production-rate estimating, snow operations, or asset maintenance built for landscaping",
    ],
    pricingNote: "Plans have historically run about $59–$299+/mo on annual billing, with several features sold as add-ons — confirm current pricing directly with Housecall Pro.",
    switchReasons: [
      {
        title: "No add-on tax",
        body: "Route/GPS visibility and reporting aren't upsells bolted onto a base plan built for a different trade.",
      },
      {
        title: "Landscaping-specific estimating",
        body: "Production rates, labor burden, and overhead markup — not a generic trades quote template.",
      },
      {
        title: "Snow and fleet maintenance included",
        body: "Storm-based snow dispatch and Equipt's preventive maintenance/work orders for your trucks and mowers, in one account.",
      },
    ],
    comparisonRows: [
      { label: "Industry focus", landscapt: "Landscape & snow specific", competitor: "General home services" },
      { label: "QuickBooks sync / GPS", landscapt: "Included", competitor: "Higher-tier only" },
      { label: "Production-rate estimating", landscapt: "Included", competitor: "Not available" },
      { label: "Snow operations", landscapt: "Included", competitor: "Not available" },
      { label: "Equipment / asset maintenance (CMMS)", landscapt: "Included (Equipt)", competitor: "Not offered" },
      { label: "Add-on pricing model", landscapt: "Feature set included in plan", competitor: "Several features sold separately" },
    ],
  },
  {
    slug: "homeworks",
    name: "Homeworks (formerly Copilot)",
    category: "Home service CRM (rebranded from Copilot CRM)",
    tagline: "A CRM for home service businesses scaling from roughly $250K to $3M in revenue.",
    bestFor: "Smaller, fast-growing lawn and landscape businesses wanting sales, scheduling, and invoicing in one system.",
    strengths: [
      "Sales, scheduling, estimating, invoicing, and automation combined for growing businesses",
      "Reporting built for visibility into financial performance",
      "Active recent investment following the Copilot-to-Homeworks rebrand",
      "Zapier integration for connecting other tools",
      "Free entry-level plan",
    ],
    considerations: [
      "Recently rebranded (from Copilot CRM) — a newer product identity with a shorter track record under the new name",
      "Price book and chemical/fertilization features are still on the near-term roadmap rather than fully built out",
      "Equipment maintenance features exist but are limited compared to a full CMMS",
    ],
    pricingNote: "Plans have historically ranged from a free tier up to roughly $379/mo — confirm current pricing directly with Homeworks.",
    switchReasons: [
      {
        title: "Built past the $3M ceiling too",
        body: "The same platform scales from a first hire to a multi-crew operation, budget engine and job costing included, not a tier you outgrow.",
      },
      {
        title: "A more complete equipment maintenance system",
        body: "Equipt's preventive maintenance, work orders, and parts inventory go further than Homeworks' current equipment features.",
      },
      {
        title: "Snow operations included",
        body: "Storm-based scheduling and snow-specific invoicing ship as part of the core product.",
      },
    ],
    comparisonRows: [
      { label: "Target company size", landscapt: "Any size", competitor: "~$250K–$3M revenue" },
      { label: "Budget-based estimating", landscapt: "Included", competitor: "Limited" },
      { label: "Snow operations", landscapt: "Included", competitor: "Not available" },
      { label: "Chemical / fertilization tracking", landscapt: "Included", competitor: "On roadmap" },
      { label: "Equipment / asset maintenance (CMMS)", landscapt: "Included (Equipt)", competitor: "Limited" },
      { label: "Product track record under current name", landscapt: "—", competitor: "Recently rebranded from Copilot CRM" },
    ],
  },
];

export function getCompetitor(slug: string): Competitor | undefined {
  return COMPETITORS.find((c) => c.slug === slug);
}
