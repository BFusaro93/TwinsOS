export type Product = "equipt" | "landscapt";

export const PRODUCTS: { product: Product; label: string }[] = [
  { product: "equipt", label: "Equipt" },
  { product: "landscapt", label: "Landscapt" },
];

export function isProduct(value: string): value is Product {
  return PRODUCTS.some((p) => p.product === value);
}

export const BILLABLE_PLANS = [
  { plan: "starter", label: "Starter" },
  { plan: "growth", label: "Growth" },
  { plan: "enterprise", label: "Enterprise" },
] as const;

export type BillablePlan = (typeof BILLABLE_PLANS)[number]["plan"];

export function isBillablePlan(value: string): value is BillablePlan {
  return BILLABLE_PLANS.some((p) => p.plan === value);
}

// Env var name for a given product+plan, e.g. STRIPE_PRICE_EQUIPT_STARTER.
function envVarFor(product: Product, plan: BillablePlan): string {
  return `STRIPE_PRICE_${product.toUpperCase()}_${plan.toUpperCase()}`;
}

export function getPriceIdForPlan(product: Product, plan: BillablePlan): string | null {
  return process.env[envVarFor(product, plan)] ?? null;
}

export function getPlanForPriceId(product: Product, priceId: string): BillablePlan | null {
  const entry = BILLABLE_PLANS.find((p) => process.env[envVarFor(product, p.plan)] === priceId);
  return entry?.plan ?? null;
}

// Looks up which product a price id belongs to, for webhook events that only
// carry a price id (no subscription metadata yet, e.g. legacy subscriptions).
export function getProductForPriceId(priceId: string): Product | null {
  for (const { product } of PRODUCTS) {
    for (const { plan } of BILLABLE_PLANS) {
      if (process.env[envVarFor(product, plan)] === priceId) return product;
    }
  }
  return null;
}
