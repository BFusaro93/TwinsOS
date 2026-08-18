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
}

/**
 * Fetches the connected account's CURRENT status directly from Stripe and
 * writes it to organizations, instead of relying solely on the account.updated
 * webhook. Some Stripe workspaces only emit the newer v2 Accounts API events
 * (v2.core.account[...].updated) rather than the classic v1 account.updated
 * this app's webhook listens for, which can leave the cached DB status stuck
 * indefinitely — this gives every status check a live source of truth.
 */
export async function syncConnectStatusFromStripe(
  stripe: Stripe,
  orgId: string,
  accountId: string
): Promise<SyncedConnectStatus> {
  const account = await stripe.accounts.retrieve(accountId);
  const synced: SyncedConnectStatus = {
    status: statusForAccount(account),
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
  };

  const serviceClient = createServiceClient();
  await serviceClient
    .from("organizations")
    .update({
      stripe_connect_status: synced.status,
      stripe_connect_charges_enabled: synced.chargesEnabled,
      stripe_connect_payouts_enabled: synced.payoutsEnabled,
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
