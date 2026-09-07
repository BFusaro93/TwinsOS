import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";

export type ConnectAccountStatus = "active" | "restricted" | "pending";

/** Stripe's own statuses for a connected account (there's no `status` field on the
 * Account object) — derived from the requirements/capabilities. */
export function statusForAccount(account: Stripe.Account): ConnectAccountStatus {
  if (account.requirements?.disabled_reason) return "restricted";
  if (account.charges_enabled && account.payouts_enabled) return "active";
  return "pending";
}

export interface SyncedConnectStatus {
  status: ConnectAccountStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  livemode: boolean;
}

/**
 * Fetches the connected account's CURRENT status directly from Stripe and
 * writes it to organizations, instead of relying solely on the account.updated
 * webhook. Some Stripe workspaces only emit the newer v2 Accounts API events
 * (v2.core.account[...].updated) rather than the classic v1 account.updated
 * this app's webhook listens for, which can leave the cached DB status stuck
 * indefinitely — this gives every status check a live source of truth.
 *
 * `stripe` must already be the client for this account's mode (see
 * getStripeForOrg() in src/lib/stripe/server.ts) — `accounts.retrieve()`
 * throws "does not have access to account" otherwise. `livemode` is the mode
 * of that same client: Stripe's Account object has no `livemode` field of its
 * own, so a successful retrieve is itself the proof this mode is correct,
 * which is what lets this self-heal `organizations.stripe_connect_livemode`
 * for accounts connected before that column existed.
 */
export async function syncConnectStatusFromStripe(
  stripe: Stripe,
  orgId: string,
  accountId: string,
  livemode: boolean
): Promise<SyncedConnectStatus> {
  const account = await stripe.accounts.retrieve(accountId);
  const synced: SyncedConnectStatus = {
    status: statusForAccount(account),
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    livemode,
  };

  const serviceClient = createServiceClient();
  // stripe_connect_livemode isn't in the generated Supabase types yet (added
  // by a migration this session wrote but did not apply/regenerate types for).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (serviceClient.from("organizations") as any)
    .update({
      stripe_connect_status: synced.status,
      stripe_connect_charges_enabled: synced.chargesEnabled,
      stripe_connect_payouts_enabled: synced.payoutsEnabled,
      stripe_connect_livemode: synced.livemode,
    })
    .eq("id", orgId);

  return synced;
}

/** Whether a connected account has actually activated ACH (US bank account) payments
 * in Stripe — `payment_method_types: ['us_bank_account']` on a PaymentIntent/SetupIntent
 * doesn't reject a request from an account that hasn't turned this on for itself, so
 * checks that want to offer/accept ACH need to gate on this explicitly. */
export async function achEnabledForAccount(stripe: Stripe, accountId: string): Promise<boolean> {
  const account = await stripe.accounts.retrieve(accountId);
  return account.capabilities?.us_bank_account_ach_payments === "active";
}
