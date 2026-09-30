import type Stripe from "stripe";
import { ADDON_CATALOG, getPriceIdForAddon, type AddonKey } from "./addons";
import { isBillablePlan, planIncludesAddon, type BundledAddonKey } from "./plans";

/**
 * An add-on bought on a lower plan keeps billing after the org moves to a
 * plan that bundles it — and the add-ons route refused to remove it (422,
 * "included in your plan"). This drops the Stripe item and marks the
 * organization_addons purchase row disabled for every add-on (or just
 * `onlyAddon`) that `plan` now includes.
 *
 * Only for billable plans: trial has no subscription, and canceled includes
 * nothing. `db` must be a service-role client (organization_addons is
 * service-role-written).
 */
export async function removePurchasedBundledAddons(
  stripe: Stripe,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  plan: string,
  subscription: Stripe.Subscription | null,
  onlyAddon?: AddonKey
): Promise<void> {
  if (!isBillablePlan(plan)) return;

  const keys = ADDON_CATALOG.map((a) => a.key as AddonKey).filter(
    (key) => (!onlyAddon || key === onlyAddon) && planIncludesAddon(plan, key as BundledAddonKey)
  );

  for (const key of keys) {
    const priceId = getPriceIdForAddon(key);
    const item = priceId ? subscription?.items.data.find((i) => i.price.id === priceId) : undefined;
    if (item) {
      try {
        await stripe.subscriptionItems.del(item.id, { proration_behavior: "create_prorations" });
      } catch (err) {
        // A webhook retry replays the same item list — already gone is fine.
        if ((err as { code?: string }).code !== "resource_missing") throw err;
      }
    }
    const { error } = await db
      .from("organization_addons")
      .update({ enabled: false, stripe_subscription_item_id: null })
      .eq("org_id", orgId)
      .eq("addon_key", key)
      .eq("enabled", true);
    if (error) throw error;
  }
}
