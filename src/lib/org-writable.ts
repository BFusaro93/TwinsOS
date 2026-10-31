import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isOrgInactive, type OrgPlanRow } from "@/lib/orgs/org-canceled";

/**
 * Service-role routes bypass RLS, so they also bypass the RESTRICTIVE
 * `read_only_when_canceled_*` policies (20260926190000) that make a canceled
 * org read-only. Call this before any service-role WRITE made on behalf of an
 * org user. Same rule as my_org_is_read_only(): plan = 'canceled' or an expired trial (read-only
 * until canceled_access_ends_at, locked out after — writable in neither case).
 *
 * Billing routes must NOT call this: the org has to be able to resubscribe.
 *
 * Returns a 403 response to send back, or null when the org may write.
 */
export async function assertOrgWritable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any, any, any>,
  orgId: string
): Promise<NextResponse | null> {
  const { data, error } = await client
    .from("organizations")
    .select("plan, trial_ends_at, is_platform_staff_org")
    .eq("id", orgId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Could not verify subscription status" }, { status: 500 });
  }
  const org = data as OrgPlanRow | null;
  if (isOrgInactive(org)) {
    return NextResponse.json(
      {
        error:
          org?.plan === "trial"
            ? "Your free trial has ended — this account is read-only. Subscribe in Settings → Billing to make changes."
            : "Your subscription is canceled — this account is read-only. Resubscribe in Settings → Billing to make changes.",
      },
      { status: 403 }
    );
  }
  return null;
}
