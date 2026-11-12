import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { isAddonKey, getPriceIdForAddon, addonAppliesToModules } from "@/lib/stripe/addons";
import { planIncludesAddon, getModulesForPlan, type BundledAddonKey } from "@/lib/stripe/plans";
import { chargeIdempotencyKey } from "@/lib/stripe/idempotency";
import { removePurchasedBundledAddons } from "@/lib/stripe/bundled-addon-reconcile";
import { rejectIfImpersonating } from "@/lib/auth/impersonation-guard";
import { releaseOrgSmsResources } from "@/lib/twilio/provisioning";
import { logger } from "@/lib/logger";

const log = logger.child("billing addons");

/** Stripe subscription statuses after which nothing more can be billed on it (see the webhook's DOWNGRADE_STATUSES). */
const ENDED_SUBSCRIPTION_STATUSES = new Set(["canceled", "unpaid", "incomplete_expired", "paused"]);

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
    .select("org_id, role, status")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  if (profile.role !== "admin" || profile.status === "inactive") {
    return NextResponse.json({ error: "Only admins can manage billing" }, { status: 403 });
  }
  // Billing acts on profiles.org_id (the HOME org). While staff impersonate,
  // RLS hides that org and the route answered "Organization not found".
  const impersonating = await rejectIfImpersonating(supabase, user.id, "managing billing");
  if (impersonating) return impersonating;

  const body = await request.json().catch(() => null);
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

  // Mirrors the Subscription tab's own UI filter (SubscriptionTab.tsx,
  // addonAppliesToModules) so a module-inapplicable add-on (e.g. Route
  // Optimization or SMS on an Equipt-only org) can't be enabled by calling
  // this route directly, bypassing that filter.
  if (enabled && !addonAppliesToModules(addon, getModulesForPlan(org.plan))) {
    return NextResponse.json({ error: `The "${addon}" add-on isn't available on your plan` }, { status: 422 });
  }

  // A canceled org (or one whose subscription Stripe has stopped billing) has no
  // live subscription to add an item to — Stripe refuses, and that used to
  // surface as an uncaught 500.
  if (enabled && org.plan === "canceled") {
    return NextResponse.json(
      { error: "Your subscription is canceled. Resubscribe to a plan first, then add add-ons." },
      { status: 400 }
    );
  }

  const serviceClient = createServiceClient();

  // A plan that already bundles this add-on (or a trial, which bundles
  // everything) gets it free and can't turn it off. Nothing is written:
  // an organization_addons row means a PURCHASED add-on, and writing one here
  // used to leave trial-enabled add-ons free forever after subscribing.
  //
  // If the org PURCHASED it on an earlier plan, that purchase is still on the
  // subscription and still billing — drop the Stripe item and the purchase
  // row (either toggle direction), since the plan now covers it.
  if (planIncludesAddon(org.plan, addon as BundledAddonKey)) {
    if (org.stripe_subscription_id) {
      const stripe = getStripe();
      const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
      try {
        await removePurchasedBundledAddons(stripe, serviceClient, org.id, org.plan, subscription, addon);
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Could not remove add-on" }, { status: 500 });
      }
    }
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
  let subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
  } catch (err) {
    log.error("subscription retrieve failed", { orgId: org.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ error: "Could not load your subscription — try again" }, { status: 502 });
  }
  if (enabled && ENDED_SUBSCRIPTION_STATUSES.has(subscription.status)) {
    return NextResponse.json(
      { error: "Your subscription has ended. Resubscribe to a plan first, then add add-ons." },
      { status: 400 }
    );
  }
  const existingItem = subscription.items.data.find((item) => item.price.id === priceId);

  if (enabled) {
    // Upsert even when Stripe already has the item: a previous attempt may
    // have created it and then failed on this write, and skipping here would
    // leave the add-on billed but never recorded as enabled.
    let itemId = existingItem?.id;
    if (!itemId) {
      try {
        const item = await stripe.subscriptionItems.create(
          {
            subscription: subscription.id,
            price: priceId,
            proration_behavior: "create_prorations",
          },
          { idempotencyKey: chargeIdempotencyKey(["addon_item", org.id, addon]) }
        );
        itemId = item.id;
      } catch (err) {
        log.error("add-on item create failed", { orgId: org.id, addon, error: err instanceof Error ? err.message : err });
        return NextResponse.json(
          { error: err instanceof Error ? `Stripe couldn't add the add-on: ${err.message}` : "Stripe couldn't add the add-on" },
          { status: 502 }
        );
      }
    }
    const { error: upsertErr } = await serviceClient
      .from("organization_addons")
      .upsert(
        { org_id: org.id, addon_key: addon, enabled: true, stripe_subscription_item_id: itemId },
        { onConflict: "org_id,addon_key" }
      );
    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  } else {
    if (existingItem) {
      try {
        await stripe.subscriptionItems.del(existingItem.id, { proration_behavior: "create_prorations" });
      } catch (err) {
        log.error("add-on item delete failed", { orgId: org.id, addon, error: err instanceof Error ? err.message : err });
        return NextResponse.json(
          { error: err instanceof Error ? `Stripe couldn't remove the add-on: ${err.message}` : "Stripe couldn't remove the add-on" },
          { status: 502 }
        );
      }
    }
    const { error: upsertErr } = await serviceClient
      .from("organization_addons")
      .upsert(
        { org_id: org.id, addon_key: addon, enabled: false, stripe_subscription_item_id: null },
        { onConflict: "org_id,addon_key" }
      );
    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

    // Removing SMS stops paying for the org's own texting number: release the
    // number and campaign at Twilio. Best-effort — logged, never fails the removal.
    if (addon === "sms") {
      await releaseOrgSmsResources(serviceClient, org.id, "sms_addon_removed");
    }
  }

  return NextResponse.json({ enabled, bundled: false });
}
