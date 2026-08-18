import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { syncConnectStatusFromStripe } from "@/lib/stripe/connect";
import { logger } from "@/lib/logger";

const log = logger.child("stripe connect status");

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });

  const { data: org } = await supabase
    .from("organizations")
    .select("id, stripe_connect_account_id, stripe_connect_status, stripe_connect_charges_enabled, stripe_connect_payouts_enabled")
    .eq("id", profile.org_id)
    .single();
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  if (!org.stripe_connect_account_id) {
    return NextResponse.json({ status: "not_started", chargesEnabled: false, payoutsEnabled: false });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({
      status: org.stripe_connect_status,
      chargesEnabled: org.stripe_connect_charges_enabled,
      payoutsEnabled: org.stripe_connect_payouts_enabled,
    });
  }

  try {
    const synced = await syncConnectStatusFromStripe(getStripe(), org.id, org.stripe_connect_account_id);
    return NextResponse.json(synced);
  } catch (err) {
    log.error("failed to sync connect status from Stripe, falling back to cached value", { error: err, orgId: org.id });
    return NextResponse.json({
      status: org.stripe_connect_status,
      chargesEnabled: org.stripe_connect_charges_enabled,
      payoutsEnabled: org.stripe_connect_payouts_enabled,
    });
  }
}
