import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { clearStaleSavedPaymentMethods, syncConnectStatusFromStripe } from "@/lib/stripe/connect";
import { rejectIfImpersonating } from "@/lib/auth/impersonation-guard";
import { logger } from "@/lib/logger";

const log = logger.child("stripe connect oauth callback");
const STATE_COOKIE = "stripe_connect_oauth_state";

/** GET /api/crm/payments/connect/oauth/callback — Stripe redirects here after the user approves/denies. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const settingsUrl = `${url.origin}/crm/settings?tab=accounting`;
  const fail = (reason: string) => NextResponse.redirect(`${settingsUrl}&connect=error&reason=${reason}`);

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  // User clicked "Cancel" on Stripe's page (error=access_denied) or the flow was tampered with.
  if (url.searchParams.get("error")) return fail("denied");
  if (!code || !state || !expectedState || state !== expectedState || !isStripeConfigured()) {
    return fail("invalid");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("unauthorized");

  const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") return fail("unauthorized");

  // The profile org below is the staff member's HOME org — never link a Stripe account to it on behalf of a tenant.
  if (await rejectIfImpersonating(supabase, user.id)) return fail("impersonating");

  try {
    const stripe = getStripe();
    const token = await stripe.oauth.token({ grant_type: "authorization_code", code });
    const accountId = token.stripe_user_id;
    if (!accountId) return fail("invalid");

    const serviceClient = createServiceClient();

    // One Stripe account can only back one org — otherwise payments and
    // webhooks for it would be attributed to the wrong tenant.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stripe_connect_* columns aren't in generated types
    const { data: existing } = await (serviceClient.from("organizations") as any)
      .select("id")
      .eq("stripe_connect_account_id", accountId)
      .neq("id", profile.org_id)
      .limit(1);
    if (existing && existing.length > 0) return fail("in_use");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
    const { data: org } = await (serviceClient.from("organizations") as any)
      .select("stripe_connect_account_id")
      .eq("id", profile.org_id)
      .single();
    const previousAccountId: string | null = org?.stripe_connect_account_id ?? null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
    const { error: updateError } = await (serviceClient.from("organizations") as any)
      .update({
        stripe_connect_account_id: accountId,
        stripe_connect_status: "pending",
        stripe_connect_livemode: true,
        // A newly linked account hasn't proven anything yet; don't carry over the
        // previous account's capabilities until the status sync below confirms them.
        stripe_connect_charges_enabled: false,
        stripe_connect_payouts_enabled: false,
      })
      .eq("id", profile.org_id);
    if (updateError) throw updateError;

    if (previousAccountId && previousAccountId !== accountId) {
      const clearError = await clearStaleSavedPaymentMethods(profile.org_id);
      if (clearError) {
        log.error("failed to clear stale saved payment methods after reconnect", {
          error: clearError,
          orgId: profile.org_id,
          previousAccountId,
        });
      }
    }

    await syncConnectStatusFromStripe(stripe, profile.org_id, accountId, true);
    return NextResponse.redirect(`${settingsUrl}&connect=return`);
  } catch (err) {
    log.error("Stripe Connect OAuth exchange failed", { error: err, orgId: profile.org_id });
    return fail("exchange");
  }
}
