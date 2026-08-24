import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { achEnabledForAccount } from "@/lib/stripe/connect";
import {
  computeProcessingFee,
  encodeAllocations,
  MAX_ALLOCATION_METADATA_LENGTH,
} from "@/lib/stripe/crm-payments";
import { chargeIdempotencyKey } from "@/lib/stripe/idempotency";

const CreateIntentSchema = z.object({
  clientId: z.string().uuid(),
  allocations: z.array(z.object({ invoiceId: z.string().uuid(), amountCents: z.number().int().positive() })).min(1),
  waiveFee: z.boolean().optional(),
  overrideFeeCents: z.number().int().min(0).optional(),
  paymentMethod: z.enum(["card", "us_bank_account"]).default("card"),
});

/** One-time card/ACH charge split across multiple invoices for a single client, entered fresh
 * (no saved method) — mirrors create-intent/route.ts's single-invoice version, but the metadata
 * carries an encoded allocation list instead of one invoice_id so the webhook can apply the
 * charge across all of them, exactly like a manually-recorded multi-invoice payment. */
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
  const parsed = CreateIntentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { clientId, allocations, waiveFee, overrideFeeCents, paymentMethod } = parsed.data;

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .single();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

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
      "cc_processing_fee_enabled, cc_processing_fee_bps, cc_processing_fee_threshold_cents, stripe_connect_account_id, stripe_connect_charges_enabled, ach_payments_enabled"
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

  const stripe = getStripe();

  if (paymentMethod === "us_bank_account") {
    if (!org.ach_payments_enabled || !(await achEnabledForAccount(stripe, org.stripe_connect_account_id))) {
      return NextResponse.json({ error: "ACH payments aren't enabled — turn them on in Settings first." }, { status: 400 });
    }
  }

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
          waiveFee ?? false,
          overrideFeeCents
        )
      : { feeCents: 0, totalChargeCents: balanceCents };

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: totalChargeCents,
      currency: "usd",
      payment_method_types: [paymentMethod],
      metadata: {
        source: "crm_invoice_multi",
        org_id: profile.org_id,
        client_id: clientId,
        allocations: encoded,
        fee_cents: String(feeCents),
      },
    },
    {
      stripeAccount: org.stripe_connect_account_id,
      idempotencyKey: chargeIdempotencyKey(["crm_invoice_multi", clientId, encoded, totalChargeCents, paymentMethod]),
    }
  );

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    connectedAccountId: org.stripe_connect_account_id,
    balanceCents,
    feeCents,
    totalChargeCents,
  });
}
