import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import {
  computeProcessingFee,
  decodeAllocations,
  encodeAllocations,
  MAX_ALLOCATION_METADATA_LENGTH,
} from "@/lib/stripe/crm-payments";
import { chargeIdempotencyKey } from "@/lib/stripe/idempotency";
import { stripeErrorResponse } from "@/lib/stripe/errors";
import { logger } from "@/lib/logger";

const log = logger.child("stripe multi-invoice charge");

const ChargeSchema = z.object({
  clientId: z.string().uuid(),
  allocations: z.array(z.object({ invoiceId: z.string().uuid(), amountCents: z.number().int().positive() })).min(1),
});

// See the duplicate-charge guard below: how far back to look for an
// already-in-flight/succeeded PaymentIntent covering any of the same
// invoices, and which statuses count as "still real money that might land"
// rather than a dead end the staff member is free to retry past.
const RECENT_CHARGE_WINDOW_SECONDS = 120;
const BLOCKING_PAYMENT_INTENT_STATUSES = new Set([
  "succeeded",
  "processing",
  "requires_capture",
  "requires_action",
  "requires_confirmation",
]);

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

  // This actually moves the client's money — gate it behind the same
  // permission that gates recording/modifying payments in the Invoices UI
  // (admins always pass — see has_settings_permission()'s own definition).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: canCharge } = await (supabase.rpc as any)("has_settings_permission", {
    p_key: "acct_add_modify_payments",
  });
  if (!canCharge) {
    return NextResponse.json({ error: "You don't have permission to charge payment methods" }, { status: 403 });
  }

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

  // chargeIdempotencyKey only collapses attempts within the same 10-second
  // bucket — a double-submit further apart than that (two staff, or one
  // staff in two tabs) would otherwise sail through as two genuinely
  // separate, real charges. Ask Stripe directly whether a PaymentIntent
  // covering any of these same invoices already exists from the last few
  // minutes and hasn't definitively failed, and refuse to charge again if so.
  try {
    const recentIntents = await stripe.paymentIntents.list(
      {
        customer: client.stripe_customer_id,
        created: { gte: Math.floor(Date.now() / 1000) - RECENT_CHARGE_WINDOW_SECONDS },
        limit: 20,
      },
      { stripeAccount: org.stripe_connect_account_id }
    );
    const duplicate = recentIntents.data.find((pi) => {
      if (!BLOCKING_PAYMENT_INTENT_STATUSES.has(pi.status)) return false;
      if (pi.metadata?.source !== "crm_invoice_multi" || !pi.metadata?.allocations) return false;
      const priorInvoiceIds = decodeAllocations(pi.metadata.allocations).map((a) => a.invoiceId);
      return priorInvoiceIds.some((id) => invoiceIds.includes(id));
    });
    if (duplicate) {
      return NextResponse.json(
        {
          error:
            "A charge was already just submitted for one or more of these invoices. Please wait a moment or check Payment History before retrying.",
        },
        { status: 409 }
      );
    }
  } catch (err) {
    // Fail open on the lookup itself (a Stripe API hiccup shouldn't block a
    // legitimate charge) — chargeIdempotencyKey's 10-second window still
    // catches an exact-duplicate retry; this is the belt-and-suspenders
    // layer for a slower double-submit.
    log.error("failed to check for a recent duplicate charge", { error: err, clientId });
  }

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
      {
        stripeAccount: org.stripe_connect_account_id,
        idempotencyKey: chargeIdempotencyKey(["crm_invoice_multi_autopay", clientId, encoded, totalChargeCents]),
      }
    );

    return NextResponse.json({
      status: paymentIntent.status,
      balanceCents,
      feeCents,
      totalChargeCents,
    });
  } catch (err) {
    return stripeErrorResponse(err, log, { clientId });
  }
}
