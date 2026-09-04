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
    ],
    considerations: [
      "Deepest automation tools are gated behind the top pricing tier",
      "No self-serve free trial, plus an unpublished sign-up fee",
      "Setup complexity can be a lot for smaller crews",
    ],
    pricingNote: "Tiered plans have historically ranged roughly $49–$499/mo depending on tier, plus a sign-up fee — confirm current pricing directly with Service Autopilot.",
    switchReasons: [
      {
        title: "Equipment maintenance in the same login",
        body: "Service Autopilot tracks assets as a field, not a maintenance system. Equipt runs preventive maintenance schedules, work orders, and parts inventory for your fleet — under the same account as your CRM, not a separate purchase.",
      },
      {
        title: "No sign-up fee, real free trial",
        body: "Start on a 30-day free trial with no card required and no unpublished setup fee.",
      },
      {
        title: "Budget-engine estimating built in",
        body: "Estimates price off production rates, labor burden, and overhead markup from day one, not as an upsell.",
      },
    ],
    comparisonRows: [
      { label: "CRM, scheduling & dispatch", landscapt: "Included", competitor: "Included" },
      { label: "Snow operations", landscapt: "Included", competitor: "Included" },
      { label: "Equipment / asset maintenance (CMMS)", landscapt: "Included (Equipt)", competitor: "Not offered" },
      { label: "Budget-based estimating engine", landscapt: "Included", competitor: "Manual/template-based" },
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
    ],
    pricingNote: "Individual plans have historically started around $39/mo, with team plans and a Marketing Suite add-on priced separately — confirm current pricing directly with Jobber.",
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
        title: "Snow and asset maintenance in one platform",
        body: "Storm-based snow dispatch and equipment/fleet maintenance (Equipt) live in the same account — Jobber has neither.",
      },
    ],
    comparisonRows: [
      { label: "Onboarding time", landscapt: "Guided setup", competitor: "~1 week (fast, broad-trade setup)" },
      { label: "Production-rate estimating", landscapt: "Included", competitor: "Not available" },
      { label: "Snow operations", landscapt: "Included", competitor: "Not available" },
      { label: "Crew-level job costing", landscapt: "Included", competitor: "Limited" },
      { label: "Equipment / asset maintenance (CMMS)", landscapt: "Included (Equipt)", competitor: "Not offered" },
      { label: "Additional users", landscapt: "Included in seat count", competitor: "Billed per additional user" },
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
    ],
    considerations: [
      "Built primarily around construction/install workflows, less depth on recurring maintenance CRM",
      "No native equipment/asset maintenance system",
      "Pricing scales with office + crew license counts",
    ],
    pricingNote: "Plans have historically started around $297/mo for a small office+crew bundle, scaling up for larger teams — confirm current pricing directly with LMN.",
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
      "Drag-and-drop recurring scheduling built for commercial contract volume",
    ],
    considerations: [
      "Priced and built for contractors above $1M in annual revenue — heavy for smaller operations",
      "Acquired by ServiceTitan in 2023, shifting long-term product direction",
      "No dedicated equipment/fleet maintenance (CMMS) module",
    ],
    pricingNote: "Historically priced in the $300–500+/user/month range as a single license fee model — confirm current pricing directly with Aspire.",
    switchReasons: [
      {
        title: "Commercial-grade without the $1M floor",
        body: "The same estimating rigor and purchasing controls, without a pricing model built around enterprise contractors only.",
      },
      {
        title: "Equipment maintenance built in, not bolted on",
        body: "Equipt handles preventive maintenance, work orders, and parts inventory for the fleet Aspire only tracks financially.",
      },
      {
        title: "One vendor table across both products",
        body: "The same vendors used for landscape materials also supply CMMS parts — no duplicate vendor management between systems.",
      },
    ],
    comparisonRows: [
      { label: "Target company size", landscapt: "Any size", competitor: "$1M+ commercial contractors" },
      { label: "Purchase orders & inventory", landscapt: "Included", competitor: "Included" },
      { label: "Real-time reporting", landscapt: "Included", competitor: "Included" },
      { label: "Equipment / asset maintenance (CMMS)", landscapt: "Included (Equipt)", competitor: "Not offered" },
      { label: "Licensing model", landscapt: "Per-seat", competitor: "Per-user, premium tier" },
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
    ],
    considerations: [
      "Recently rebranded (from Copilot CRM) — a newer product identity with a shorter track record under the new name",
      "Price book and chemical/fertilization features are still on the near-term roadmap rather than fully built out",
      "No dedicated equipment/fleet maintenance (CMMS) module",
    ],
    pricingNote: "Public pricing wasn't consistently available at the time of writing — confirm current plans directly with Homeworks.",
    switchReasons: [
      {
        title: "Built past the $3M ceiling too",
        body: "The same platform scales from a first hire to a multi-crew operation, budget engine and job costing included, not a tier you outgrow.",
      },
      {
        title: "Equipment maintenance already built",
        body: "Equipt's preventive maintenance, work orders, and parts inventory are live today, not on a future roadmap.",
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
      { label: "Equipment / asset maintenance (CMMS)", landscapt: "Included (Equipt)", competitor: "Not offered" },
      { label: "Product track record under current name", landscapt: "—", competitor: "Recently rebranded from Copilot CRM" },
    ],
  },
];

export function getCompetitor(slug: string): Competitor | undefined {
  return COMPETITORS.find((c) => c.slug === slug);
}
