import { getStripeForOrg } from "@/lib/stripe/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export interface CardExpiryContext {
  last4: string;
  expMonth: number;
  expYear: number;
}

/**
 * Live Stripe lookup of a client's saved card's masked last4/expiry — the
 * same call card-expiry-notify's cron already makes to decide whether to
 * fire the trigger. Deliberately re-fetched here rather than threaded
 * through from that cron: the enrollment this trigger creates is picked up
 * by a later, separate cron run (`/api/automations/run`, possibly after a
 * `wait` step of days), so any value captured at enrollment time would have
 * to be persisted to survive that gap. Re-fetching keeps last4/exp/expYear
 * off disk entirely and always reflects the card's current state (it could
 * have changed or been removed since enrollment).
 */
export async function fetchCardExpiryContext(
  adminClient: AnyClient,
  clientId: string
): Promise<CardExpiryContext | null> {
  const { data: client } = await adminClient
    .from("clients")
    .select("saved_payment_method_id, saved_payment_method_type, organizations(stripe_connect_account_id, stripe_connect_livemode)")
    .eq("id", clientId)
    .maybeSingle();

  const connectAccountId = client?.organizations?.stripe_connect_account_id as string | null | undefined;
  const paymentMethodId = client?.saved_payment_method_id as string | null | undefined;
  if (client?.saved_payment_method_type !== "card" || !paymentMethodId || !connectAccountId) return null;

  try {
    const stripe = getStripeForOrg(client.organizations?.stripe_connect_livemode);
    const pm = await stripe.paymentMethods.retrieve(
      paymentMethodId,
      {},
      { stripeAccount: connectAccountId }
    );
    const card = pm.card;
    if (!card?.last4 || !card.exp_month || !card.exp_year) return null;
    return { last4: card.last4, expMonth: card.exp_month, expYear: card.exp_year };
  } catch {
    // Best-effort — a lookup failure (e.g. detached on Stripe's side) just
    // means the step blank-degrades the two tags, same as any other trigger
    // type; it must never block the send.
    return null;
  }
}
