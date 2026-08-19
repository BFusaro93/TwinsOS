import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { isAddonKey, getPriceIdForAddon } from "@/lib/stripe/addons";
import { planIncludesAddon, type BundledAddonKey } from "@/lib/stripe/plans";

const ToggleAddonSchema = z.object({
  addon: z.string().refine(isAddonKey, { message: "Unknown addon" }),
  enabled: z.boolean(),
});

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing is not configured yet" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  if (profile.role !== "admin") {
    return NextResponse.json({ error: "Only admins can manage billing" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = ToggleAddonSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { addon, enabled } = parsed.data;

  const { data: org } = await supabase
    .from("organizations")
    .select("id, plan, stripe_customer_id, stripe_subscription_id")
    .eq("id", profile.org_id)
    .single();
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const serviceClient = createServiceClient();

  // A plan that already bundles this add-on gets it free — just mark it
  // enabled in our own records without ever touching Stripe, and refuse to
  // let it be turned off (it's not optional, the plan includes it).
  if (planIncludesAddon(org.plan, addon as BundledAddonKey)) {
    if (!enabled) {
      return NextResponse.json({ error: "This add-on is included in your plan and can't be removed" }, { status: 422 });
    }
    const { error: upsertErr } = await serviceClient
      .from("organization_addons")
      .upsert({ org_id: org.id, addon_key: addon, enabled: true }, { onConflict: "org_id,addon_key" });
    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    return NextResponse.json({ enabled: true, bundled: true });
  }

  if (!org.stripe_subscription_id) {
    return NextResponse.json({ error: "Subscribe to a plan before adding add-ons" }, { status: 422 });
  }

  const priceId = getPriceIdForAddon(addon);
  if (!priceId) {
    return NextResponse.json({ error: `No Stripe price configured for the "${addon}" add-on` }, { status: 400 });
  }

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
  const existingItem = subscription.items.data.find((item) => item.price.id === priceId);

  if (enabled) {
    if (!existingItem) {
      const item = await stripe.subscriptionItems.create({
        subscription: subscription.id,
        price: priceId,
        proration_behavior: "create_prorations",
      });
      const { error: upsertErr } = await serviceClient
        .from("organization_addons")
        .upsert(
          { org_id: org.id, addon_key: addon, enabled: true, stripe_subscription_item_id: item.id },
          { onConflict: "org_id,addon_key" }
        );
      if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }
  } else {
    if (existingItem) {
      await stripe.subscriptionItems.del(existingItem.id, { proration_behavior: "create_prorations" });
    }
    const { error: upsertErr } = await serviceClient
      .from("organization_addons")
      .upsert(
        { org_id: org.id, addon_key: addon, enabled: false, stripe_subscription_item_id: null },
        { onConflict: "org_id,addon_key" }
      );
    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ enabled, bundled: false });
}
