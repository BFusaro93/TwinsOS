import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { getStripeForOrg, isStripeConfigured, isStripeTestConfigured } from "@/lib/stripe/server";
import { logger } from "@/lib/logger";

const log = logger.child("stripe saved payment method (portal)");

export async function DELETE() {
  const ctx = await getPortalContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Portal users have no RLS read path to clients / crm_invoices — service

  // client, scoped to this login (ctx is server-derived) on every query below.

  const supabase = createServiceClient();

  const { data: client } = await supabase
    .from("clients")
    .select("id, saved_payment_method_id")
    .eq("id", ctx.clientId)
    .eq("org_id", ctx.orgId)
    .is("deleted_at", null)
    .single();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  if (client.saved_payment_method_id && (isStripeConfigured() || isStripeTestConfigured())) {
    // stripe_connect_livemode isn't in the generated Supabase types yet (added
    // by a migration this session wrote but did not apply/regenerate types for).
    // Portal users have no profiles row, so the organizations policy returns nothing for
    // their session; without the service client the Stripe detach was silently skipped.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: org } = await (createServiceClient().from("organizations") as any)
      .select("stripe_connect_account_id, stripe_connect_livemode")
      .eq("id", ctx.orgId)
      .single();
    if (org?.stripe_connect_account_id) {
      try {
        await getStripeForOrg(org.stripe_connect_livemode).paymentMethods.detach(client.saved_payment_method_id, {}, {
          stripeAccount: org.stripe_connect_account_id,
        });
      } catch (err) {
        log.error("failed to detach payment method from Stripe", { error: err, clientId: client.id });
      }
    }
  }

  const serviceClient = createServiceClient();
  const { error } = await serviceClient
    .from("clients")
    .update({ saved_payment_method_id: null, saved_payment_method_type: null, saved_payment_method_summary: null, autopay_enabled: false })
    .eq("id", client.id)
    .eq("org_id", ctx.orgId);
  if (error) return NextResponse.json({ error: "Failed to remove payment method" }, { status: 500 });

  return NextResponse.json({ removed: true });
}

const AutopaySchema = z.object({ autopayEnabled: z.boolean() });

/** PATCH — the customer turns autopay on or off for the payment method they have saved. */
export async function PATCH(request: Request) {
  const ctx = await getPortalContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = AutopaySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  // Service client: portal users have no profiles row, and the client write guard reserves
  // payment columns for service-role callers. Scoped to this portal user's own client.
  const serviceClient = createServiceClient();
  const { data: client } = await serviceClient
    .from("clients")
    .select("id, saved_payment_method_id")
    .eq("id", ctx.clientId)
    .eq("org_id", ctx.orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (parsed.data.autopayEnabled && !client.saved_payment_method_id) {
    return NextResponse.json({ error: "Save a payment method before turning on autopay" }, { status: 400 });
  }

  const { error } = await serviceClient
    .from("clients")
    .update({ autopay_enabled: parsed.data.autopayEnabled })
    .eq("id", client.id)
    .eq("org_id", ctx.orgId);
  if (error) {
    log.error("failed to update autopay", { error, clientId: client.id });
    return NextResponse.json({ error: "Failed to update autopay" }, { status: 500 });
  }
  return NextResponse.json({ autopayEnabled: parsed.data.autopayEnabled });
}
