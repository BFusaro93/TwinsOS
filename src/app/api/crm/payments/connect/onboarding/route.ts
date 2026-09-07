import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { syncConnectStatusFromStripe } from "@/lib/stripe/connect";
import { logger } from "@/lib/logger";
import { stripeErrorResponse } from "@/lib/stripe/errors";

const log = logger.child("stripe connect onboarding");

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Card payments are not configured yet" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  if (profile.role !== "admin") {
    return NextResponse.json({ error: "Only admins can manage payment settings" }, { status: 403 });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, stripe_connect_account_id")
    .eq("id", profile.org_id)
    .single();
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const stripe = getStripe();
  const serviceClient = createServiceClient();

  // Check Stripe directly rather than trusting only the webhook-cached DB
  // columns — some Stripe workspaces only emit newer v2 Accounts API events,
  // which this app's webhook doesn't listen for, leaving the cache stale.
  try {
  if (org.stripe_connect_account_id) {
    const synced = await syncConnectStatusFromStripe(stripe, org.id, org.stripe_connect_account_id);
    if (synced.chargesEnabled) {
      // Already fully onboarded. Standard accounts are the connected merchant's own,
      // independent Stripe account — createLoginLink() is an Express-only API and
      // always throws "does not have access to the Express Dashboard" for these, so
      // there's no platform-generated SSO link. They just log into their own
      // dashboard.stripe.com with their own Stripe credentials.
      return NextResponse.json({ url: "https://dashboard.stripe.com" });
    }
  }

  const previousAccountId = org.stripe_connect_account_id;
  let accountId = previousAccountId;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "standard",
      email: user.email,
      business_profile: { name: org.name },
      metadata: { org_id: org.id },
    });
    accountId = account.id;

    const { error: updateError } = await serviceClient
      .from("organizations")
      .update({ stripe_connect_account_id: accountId, stripe_connect_status: "pending" })
      .eq("id", org.id);
    if (updateError) {
      log.error("failed to save connect account id", { error: updateError, orgId: org.id });
      return NextResponse.json({ error: "Failed to save Stripe account" }, { status: 500 });
    }

    // Customers and PaymentMethods live on the connected account, not the
    // platform account (see src/lib/stripe/saved-payment-methods.ts) — a
    // reconnect (this org previously had a DIFFERENT connected account) means
    // every client's saved card/bank reference now points at an account that
    // no longer exists for this org. Clear them so the UI stops showing a
    // "valid" saved method that will fail with "No such PaymentMethod" the
    // next time anyone tries to charge it, and so autopay doesn't silently
    // keep trying. A first-time connect (previousAccountId is null) has
    // nothing stale to clear.
    if (previousAccountId) {
      const { error: clearError } = await serviceClient
        .from("clients")
        .update({
          stripe_customer_id: null,
          saved_payment_method_id: null,
          saved_payment_method_type: null,
          saved_payment_method_summary: null,
          autopay_enabled: false,
        })
        .eq("org_id", org.id);
      if (clearError) {
        log.error("failed to clear stale saved payment methods after reconnect", {
          error: clearError,
          orgId: org.id,
          previousAccountId,
        });
      }
    }
  }

  const origin = new URL(request.url).origin;

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${origin}/crm/settings?tab=accounting&connect=refresh`,
    return_url: `${origin}/crm/settings?tab=accounting&connect=return`,
  });

  return NextResponse.json({ url: accountLink.url });
  } catch (err) {
    // e.g. the platform key and this connected account are in different
    // Stripe modes (live key, test-mode account) — surface Stripe's message
    // instead of an empty 500 the settings page can't parse.
    return stripeErrorResponse(err, log, { orgId: org.id, connectedAccountId: org.stripe_connect_account_id });
  }
}
