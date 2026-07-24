import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { getPriceIdForPlan, isBillablePlan } from "@/lib/stripe/plans";

const CheckoutSessionSchema = z.object({
  plan: z.string().refine(isBillablePlan, { message: "Unknown plan" }),
});

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing is not configured yet" }, { status: 400 });
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
    return NextResponse.json({ error: "Only admins can manage billing" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CheckoutSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const priceId = getPriceIdForPlan(parsed.data.plan);
  if (!priceId) {
    return NextResponse.json({ error: `No Stripe price configured for plan "${parsed.data.plan}"` }, { status: 400 });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, stripe_customer_id")
    .eq("id", profile.org_id)
    .single();
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const stripe = getStripe();

  let stripeCustomerId = org.stripe_customer_id;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: org.name,
      metadata: { org_id: org.id },
    });
    stripeCustomerId = customer.id;

    const serviceClient = createServiceClient();
    const { error: updateError } = await serviceClient
      .from("organizations")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", org.id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  const origin = new URL(request.url).origin;

  const session = await stripe.checkout.sessions.create({
    ui_mode: "embedded_page",
    mode: "subscription",
    customer: stripeCustomerId,
    client_reference_id: org.id,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { metadata: { org_id: org.id } },
    return_url: `${origin}/settings?tab=subscription&checkout=return&session_id={CHECKOUT_SESSION_ID}`,
  });

  return NextResponse.json({ clientSecret: session.client_secret });
}
