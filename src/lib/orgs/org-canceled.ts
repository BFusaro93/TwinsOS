import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A canceled org keeps READ-ONLY access to its data (20260926190000) but must
 * not have the platform keep working for it in the background: no cron-made
 * invoices, report emails, reminders, automation/sequence sends or campaigns.
 * Reactivating (the billing webhook sets a billable plan) simply makes these
 * jobs see the org again — there is no backfill of what was skipped.
 *
 * Same definition as my_org_is_read_only()'s canceled half: plan = 'canceled'
 * (read-only until canceled_access_ends_at and locked out after — automated
 * work stops in both phases). Expired TRIALS are deliberately not covered
 * here: they are read-only at the database but not "canceled".
 *
 * Fails OPEN when the lookup errors: a transient DB error must not silently
 * skip a paying customer's invoices. The caller's own queries would surface a
 * real outage.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export type OrgCanceledResolver = (orgId: string | null | undefined) => Promise<boolean>;

/**
 * Returns a resolver for one cron invocation. Call it per row (it caches per
 * org for the life of the invocation, so a loop over many rows of one org costs
 * one query). A canceled flip mid-run is not a concern at cron granularity.
 */
export function createOrgCanceledResolver(db: AnyClient): OrgCanceledResolver {
  const cache = new Map<string, boolean>();
  return async (orgId) => {
    if (!orgId) return false;
    const hit = cache.get(orgId);
    if (hit !== undefined) return hit;
    const { data, error } = await db.from("organizations").select("plan").eq("id", orgId).maybeSingle();
    if (error) return false;
    const canceled = (data as { plan?: string | null } | null)?.plan === "canceled";
    cache.set(orgId, canceled);
    return canceled;
  };
}

/** One-off check for callers that handle a single org. */
export async function isOrgCanceled(db: AnyClient, orgId: string | null | undefined): Promise<boolean> {
  return createOrgCanceledResolver(db)(orgId);
}
