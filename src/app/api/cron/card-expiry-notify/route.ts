import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { logger } from "@/lib/logger";

const log = logger.child("card-expiry-notify cron");

/**
 * GET /api/cron/card-expiry-notify — called daily by Vercel Cron.
 *
 * Fires the 'credit_card_about_to_expire' automation trigger for every client
 * whose saved card (src/app/api/crm/payments/connect/setup-intent/route.ts)
 * expires this month or next. Unlike the other trigger types, Stripe has no
 * webhook event for "this card is about to expire" — expiration isn't
 * something that happens at a point in time Stripe can push a notification
 * for, so it has to be computed by checking each saved card's exp_month/
 * exp_year against today, the same way contract/estimate expiry triggers
 * (src/app/api/cron/contract-expiry-notify/route.ts) are date-window crons
 * rather than webhook-driven. Cards' exp dates aren't cached locally
 * (saved_payment_method_summary is just a display label, no exp date), so
 * each check is a live Stripe API call.
 *
 * Firing daily for every day a card falls in the window is intentional, not
 * a bug — isEligibleForEnrollment's per-client dedup (already-enrolled clients
 * aren't re-enrolled) is what keeps this from spamming, exactly like
 * contract_about_to_expire's daily 3-day window does today.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ checked: 0, fired: 0 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const stripe = getStripe();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: clients } = await (supabase as any)
    .from("clients")
    .select("id, org_id, saved_payment_method_id, organizations(stripe_connect_account_id)")
    .eq("saved_payment_method_type", "card")
    .not("saved_payment_method_id", "is", null)
    .is("deleted_at", null);

  const now = new Date();
  const thisMonth = { month: now.getMonth() + 1, year: now.getFullYear() };
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonth = { month: nextMonthDate.getMonth() + 1, year: nextMonthDate.getFullYear() };

  let checked = 0;
  let fired = 0;

  for (const client of (clients ?? []) as {
    id: string;
    org_id: string;
    saved_payment_method_id: string;
    organizations: { stripe_connect_account_id: string | null } | null;
  }[]) {
    const connectAccountId = client.organizations?.stripe_connect_account_id;
    if (!connectAccountId) continue;
    checked++;

    try {
      const pm = await stripe.paymentMethods.retrieve(
        client.saved_payment_method_id,
        {},
        { stripeAccount: connectAccountId }
      );
      const card = pm.card;
      if (!card) continue;

      const expiresThisOrNextMonth =
        (card.exp_month === thisMonth.month && card.exp_year === thisMonth.year) ||
        (card.exp_month === nextMonth.month && card.exp_year === nextMonth.year);
      if (!expiresThisOrNextMonth) continue;

      await fireSimpleTrigger(supabase, {
        orgId: client.org_id,
        clientId: client.id,
        triggerType: "credit_card_about_to_expire",
      });
      fired++;
    } catch (err) {
      // A single client's card lookup failing (e.g. detached on Stripe's side
      // since we last synced) shouldn't stop the rest of the sweep.
      log.error("failed to check card expiry", { error: err, clientId: client.id });
    }
  }

  return NextResponse.json({ checked, fired });
}
