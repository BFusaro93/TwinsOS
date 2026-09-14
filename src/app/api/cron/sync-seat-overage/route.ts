import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { syncSeatOverage } from "@/lib/stripe/seat-sync";
import { logger } from "@/lib/logger";

const log = logger.child("cron sync-seat-overage");

// Subscription statuses worth reconciling — matches the "still paying or
// trying to" set the billing webhook treats as active, so an org mid-retry
// (past_due) still gets its overage kept current rather than frozen.
const SYNCABLE_STATUSES = ["active", "trialing", "past_due"];

/**
 * GET /api/cron/sync-seat-overage — called daily by Vercel Cron.
 *
 * The billing webhook keeps an org's seat-overage line item in sync on every
 * subscription event, but nothing about adding/reactivating a user fires a
 * Stripe event — an org that invites a 6th employee on a 5-seat plan won't
 * get billed for it until something else touches their subscription. This
 * cron is the safety net: reconcile every subscribed org's overage item
 * against its actual seat count once a day.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ skipped: "Stripe not configured" });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const stripe = getStripe();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orgs, error } = await (supabase as any)
    .from("organizations")
    .select("id, plan, stripe_subscription_id, seats_included_override, seat_overage_cents_override")
    .not("stripe_subscription_id", "is", null)
    .in("stripe_subscription_status", SYNCABLE_STATUSES);
  if (error) {
    log.error("failed to list subscribed orgs", { error });
    return NextResponse.json({ error: "Failed to list subscribed orgs" }, { status: 500 });
  }

  let synced = 0;
  let failed = 0;
  for (const org of orgs ?? []) {
    try {
      // Crew accounts are shared field-clock-in logins, not real named seats —
      // see the matching comment in use-billing.ts.
      const { count: seatsUsed } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("org_id", org.id)
        .neq("status", "inactive")
        .neq("role", "crew");

      const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
      await syncSeatOverage(stripe, subscription, org.plan, seatsUsed ?? 0, {
        seatsIncludedOverride: org.seats_included_override,
        seatOverageCentsOverride: org.seat_overage_cents_override,
      });
      synced++;
    } catch (err) {
      failed++;
      log.error("failed to sync seat overage for org", { error: err, orgId: org.id });
    }
  }

  return NextResponse.json({ synced, failed });
}
