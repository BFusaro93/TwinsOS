import { isStripeConfigured, isStripeTestConfigured } from "@/lib/stripe/server";

/**
 * Whether an org can take online payments right now: the platform has Stripe
 * keys AND the org finished Stripe Connect onboarding (charges enabled). The
 * same test the pay routes use to refuse with "hasn't finished setting up card
 * payments" and proposals use for cardDepositAvailable. When it's false, every
 * customer-facing surface shows "View Invoice" instead of a Pay button — an
 * email's Pay Now, the public invoice page, the portal — rather than offering a
 * payment that can only fail.
 */
export function orgCardPaymentsAvailable(
  org: { stripe_connect_account_id?: string | null; stripe_connect_charges_enabled?: boolean | null } | null | undefined
): boolean {
  return (
    (isStripeConfigured() || isStripeTestConfigured()) &&
    !!org?.stripe_connect_account_id &&
    !!org?.stripe_connect_charges_enabled
  );
}

/**
 * orgCardPaymentsAvailable() for an org id. `db` must be able to read the
 * org's row (the caller's own client for staff, the service client for public
 * or portal pages). Fails closed to false — a missing row means no Pay button.
 */
export async function fetchOrgCardPaymentsAvailable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- callers pass assorted Supabase clients (typed and untyped)
  db: any,
  orgId: string | null | undefined
): Promise<boolean> {
  if (!orgId) return false;
  const { data } = await db
    .from("organizations")
    .select("stripe_connect_account_id, stripe_connect_charges_enabled")
    .eq("id", orgId)
    .maybeSingle();
  return orgCardPaymentsAvailable(data as { stripe_connect_account_id: string | null; stripe_connect_charges_enabled: boolean | null } | null);
}

/** Label for an emailed invoice button/link, by whether the org can take payment online. */
export function invoiceLinkLabel(cardPaymentsAvailable: boolean, style: "button" | "banner"): string {
  if (!cardPaymentsAvailable) return "View Invoice";
  return style === "button" ? "Pay Now" : "View & Pay Invoice Online";
}
