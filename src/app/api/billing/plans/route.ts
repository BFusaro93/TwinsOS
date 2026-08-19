import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { BILLABLE_PLANS, getPriceIdForPlan, isProduct } from "@/lib/stripe/plans";
import { logger } from "@/lib/logger";

const log = logger.child("stripe billing plans");

export interface BillingPlanInfo {
  plan: string;
  label: string;
  configured: boolean;
  priceId: string | null;
  amountCents: number | null;
  currency: string | null;
  interval: string | null;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const productParam = new URL(request.url).searchParams.get("product");
  if (!productParam || !isProduct(productParam)) {
    return NextResponse.json({ error: "product must be 'equipt' or 'landscapt'" }, { status: 400 });
  }
  const product = productParam;

  if (!isStripeConfigured()) {
    return NextResponse.json({
      stripeEnabled: false,
      plans: BILLABLE_PLANS.map((p) => ({
        plan: p.plan,
        label: p.label,
        configured: false,
        priceId: null,
        amountCents: null,
        currency: null,
        interval: null,
      })),
    });
  }

  const stripe = getStripe();

  const plans: BillingPlanInfo[] = await Promise.all(
    BILLABLE_PLANS.map(async (p) => {
      const priceId = getPriceIdForPlan(product, p.plan);
      if (!priceId) {
        return { plan: p.plan, label: p.label, configured: false, priceId: null, amountCents: null, currency: null, interval: null };
      }
      try {
        const price = await stripe.prices.retrieve(priceId);
        return {
          plan: p.plan,
          label: p.label,
          configured: true,
          priceId,
          amountCents: price.unit_amount,
          currency: price.currency,
          interval: price.recurring?.interval ?? null,
        };
      } catch (err) {
        log.error("failed to retrieve price for plan", { error: err, product, plan: p.plan, priceId });
        return { plan: p.plan, label: p.label, configured: false, priceId: null, amountCents: null, currency: null, interval: null };
      }
    })
  );

  return NextResponse.json({ stripeEnabled: true, plans });
}
