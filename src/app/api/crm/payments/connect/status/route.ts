import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripeForOrg, isStripeConfigured, isStripeTestConfigured, resolvedStripeMode } from "@/lib/stripe/server";
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

  // stripe_connect_livemode isn't in the generated Supabase types yet (added
  // by a migration this session wrote but did not apply/regenerate types for).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (supabase.from("organizations") as any)
    .select(
      "id, stripe_connect_account_id, stripe_connect_status, stripe_connect_charges_enabled, stripe_connect_payouts_enabled, stripe_connect_livemode"
    )
    .eq("id", profile.org_id)
    .single();
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  if (!org.stripe_connect_account_id) {
    return NextResponse.json({ status: "not_started", chargesEnabled: false, payoutsEnabled: false });
  }

  if (!isStripeConfigured() && !isStripeTestConfigured()) {
    return NextResponse.json({
      status: org.stripe_connect_status,
      chargesEnabled: org.stripe_connect_charges_enabled,
      payoutsEnabled: org.stripe_connect_payouts_enabled,
      livemode: org.stripe_connect_livemode,
    });
  }

  try {
    const stripe = getStripeForOrg(org.stripe_connect_livemode);
    const synced = await syncConnectStatusFromStripe(
      stripe,
      org.id,
      org.stripe_connect_account_id,
      resolvedStripeMode(org.stripe_connect_livemode)
    );
    return NextResponse.json(synced);
  } catch (err) {
    log.error("failed to sync connect status from Stripe, falling back to cached value", { error: err, orgId: org.id });
    return NextResponse.json({
      status: org.stripe_connect_status,
      chargesEnabled: org.stripe_connect_charges_enabled,
      payoutsEnabled: org.stripe_connect_payouts_enabled,
      livemode: org.stripe_connect_livemode,
    });
  }
}
