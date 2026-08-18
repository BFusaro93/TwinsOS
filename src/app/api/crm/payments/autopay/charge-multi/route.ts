import { NextResponse } from "next/server";
import { z } from "zod";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import {
  computeProcessingFee,
  encodeAllocations,
  MAX_ALLOCATION_METADATA_LENGTH,
} from "@/lib/stripe/crm-payments";
import { logger } from "@/lib/logger";

const log = logger.child("stripe multi-invoice charge");

const ChargeSchema = z.object({
  clientId: z.string().uuid(),
  allocations: z.array(z.object({ invoiceId: z.string().uuid(), amountCents: z.number().int().positive() })).min(1),
});

/** Charges a client's saved payment method once for a combined total split across multiple
 * invoices — the saved-method counterpart to create-intent-multi/route.ts. Reuses the same
 * off-session pattern as autopay/charge/route.ts, just for more than one invoice at a time. */
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
  const parsed = ChargeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { clientId, allocations } = parsed.data;

  const { data: client } = await supabase
    .from("clients")
    .select("id, stripe_customer_id, saved_payment_method_id, saved_payment_method_type")
    .eq("id", clientId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .single();
  if (!client?.stripe_customer_id || !client.saved_payment_method_id || !client.saved_payment_method_type) {
    return NextResponse.json({ error: "This client has no saved payment method on file" }, { status: 400 });
  }

  const invoiceIds = allocations.map((a) => a.invoiceId);
  const { data: invoices } = await supabase
    .from("crm_invoices")
    .select("id, balance_cents")
    .in("id", invoiceIds)
    .eq("client_id", clientId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null);
  if (!invoices || invoices.length !== invoiceIds.length) {
    return NextResponse.json({ error: "One or more invoices were not found for this client" }, { status: 404 });
  }
  const balanceByInvoice = new Map(invoices.map((i) => [i.id, i.balance_cents]));
  for (const a of allocations) {
    const balance = balanceByInvoice.get(a.invoiceId) ?? 0;
    if (a.amountCents > balance) {
      return NextResponse.json({ error: "An allocation amount exceeds that invoice's balance" }, { status: 400 });
    }
  }

  const encoded = encodeAllocations(allocations);
  if (encoded.length > MAX_ALLOCATION_METADATA_LENGTH) {
    return NextResponse.json(
      { error: "Too many invoices selected for a single charge — split into two payments" },
      { status: 400 }
    );
  }

  const { data: org } = await supabase
    .from("organizations")
    .select(
      "cc_processing_fee_enabled, cc_processing_fee_bps, cc_processing_fee_threshold_cents, stripe_connect_account_id, stripe_connect_charges_enabled"
    )
    .eq("id", profile.org_id)
    .single();
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  if (!org.stripe_connect_account_id || !org.stripe_connect_charges_enabled) {
    return NextResponse.json(
      { error: "Connect your Stripe account in Settings before accepting card payments." },
      { status: 400 }
    );
  }

  const paymentMethod = client.saved_payment_method_type;
  const balanceCents = allocations.reduce((sum, a) => sum + a.amountCents, 0);
  const { feeCents, totalChargeCents } =
    paymentMethod === "card"
      ? computeProcessingFee(
          {
            ccProcessingFeeEnabled: org.cc_processing_fee_enabled,
            ccProcessingFeeBps: org.cc_processing_fee_bps,
            ccProcessingFeeThresholdCents: org.cc_processing_fee_threshold_cents,
          },
          balanceCents,
          false
        )
      : { feeCents: 0, totalChargeCents: balanceCents };

  const stripe = getStripe();
  try {
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: totalChargeCents,
        currency: "usd",
        customer: client.stripe_customer_id,
        payment_method: client.saved_payment_method_id,
        payment_method_types: [paymentMethod],
        off_session: true,
        confirm: true,
        metadata: {
          source: "crm_invoice_multi",
          org_id: profile.org_id,
          client_id: clientId,
          allocations: encoded,
          fee_cents: String(feeCents),
        },
      },
      { stripeAccount: org.stripe_connect_account_id }
    );

    return NextResponse.json({
      status: paymentIntent.status,
      balanceCents,
      feeCents,
      totalChargeCents,
    });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeCardError) {
      return NextResponse.json(
        { error: err.message || "The saved payment method was declined" },
        { status: 402 }
      );
    }
    log.error("multi-invoice charge failed", { error: err, clientId });
    return NextResponse.json({ error: "Failed to charge the saved payment method" }, { status: 500 });
  }
}
