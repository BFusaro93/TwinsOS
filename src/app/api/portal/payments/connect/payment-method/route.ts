import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { logger } from "@/lib/logger";

const log = logger.child("stripe saved payment method (portal)");

export async function DELETE() {
  const ctx = await getPortalContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("id, saved_payment_method_id")
    .eq("id", ctx.clientId)
    .eq("org_id", ctx.orgId)
    .is("deleted_at", null)
    .single();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  if (client.saved_payment_method_id && isStripeConfigured()) {
    const { data: org } = await supabase
      .from("organizations")
      .select("stripe_connect_account_id")
      .eq("id", ctx.orgId)
      .single();
    if (org?.stripe_connect_account_id) {
      try {
        await getStripe().paymentMethods.detach(client.saved_payment_method_id, {}, {
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
    .update({ saved_payment_method_id: null, saved_payment_method_type: null, saved_payment_method_summary: null })
    .eq("id", client.id);
  if (error) return NextResponse.json({ error: "Failed to remove payment method" }, { status: 500 });

  return NextResponse.json({ removed: true });
}
