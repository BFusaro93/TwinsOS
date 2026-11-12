import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isOrgInactive, type OrgPlanRow } from "@/lib/orgs/org-canceled";
import { createServiceClient } from "@/lib/supabase/server";

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
            ? "Your free trial has ended — this account is read-only. Subscribe in Settings → Subscription to make changes. (You can still email invoices that were already sent, and account statements.)"
            : "Your subscription is canceled — this account is read-only. Resubscribe in Settings → Subscription to make changes. (You can still email invoices that were already sent, and account statements.)",
      },
      { status: 403 }
    );
  }
  return null;
}

/**
 * True when the org is read-only (canceled, or a trial that has ended) — the
 * same rule as assertOrgWritable, for routes that stay open in read-only mode
 * but must behave differently there (the collections sends: an already-issued
 * invoice, an account statement). Uses the service client for the lookup and
 * fails CLOSED (read-only) on an error: the read-only branch of those routes
 * refuses drafts and writes its bookkeeping with the service client, which is
 * also correct for a writable org.
 */
export async function isOrgReadOnly(orgId: string): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("organizations")
    .select("plan, trial_ends_at, is_platform_staff_org")
    .eq("id", orgId)
    .maybeSingle();
  if (error) return true;
  return isOrgInactive(data as OrgPlanRow | null);
}

/** Read-only access lasts this long after a trial ends or a subscription is canceled (billing webhook, useTrialStatus). */
const READ_ONLY_ACCESS_MS = 90 * 24 * 60 * 60 * 1000;
/** How long after going read-only a crew may still END its day (close open shifts). */
const CREW_CLOSE_OUT_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * True while an org that just went read-only is inside its crew close-out
 * window: the first 24 hours after the trial ended / the subscription was
 * canceled. A crew that was on the clock at that moment can still tap End Day
 * so its open shifts close at the real time instead of staying open for
 * payroll to untangle. Nothing else is allowed — no new clock-ins or jobs.
 * Fails closed (false) on a lookup error.
 */
export async function inCrewCloseOutGrace(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any, any, any>,
  orgId: string
): Promise<boolean> {
  const { data, error } = await client
    .from("organizations")
    .select("plan, trial_ends_at, canceled_access_ends_at")
    .eq("id", orgId)
    .maybeSingle();
  if (error || !data) return false;
  const row = data as { plan: string | null; trial_ends_at: string | null; canceled_access_ends_at: string | null };
  let since: number | null = null;
  if (row.plan === "canceled" && row.canceled_access_ends_at) {
    since = new Date(row.canceled_access_ends_at).getTime() - READ_ONLY_ACCESS_MS;
  } else if (row.plan === "trial" && row.trial_ends_at) {
    since = new Date(row.trial_ends_at).getTime();
  }
  if (since == null || Number.isNaN(since)) return false;
  const elapsed = Date.now() - since;
  return elapsed >= 0 && elapsed < CREW_CLOSE_OUT_GRACE_MS;
}
