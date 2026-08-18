import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { logger } from "@/lib/logger";

const log = logger.child("stripe saved payment method (crm)");

const RemoveSchema = z.object({ clientId: z.string().uuid() });

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });

  const body = await request.json();
  const parsed = RemoveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { clientId } = parsed.data;

  const { data: client } = await supabase
    .from("clients")
    .select("id, saved_payment_method_id")
    .eq("id", clientId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .single();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  if (client.saved_payment_method_id && isStripeConfigured()) {
    const { data: org } = await supabase
      .from("organizations")
      .select("stripe_connect_account_id")
      .eq("id", profile.org_id)
      .single();
    if (org?.stripe_connect_account_id) {
      try {
        await getStripe().paymentMethods.detach(client.saved_payment_method_id, {}, {
          stripeAccount: org.stripe_connect_account_id,
        });
      } catch (err) {
        log.error("failed to detach payment method from Stripe", { error: err, clientId });
      }
    }
  }

  const serviceClient = createServiceClient();
  const { error } = await serviceClient
    .from("clients")
    .update({ saved_payment_method_id: null, saved_payment_method_type: null, saved_payment_method_summary: null })
    .eq("id", clientId);
  if (error) return NextResponse.json({ error: "Failed to remove payment method" }, { status: 500 });

  return NextResponse.json({ removed: true });
}
