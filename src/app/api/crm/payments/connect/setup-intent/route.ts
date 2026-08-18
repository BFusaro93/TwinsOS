import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { getOrCreateStripeCustomer, summarizePaymentMethod } from "@/lib/stripe/saved-payment-methods";
import { logger } from "@/lib/logger";

const log = logger.child("stripe saved payment method (crm)");

const CreateSchema = z.object({
  clientId: z.string().uuid(),
  paymentMethod: z.enum(["card", "us_bank_account"]).default("card"),
});

/** Starts saving a card/bank account on file for a client, for autopay. Mirrors the
 * one-off charge flow in create-intent/route.ts but creates a SetupIntent (no charge)
 * against a Stripe Customer on the org's connected account. */
export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Card payments are not configured yet" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { clientId, paymentMethod } = parsed.data;

  const { data: client } = await supabase
    .from("clients")
    .select("id, display_name, primary_email, stripe_customer_id")
    .eq("id", clientId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .single();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const { data: org } = await supabase
    .from("organizations")
    .select("stripe_connect_account_id, stripe_connect_charges_enabled")
    .eq("id", profile.org_id)
    .single();
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  if (!org.stripe_connect_account_id || !org.stripe_connect_charges_enabled) {
    return NextResponse.json(
      { error: "Connect your Stripe account in Settings before saving payment methods." },
      { status: 400 }
    );
  }

  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomer(
    stripe,
    org.stripe_connect_account_id,
    client.stripe_customer_id,
    client
  );

  if (customerId !== client.stripe_customer_id) {
    const serviceClient = createServiceClient();
    const { error } = await serviceClient.from("clients").update({ stripe_customer_id: customerId }).eq("id", clientId);
    if (error) log.error("failed to save stripe customer id", { error, clientId });
  }

  const setupIntent = await stripe.setupIntents.create(
    {
      customer: customerId,
      payment_method_types: [paymentMethod],
      usage: "off_session",
      metadata: { client_id: clientId, org_id: profile.org_id },
    },
    { stripeAccount: org.stripe_connect_account_id }
  );

  return NextResponse.json({
    clientSecret: setupIntent.client_secret,
    connectedAccountId: org.stripe_connect_account_id,
  });
}

const SaveSchema = z.object({
  clientId: z.string().uuid(),
  setupIntentId: z.string(),
});

/** After the client confirms the SetupIntent with Stripe.js, this records the resulting
 * payment method on the client so autopay/invoices-to-charge can use it later. */
export async function PUT(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Card payments are not configured yet" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });

  const body = await request.json();
  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { clientId, setupIntentId } = parsed.data;

  const { data: client } = await supabase
    .from("clients")
    .select("id, stripe_customer_id")
    .eq("id", clientId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .single();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const { data: org } = await supabase
    .from("organizations")
    .select("stripe_connect_account_id")
    .eq("id", profile.org_id)
    .single();
  if (!org?.stripe_connect_account_id) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const stripe = getStripe();
  const setupIntent = await stripe.setupIntents.retrieve(
    setupIntentId,
    { expand: ["payment_method"] },
    { stripeAccount: org.stripe_connect_account_id }
  );

  if (setupIntent.status !== "succeeded" || !setupIntent.payment_method || typeof setupIntent.payment_method === "string") {
    return NextResponse.json({ error: "Payment method setup did not complete" }, { status: 400 });
  }
  // A SetupIntent belongs to a specific Customer — confirm it's the one we created for this
  // client before trusting it, the same way the Connect webhook verifies event ownership.
  if (setupIntent.customer !== client.stripe_customer_id) {
    log.error("setup intent customer does not match client's stripe customer", {
      clientId,
      setupIntentCustomer: setupIntent.customer,
    });
    return NextResponse.json({ error: "Payment method does not belong to this client" }, { status: 403 });
  }

  const pm = setupIntent.payment_method;
  const summary = summarizePaymentMethod(pm);

  const serviceClient = createServiceClient();
  const { error } = await serviceClient
    .from("clients")
    .update({
      saved_payment_method_id: pm.id,
      saved_payment_method_type: pm.type,
      saved_payment_method_summary: summary,
    })
    .eq("id", clientId);
  if (error) {
    log.error("failed to save payment method", { error, clientId });
    return NextResponse.json({ error: "Failed to save payment method" }, { status: 500 });
  }

  return NextResponse.json({ type: pm.type, summary });
}
