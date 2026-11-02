import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStripeForOrg, isStripeConfigured, isStripeTestConfigured } from "@/lib/stripe/server";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { logger } from "@/lib/logger";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import { createOrgOutboundMutedResolver } from "@/lib/orgs/org-canceled";

const log = logger.child("card-expiry-notify cron");

export const maxDuration = 300;
/** Stop cleanly before the function limit; tomorrow's run starts from a different org. */
const TIME_BUDGET_MS = 270_000;

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

  if (!isStripeConfigured() && !isStripeTestConfigured()) {
    return NextResponse.json({ checked: 0, fired: 0 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  type CardClientRow = {
    id: string;
    org_id: string;
    saved_payment_method_id: string;
    organizations: { stripe_connect_account_id: string | null; stripe_connect_livemode: boolean | null } | null;
  };
  // Platform-wide scan — page past PostgREST's 1000-row cap, or every
  // card-on-file client beyond the first page never got an expiry reminder.
  // Ordered by id so the pages split stably.
  let clients: CardClientRow[];
  try {
    clients = await fetchAllRows<CardClientRow>(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("clients")
        .select("id, org_id, saved_payment_method_id, organizations(stripe_connect_account_id, stripe_connect_livemode)")
        .eq("saved_payment_method_type", "card")
        .not("saved_payment_method_id", "is", null)
        .is("deleted_at", null)
        .order("id", { ascending: true })
    );
  } catch (err) {
    log.error("failed to load card-on-file clients", { error: err });
    return NextResponse.json({ error: "Failed to load clients" }, { status: 500 });
  }

  const now = new Date();
  const thisMonth = { month: now.getMonth() + 1, year: now.getFullYear() };
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonth = { month: nextMonthDate.getMonth() + 1, year: nextMonthDate.getFullYear() };

  let checked = 0;
  let fired = 0;
  let stoppedEarly = false;
  const startedAt = Date.now();
  const orgCanceled = createOrgOutboundMutedResolver(supabase);

  // Group by org and skip orgs with no live credit_card_about_to_expire trigger before any
  // Stripe call: one retrieve per card-on-file client across every org, one at a time, ran
  // past the function limit and the same id-ordered tail was never checked.
  const byOrg = new Map<string, CardClientRow[]>();
  for (const client of clients) {
    const list = byOrg.get(client.org_id);
    if (list) list.push(client);
    else byOrg.set(client.org_id, [client]);
  }
  // Start at a different org each day so a slow org can't starve the same orgs every run.
  const orgIds = [...byOrg.keys()].sort();
  const offset = orgIds.length ? Math.floor(Date.now() / 86_400_000) % orgIds.length : 0;
  const orderedOrgIds = [...orgIds.slice(offset), ...orgIds.slice(0, offset)];

  outer: for (const orgId of orderedOrgIds) {
    if (await orgCanceled(orgId)) continue; // inactive or demo orgs get no automated reminders
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: triggerCount } = await (supabase as any)
      .from("crm_sequence_triggers")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("trigger_type", "credit_card_about_to_expire");
    if (!triggerCount) continue;

    for (const client of byOrg.get(orgId) ?? []) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        stoppedEarly = true;
        break outer;
      }
      const connectAccountId = client.organizations?.stripe_connect_account_id;
      if (!connectAccountId) continue;
      checked++;

      try {
        const stripe = getStripeForOrg(client.organizations?.stripe_connect_livemode);
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
  }
  if (stoppedEarly) log.warn("card-expiry sweep stopped at its time budget; the rest is checked tomorrow", { checked, fired });

  return NextResponse.json({ checked, fired, stoppedEarly });
}
