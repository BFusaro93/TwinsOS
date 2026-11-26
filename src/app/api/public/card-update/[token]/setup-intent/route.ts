import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveCardUpdateToken } from "@/lib/card-update/resolve";
import { getStripeForOrg, isStripeConfigured, isStripeTestConfigured } from "@/lib/stripe/server";
import { getOrCreateStripeCustomer } from "@/lib/stripe/saved-payment-methods";
import { achEnabledForAccount } from "@/lib/stripe/connect";
import { stripeErrorResponse } from "@/lib/stripe/errors";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { logger } from "@/lib/logger";

const log = logger.child("public-card-update setup-intent");

const BodySchema = z.object({ paymentMethod: z.enum(["card", "us_bank_account"]).default("card") });

/** Starts saving a card (or, when the org has bank transfer on, a bank account) for the client the link was issued to — the same SetupIntent the portal creates. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!isStripeConfigured() && !isStripeTestConfigured()) {
    return NextResponse.json({ error: "Card payments are not configured yet" }, { status: 400 });
  }
  const { token } = await params;
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";

  const parsedBody = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsedBody.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { paymentMethod } = parsedBody.data;

  const db = createServiceClient();
  const resolved = await resolveCardUpdateToken(db, token);
  if (!resolved) return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
  if (resolved.state === "expired") return NextResponse.json({ error: "This link has expired. Please ask us for a new one." }, { status: 410 });
  if (resolved.state === "used") return NextResponse.json({ error: "This link has already been used." }, { status: 409 });

  // Each call mints a Stripe SetupIntent: cap per link and per address. Fails open if the limiter errors.
  if (
    !(await checkAuthRateLimit(`card-update-setup:${resolved.tokenHash}`, 10, 600)) ||
    !(await checkAuthRateLimit(`card-update-setup:ip:${ip}`, 30, 600))
  ) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  }

  const { data: client } = await db
    .from("clients")
    .select("id, display_name, primary_email, stripe_customer_id")
    .eq("id", resolved.clientId)
    .eq("org_id", resolved.orgId)
    .is("deleted_at", null)
    .single();
  if (!client) return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });

  // stripe_connect_livemode isn't in the generated Supabase types yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (db.from("organizations") as any)
    .select("stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_livemode, ach_payments_enabled")
    .eq("id", resolved.orgId)
    .single();
  if (!org?.stripe_connect_account_id || !org.stripe_connect_charges_enabled) {
    return NextResponse.json({ error: "Online card updates aren't available yet. Please contact us." }, { status: 400 });
  }

  const stripe = getStripeForOrg(org.stripe_connect_livemode);
  try {
    if (paymentMethod === "us_bank_account" && (!org.ach_payments_enabled || !(await achEnabledForAccount(stripe, org.stripe_connect_account_id)))) {
      return NextResponse.json({ error: "Bank transfer isn't available yet — please use a card." }, { status: 400 });
    }
    const customerId = await getOrCreateStripeCustomer(stripe, org.stripe_connect_account_id, client.stripe_customer_id, client);
    if (customerId !== client.stripe_customer_id) {
      const { error } = await db.from("clients").update({ stripe_customer_id: customerId }).eq("id", client.id).eq("org_id", resolved.orgId);
      if (error) log.error("failed to save stripe customer id", { error, clientId: client.id });
    }
    const setupIntent = await stripe.setupIntents.create(
      {
        customer: customerId,
        payment_method_types: [paymentMethod],
        // Instant bank verification only: a micro-deposit setup stays pending for days and could
        // never finish inside this one-time page, so a bank that can't verify instantly uses a card.
        ...(paymentMethod === "us_bank_account"
          ? { payment_method_options: { us_bank_account: { verification_method: "instant" as const } } }
          : {}),
        usage: "off_session",
        metadata: { client_id: client.id, org_id: resolved.orgId, source: "card_update_link" },
      },
      { stripeAccount: org.stripe_connect_account_id },
    );
    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      connectedAccountId: org.stripe_connect_account_id,
      livemode: org.stripe_connect_livemode ?? true,
    });
  } catch (err) {
    return stripeErrorResponse(err, log, { clientId: client.id, connectedAccountId: org.stripe_connect_account_id });
  }
}
