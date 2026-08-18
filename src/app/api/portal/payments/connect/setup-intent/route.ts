import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { getOrCreateStripeCustomer, summarizePaymentMethod } from "@/lib/stripe/saved-payment-methods";
import { logger } from "@/lib/logger";

const log = logger.child("stripe saved payment method (portal)");

const CreateSchema = z.object({
  paymentMethod: z.enum(["card", "us_bank_account"]).default("card"),
});

/** Lets a client save their own card/bank account on file from the self-service portal —
 * same SetupIntent flow as the CRM staff version, scoped to the authenticated portal client. */
export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Card payments are not configured yet" }, { status: 400 });
  }

  const ctx = await getPortalContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { paymentMethod } = parsed.data;

  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("id, display_name, primary_email, stripe_customer_id")
    .eq("id", ctx.clientId)
    .eq("org_id", ctx.orgId)
    .is("deleted_at", null)
    .single();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const { data: org } = await supabase
    .from("organizations")
    .select("stripe_connect_account_id, stripe_connect_charges_enabled")
    .eq("id", ctx.orgId)
    .single();
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  if (!org.stripe_connect_account_id || !org.stripe_connect_charges_enabled) {
    return NextResponse.json({ error: "Online payments aren't available yet." }, { status: 400 });
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
    const { error } = await serviceClient.from("clients").update({ stripe_customer_id: customerId }).eq("id", client.id);
    if (error) log.error("failed to save stripe customer id", { error, clientId: client.id });
  }

  const setupIntent = await stripe.setupIntents.create(
    {
      customer: customerId,
      payment_method_types: [paymentMethod],
      usage: "off_session",
      metadata: { client_id: client.id, org_id: ctx.orgId },
    },
    { stripeAccount: org.stripe_connect_account_id }
  );

  return NextResponse.json({
    clientSecret: setupIntent.client_secret,
    connectedAccountId: org.stripe_connect_account_id,
  });
}

const SaveSchema = z.object({ setupIntentId: z.string(), enableAutopay: z.boolean().default(true) });

export async function PUT(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Card payments are not configured yet" }, { status: 400 });
  }

  const ctx = await getPortalContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { setupIntentId, enableAutopay } = parsed.data;

  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("id, stripe_customer_id")
    .eq("id", ctx.clientId)
    .eq("org_id", ctx.orgId)
    .is("deleted_at", null)
    .single();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const { data: org } = await supabase
    .from("organizations")
    .select("stripe_connect_account_id")
    .eq("id", ctx.orgId)
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
  if (setupIntent.customer !== client.stripe_customer_id) {
    log.error("setup intent customer does not match client's stripe customer", {
      clientId: client.id,
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
      autopay_enabled: enableAutopay,
    })
    .eq("id", client.id);
  if (error) {
    log.error("failed to save payment method", { error, clientId: client.id });
    return NextResponse.json({ error: "Failed to save payment method" }, { status: 500 });
  }

  return NextResponse.json({ type: pm.type, summary, autopayEnabled: enableAutopay });
}
