import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { BILLABLE_PLANS, getPriceIdForPlan } from "@/lib/stripe/plans";
import { ADDON_CATALOG, getPriceIdForAddon } from "@/lib/stripe/addons";
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
  modules: string[];
  seatsIncluded: number;
  seatOverageCents: number;
  bundledAddons: string[];
}

export interface BillingAddonInfo {
  key: string;
  label: string;
  configured: boolean;
  priceId: string | null;
  amountCents: number | null;
  currency: string | null;
  interval: string | null;
  metered: boolean;
  modules: string[];
}

// Public endpoint — no auth required. Prices/plan metadata aren't sensitive,
// and the signup page's plan picker needs to show real pricing before an
// account (and session) exists.
export async function GET() {
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
        modules: p.modules,
        seatsIncluded: p.seatsIncluded,
        seatOverageCents: p.seatOverageCents,
        bundledAddons: p.bundledAddons,
      })),
      addons: ADDON_CATALOG.map((a) => ({
        key: a.key,
        label: a.label,
        configured: false,
        priceId: null,
        amountCents: null,
        currency: null,
        interval: null,
        metered: a.metered,
        modules: a.modules as string[],
      })),
    });
  }

  const stripe = getStripe();

  const plans: BillingPlanInfo[] = await Promise.all(
    BILLABLE_PLANS.map(async (p) => {
      const priceId = getPriceIdForPlan(p.plan);
      const base = {
        plan: p.plan,
        label: p.label,
        modules: p.modules as string[],
        seatsIncluded: p.seatsIncluded,
        seatOverageCents: p.seatOverageCents,
        bundledAddons: p.bundledAddons as string[],
      };
      if (!priceId) {
        return { ...base, configured: false, priceId: null, amountCents: null, currency: null, interval: null };
      }
      try {
        const price = await stripe.prices.retrieve(priceId);
        return {
          ...base,
          configured: true,
          priceId,
          amountCents: price.unit_amount,
          currency: price.currency,
          interval: price.recurring?.interval ?? null,
        };
      } catch (err) {
        log.error("failed to retrieve price for plan", { error: err, plan: p.plan, priceId });
        return { ...base, configured: false, priceId: null, amountCents: null, currency: null, interval: null };
      }
    })
  );

  const addons: BillingAddonInfo[] = await Promise.all(
    ADDON_CATALOG.map(async (a) => {
      const priceId = getPriceIdForAddon(a.key);
      const base = { key: a.key, label: a.label, metered: a.metered, modules: a.modules as string[] };
      if (!priceId) {
        return { ...base, configured: false, priceId: null, amountCents: null, currency: null, interval: null };
      }
      try {
        const price = await stripe.prices.retrieve(priceId);
        return {
          ...base,
          configured: true,
          priceId,
          amountCents: price.unit_amount,
          currency: price.currency,
          interval: price.recurring?.interval ?? null,
        };
      } catch (err) {
        log.error("failed to retrieve price for addon", { error: err, addon: a.key, priceId });
        return { ...base, configured: false, priceId: null, amountCents: null, currency: null, interval: null };
      }
    })
  );

  return NextResponse.json({ stripeEnabled: true, plans, addons });
}
