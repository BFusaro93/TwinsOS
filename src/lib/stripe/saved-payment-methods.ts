import type Stripe from "stripe";

/** Human-readable label for a saved payment method, e.g. "Visa •••• 4242" or "Bank •••• 6789". */
export function summarizePaymentMethod(pm: Stripe.PaymentMethod): string {
  if (pm.type === "us_bank_account" && pm.us_bank_account) {
    const bankName = pm.us_bank_account.bank_name ?? "Bank";
    return `${bankName} •••• ${pm.us_bank_account.last4 ?? "----"}`;
  }
  if (pm.type === "card" && pm.card) {
    const brand = pm.card.brand ? pm.card.brand[0].toUpperCase() + pm.card.brand.slice(1) : "Card";
    return `${brand} •••• ${pm.card.last4 ?? "----"}`;
  }
  return "Payment method on file";
}

/** Finds or creates the Stripe Customer for a client on the org's connected account.
 * Customers (like PaymentMethods) live on the connected account, not the platform account. */
export async function getOrCreateStripeCustomer(
  stripe: Stripe,
  connectedAccountId: string,
  existingCustomerId: string | null,
  client: { id: string; display_name: string; primary_email: string | null }
): Promise<string> {
  if (existingCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(existingCustomerId, {}, { stripeAccount: connectedAccountId });
      if (!customer.deleted) return existingCustomerId;
    } catch {
      // Customer no longer exists on the connected account (e.g. account was reset) — create a new one below.
    }
  }
  const customer = await stripe.customers.create(
    {
      name: client.display_name,
      email: client.primary_email ?? undefined,
      metadata: { client_id: client.id },
    },
    { stripeAccount: connectedAccountId }
  );
  return customer.id;
}
