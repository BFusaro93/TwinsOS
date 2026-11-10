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

/**
 * Makes organization_addons match what the subscription actually bills.
 * Called by the billing webhook on every applied subscription state event.
 *
 * Without it, rows outlived their subscription: a cancellation left them
 * enabled with the old stripe_subscription_item_id, and a resubscribe (a NEW
 * subscription carrying only the plan price) kept granting every add-on the
 * org had bought before — unbilled — because entitlement checks only look for
 * an enabled row with an item id.
 *
 * - `subscription` null (or ended): every enabled purchase row is disabled.
 * - Otherwise: an enabled row whose item isn't on this subscription is
 *   disabled; an add-on whose price IS on it is recorded enabled with that
 *   item (an add-on added in Stripe directly, or a webhook that landed before
 *   the add-ons route wrote its row). Rows for bundled add-ons are then
 *   handled by removePurchasedBundledAddons, which runs after this.
 *
 * Reads only the subscription object it is given — never calls Stripe.
 */
export async function reconcileAddonsWithSubscription(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  subscription: Stripe.Subscription | null
): Promise<void> {
  const items = subscription?.items.data ?? [];
  const liveItemIds = new Set(items.map((i) => i.id));

  const { data: rows, error } = await db
    .from("organization_addons")
    .select("addon_key, enabled, stripe_subscription_item_id")
    .eq("org_id", orgId);
  if (error) throw error;
  const existing = (rows ?? []) as { addon_key: string; enabled: boolean; stripe_subscription_item_id: string | null }[];

  // Billed by this subscription → enabled with its current item id.
  const billedKeys = new Set<string>();
  for (const entry of ADDON_CATALOG) {
    const priceId = getPriceIdForAddon(entry.key as AddonKey);
    const item = priceId ? items.find((i) => i.price.id === priceId) : undefined;
    if (!item) continue;
    billedKeys.add(entry.key);
    const row = existing.find((r) => r.addon_key === entry.key);
    if (row?.enabled && row.stripe_subscription_item_id === item.id) continue;
    const { error: upsertErr } = await db
      .from("organization_addons")
      .upsert(
        { org_id: orgId, addon_key: entry.key, enabled: true, stripe_subscription_item_id: item.id },
        { onConflict: "org_id,addon_key" }
      );
    if (upsertErr) throw upsertErr;
  }

  // Not billed by this subscription → not granted.
  for (const row of existing) {
    if (billedKeys.has(row.addon_key)) continue;
    const granted = row.enabled || row.stripe_subscription_item_id !== null;
    const onThisSubscription = !!row.stripe_subscription_item_id && liveItemIds.has(row.stripe_subscription_item_id);
    // An item still on the subscription whose price we couldn't map (price env
    // var unset or renamed) is left alone — it is still being billed.
    if (!granted || onThisSubscription) continue;
    const { error: disableErr } = await db
      .from("organization_addons")
      .update({ enabled: false, stripe_subscription_item_id: null })
      .eq("org_id", orgId)
      .eq("addon_key", row.addon_key);
    if (disableErr) throw disableErr;
  }
}
