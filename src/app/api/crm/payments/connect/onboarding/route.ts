import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { syncConnectStatusFromStripe } from "@/lib/stripe/connect";
import { logger } from "@/lib/logger";

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
  if (org.stripe_connect_account_id) {
    const synced = await syncConnectStatusFromStripe(stripe, org.id, org.stripe_connect_account_id);
    if (synced.chargesEnabled) {
      // Already fully onboarded — send them to their own Stripe Standard
      // dashboard instead of re-running the onboarding flow.
      const loginLink = await stripe.accounts.createLoginLink(org.stripe_connect_account_id);
      return NextResponse.json({ url: loginLink.url });
    }
  }

  let accountId = org.stripe_connect_account_id;
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
  }

  const origin = new URL(request.url).origin;

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${origin}/crm/settings?tab=accounting&connect=refresh`,
    return_url: `${origin}/crm/settings?tab=accounting&connect=return`,
  });

  return NextResponse.json({ url: accountLink.url });
}
