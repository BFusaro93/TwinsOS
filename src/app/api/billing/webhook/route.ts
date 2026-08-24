import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { getPlanForPriceId } from "@/lib/stripe/plans";
import { syncSeatOverage } from "@/lib/stripe/seat-sync";
import { logger } from "@/lib/logger";

const log = logger.child("stripe webhook");

// Subscription statuses that mean the org is no longer in good standing and
// should lose paid-plan access — not just the literal "canceled" event.
// unpaid/incomplete_expired/paused all mean Stripe has given up billing this
// subscription (retries exhausted or it was paused), same practical outcome
// as a cancellation. past_due/trialing/active are NOT included — those are
// still-active or still-retrying states, not a final "not paying" outcome.
const DOWNGRADE_STATUSES = new Set(["canceled", "unpaid", "incomplete_expired", "paused"]);

export async function POST(request: Request) {
  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Billing is not configured yet" }, { status: 400 });
  }

  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    log.error("signature verification failed", { error: err });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const subscriptionId = extractSubscriptionId(event);
  const eventCreated = new Date(event.created * 1000).toISOString();

  // ── Idempotency: record this event id before processing, with
  // processed_at left null until processing actually succeeds below. A
  // duplicate delivery hits the PRIMARY KEY constraint — if the existing
  // row's processed_at is already set, this event was genuinely already
  // handled and we skip it; if it's still null, a previous attempt
  // recorded the event but died before finishing (transient failure), so
  // this delivery is allowed to (re)process it rather than being silently
  // swallowed forever. ────────────────────────────────────────────────────
  const { error: dedupeErr } = await db.from("stripe_webhook_events").insert({
    event_id: event.id,
    event_type: event.type,
    subscription_id: subscriptionId,
    event_created: eventCreated,
    processed_at: null,
  });
  if (dedupeErr) {
    if (dedupeErr.code === "23505") {
      const { data: existing } = await db
        .from("stripe_webhook_events")
        .select("processed_at")
        .eq("event_id", event.id)
        .maybeSingle();
      if (existing?.processed_at) {
        return NextResponse.json({ received: true, duplicate: true });
      }
      // else: fall through and reprocess — a prior attempt never completed.
    } else {
      log.error("failed to record event id", { error: dedupeErr, eventId: event.id });
      return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
    }
  }

  // ── Stale/out-of-order guard: if a later event for the same subscription
  // has already been processed, this one arrived late (Stripe doesn't
  // guarantee delivery order) — applying it now would revert already-current
  // state back to something older. ──────────────────────────────────────────
  if (subscriptionId) {
    const { data: newerEvent } = await db
      .from("stripe_webhook_events")
      .select("event_id")
      .eq("subscription_id", subscriptionId)
      .neq("event_id", event.id)
      .gt("event_created", eventCreated)
      .limit(1)
      .maybeSingle();
    if (newerEvent) {
      log.info("skipping stale event", {
        eventId: event.id,
        eventType: event.type,
        subscriptionId,
      });
      return NextResponse.json({ received: true, stale: true });
    }
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.client_reference_id;
        const sessionSubscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (orgId && sessionSubscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(sessionSubscriptionId);
          await applySubscriptionToOrg(stripe, db, { id: orgId }, subscription);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
        await applySubscriptionToOrg(stripe, db, { stripeCustomerId: customerId }, subscription);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          await notifyPaymentFailed(db, customerId, invoice);
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    log.error("failed to process event", { error: err, eventType: event.type, eventId: event.id });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  await db.from("stripe_webhook_events").update({ processed_at: new Date().toISOString() }).eq("event_id", event.id);

  return NextResponse.json({ received: true });
}

/** Pulls the subscription id an event is about, if any, for idempotency/ordering tracking. */
function extractSubscriptionId(event: Stripe.Event): string | null {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      return typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      return subscription.id;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const sub = invoice.parent?.subscription_details?.subscription;
      return typeof sub === "string" ? sub : sub?.id ?? null;
    }
    default:
      return null;
  }
}

async function applySubscriptionToOrg(
  stripe: Stripe,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  lookup: { id: string } | { stripeCustomerId: string },
  subscription: Stripe.Subscription
) {
  // items.data[0] is always the base plan price — a seat-overage item (if
  // present) is added/removed by syncSeatOverage below and never the first
  // item on a subscription created through checkout-session.ts.
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const plan = priceId ? getPlanForPriceId(priceId) : null;

  const patch: Record<string, unknown> = {
    stripe_subscription_id: subscription.id,
    stripe_subscription_status: subscription.status,
    stripe_price_id: priceId,
  };
  if (DOWNGRADE_STATUSES.has(subscription.status)) {
    patch.plan = "trial";
  } else if (plan) {
    patch.plan = plan;
  }

  const query = db
    .from("organizations")
    .update(patch)
    .select("id, plan, seats_included_override, seat_overage_cents_override")
    .single();
  const { data: org, error } =
    "id" in lookup ? await query.eq("id", lookup.id) : await query.eq("stripe_customer_id", lookup.stripeCustomerId);

  if (error) throw error;

  // A downgraded/canceled subscription doesn't need its overage item
  // reconciled — the subscription itself is ending or already gone.
  if (!DOWNGRADE_STATUSES.has(subscription.status) && org?.plan) {
    // Crew accounts are shared field-clock-in logins, not real named seats —
    // see the matching comment in use-billing.ts.
    const { count: seatsUsed } = await db
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .neq("status", "inactive")
      .neq("role", "crew");
    await syncSeatOverage(stripe, subscription, org.plan, seatsUsed ?? 0, {
      seatsIncludedOverride: org.seats_included_override,
      seatOverageCentsOverride: org.seat_overage_cents_override,
    });
  }
}

/** Emails the org's admins that a subscription renewal payment failed. Best-effort. */
async function notifyPaymentFailed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  stripeCustomerId: string,
  invoice: Stripe.Invoice
) {
  const { data: org } = await db
    .from("organizations")
    .select("id, name")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();
  if (!org) return;

  const { data: admins } = await db
    .from("profiles")
    .select("email, name")
    .eq("org_id", org.id)
    .eq("role", "admin");
  const recipients = (admins ?? []).map((a: { email: string | null }) => a.email).filter(Boolean) as string[];
  if (recipients.length === 0) return;

  if (!process.env.RESEND_API_KEY) {
    log.warn("payment failed but RESEND_API_KEY is not set — skipping notification email", { orgId: org.id });
    return;
  }

  const amountDisplay = invoice.amount_due != null
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: (invoice.currency ?? "usd").toUpperCase() }).format(invoice.amount_due / 100)
    : null;
  const portalUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://twins-os.vercel.app";

  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    await resend.emails.send({
      from: "Equipt <noreply@twinslawnservice.com>",
      to: recipients,
      subject: `Payment failed for ${org.name}'s subscription`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Subscription payment failed</h2>
          <p style="margin:0 0 24px;color:#475569">
            A renewal payment${amountDisplay ? ` of <strong>${amountDisplay}</strong>` : ""} for <strong>${org.name}</strong>'s subscription failed.
            Please update the payment method in Billing Settings to avoid service interruption.
          </p>
          <a
            href="${portalUrl}/settings"
            style="display:inline-block;padding:12px 24px;background:#60ab45;color:#fff;text-decoration:none;border-radius:6px;font-weight:600"
          >
            Update Payment Method
          </a>
        </div>
      `,
    });
  } catch (err) {
    log.error("failed to send payment-failed notification", { error: err, orgId: org.id });
  }
}
