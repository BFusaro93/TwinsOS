import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveCardUpdateToken } from "@/lib/card-update/resolve";
import { getStripeForOrg, isStripeConfigured, isStripeTestConfigured } from "@/lib/stripe/server";
import { summarizePaymentMethod } from "@/lib/stripe/saved-payment-methods";
import { saveClientPaymentMethod } from "@/lib/stripe/save-client-payment-method";
import { stripeErrorResponse } from "@/lib/stripe/errors";
import { loadPortalFeatureSettings } from "@/lib/portal/portal-feature-settings";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { logger } from "@/lib/logger";

const log = logger.child("public-card-update confirm");

const ConfirmSchema = z.object({ setupIntentId: z.string().min(1).max(255), autopay: z.boolean().default(false) });

/**
 * Finishes the save: re-reads the SetupIntent from Stripe, checks it belongs to THIS link's
 * client, stores the card, turns on AutoPay when asked (and the org allows it — same rule as the
 * portal), then spends the link. Mirrors PUT /api/portal/payments/connect/payment-method.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!isStripeConfigured() && !isStripeTestConfigured()) {
    return NextResponse.json({ error: "Card payments are not configured yet" }, { status: 400 });
  }
  const { token } = await params;
  const parsed = ConfirmSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { setupIntentId, autopay: requestedAutopay } = parsed.data;

  const db = createServiceClient();
  const resolved = await resolveCardUpdateToken(db, token);
  if (!resolved) return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
  if (resolved.state === "expired") return NextResponse.json({ error: "This link has expired. Please ask us for a new one." }, { status: 410 });
  if (resolved.state === "used") return NextResponse.json({ error: "This link has already been used." }, { status: 409 });

  if (!(await checkAuthRateLimit(`card-update-confirm:${resolved.tokenHash}`, 10, 600))) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  }

  const features = await loadPortalFeatureSettings(resolved.orgId);
  const enableAutopay = requestedAutopay && features.allowAutopay;

  const { data: client } = await db
    .from("clients")
    .select("id, stripe_customer_id")
    .eq("id", resolved.clientId)
    .eq("org_id", resolved.orgId)
    .is("deleted_at", null)
    .single();
  if (!client) return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (db.from("organizations") as any)
    .select("stripe_connect_account_id, stripe_connect_livemode")
    .eq("id", resolved.orgId)
    .single();
  if (!org?.stripe_connect_account_id) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const stripe = getStripeForOrg(org.stripe_connect_livemode);
  let setupIntent: Awaited<ReturnType<typeof stripe.setupIntents.retrieve>>;
  try {
    setupIntent = await stripe.setupIntents.retrieve(setupIntentId, { expand: ["payment_method"] }, { stripeAccount: org.stripe_connect_account_id });
  } catch (err) {
    return stripeErrorResponse(err, log, { clientId: client.id, connectedAccountId: org.stripe_connect_account_id });
  }

  if (setupIntent.status !== "succeeded" || !setupIntent.payment_method || typeof setupIntent.payment_method === "string") {
    return NextResponse.json({ error: "Card setup did not complete" }, { status: 400 });
  }
  if (!client.stripe_customer_id || setupIntent.customer !== client.stripe_customer_id) {
    log.error("setup intent customer does not match link's client", { clientId: client.id, setupIntentCustomer: setupIntent.customer });
    return NextResponse.json({ error: "This card doesn't belong to this account" }, { status: 403 });
  }

  const pm = setupIntent.payment_method;
  const summary = summarizePaymentMethod(pm);
  const { error } = await saveClientPaymentMethod(db, { orgId: resolved.orgId, clientId: client.id, pm, summary, enableAutopay });
  if (error) {
    log.error("failed to save payment method", { error, clientId: client.id });
    return NextResponse.json({ error: "We couldn't save your card. Please try again." }, { status: 500 });
  }

  // Spend the link only now that the card is saved; a failed save leaves it usable for a retry.
  // card_update_tokens isn't in the generated Supabase types yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .from("card_update_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", resolved.id)
    .is("used_at", null);

  // Client timeline entry, as the staff-side flows leave.
  const { error: actErr } = await db.from("client_activity").insert({
    org_id: resolved.orgId,
    client_id: client.id,
    activity_type: "note",
    subject: enableAutopay ? "Card updated by client (AutoPay on)" : "Card updated by client",
    body: `${summary ?? "Card"} saved through an emailed card-update link.${enableAutopay ? " AutoPay turned on." : ""}`,
  });
  if (actErr) log.error("failed to log card update activity", { error: actErr, clientId: client.id });

  return NextResponse.json({ summary, autopayEnabled: enableAutopay });
}
