import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getStripeForOrg } from "@/lib/stripe/server";
import { settleSurchargeAuthorization } from "@/lib/stripe/surcharge-capture";
import { logger } from "@/lib/logger";
import { drainIntentCancellations } from "@/lib/stripe/open-intent";

const log = logger.child("settle card surcharges cron");

export const maxDuration = 120;

/**
 * GET /api/cron/settle-card-surcharges — every few minutes via Vercel Cron.
 *
 * Card charges that include a surcharge are created as authorizations and settled by the Stripe
 * `payment_intent.amount_capturable_updated` webhook (credit: capture all; debit/prepaid: capture
 * the invoice balance only — see lib/stripe/surcharge-capture.ts). This sweep captures any that the
 * webhook missed (event not subscribed, a failed delivery) so a customer's authorization is never
 * left uncaptured until Stripe expires it after 7 days with the invoice still unpaid.
 *
 * It also cancels customer pay forms made stale by another change to their
 * invoice (paid another way, voided, merged, total edited) — see
 * lib/stripe/open-intent.ts. The payment paths drain that queue themselves
 * right away; this sweep catches the rest (e.g. a payment staff recorded by hand).
 *
 * Security: Vercel passes Authorization: Bearer {CRON_SECRET}.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orgs, error } = await (supabase as any)
    .from("organizations")
    .select("id, stripe_connect_account_id, stripe_connect_livemode")
    .not("stripe_connect_account_id", "is", null);
  if (error) {
    log.error("failed to load connected orgs", { error });
    return NextResponse.json({ error: "Failed to load organizations" }, { status: 500 });
  }

  let settled = 0;
  let failed = 0;
  for (const org of (orgs ?? []) as { id: string; stripe_connect_account_id: string; stripe_connect_livemode: boolean | null }[]) {
    try {
      const stripe = getStripeForOrg(org.stripe_connect_livemode);
      const found = await stripe.paymentIntents.search(
        { query: "status:'requires_capture' AND metadata['surcharge_pending']:'1'", limit: 50, expand: ["data.payment_method"] },
        { stripeAccount: org.stripe_connect_account_id }
      );
      for (const intent of found.data) {
        // Leave very fresh ones to the webhook; this is the safety net, not the main path.
        if (Date.now() / 1000 - intent.created < 120) continue;
        try {
          const result = await settleSurchargeAuthorization(stripe, intent, org.stripe_connect_account_id);
          if (result === "captured") settled++;
        } catch (err) {
          failed++;
          log.error("failed to settle surcharge authorization", { error: err, paymentIntentId: intent.id, orgId: org.id });
        }
      }
    } catch (err) {
      // One org's Stripe problem (revoked access, test/live mismatch) must not stop the rest.
      log.error("surcharge sweep failed for org", { error: err, orgId: org.id });
    }
  }

  const stale = await drainIntentCancellations(supabase, { limit: 200 });

  return NextResponse.json({ ok: true, settled, failed, staleFormsCanceled: stale.canceled, staleFormsFailed: stale.failed });
}
