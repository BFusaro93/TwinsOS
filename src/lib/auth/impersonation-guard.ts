import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Routes that act with the service role against `profiles.org_id` (the
 * caller's HOME org) must refuse while a staff impersonation grant is active:
 * RLS-backed reads see the impersonated tenant (my_org_id() override) but
 * these routes would silently write into the staff member's own org instead.
 *
 * staff_impersonation_sessions is RLS-limited to the staff user's own rows, so
 * for anyone else this query returns nothing.
 * Returns a 409 response when an active grant exists, otherwise null.
 */
export async function rejectIfImpersonating(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  action = "managing users"
): Promise<NextResponse | null> {
  const { data, error } = await supabase
    .from("staff_impersonation_sessions")
    .select("id")
    .eq("staff_user_id", userId)
    .is("ended_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  if (error) return null; // non-staff / unreadable: no grant to worry about
  if (data && data.length > 0) {
    return NextResponse.json(
      { error: `End your impersonation session before ${action}. This action would apply to your own organization, not the one you are viewing.` },
      { status: 409 }
    );
  }
  return null;
}

/**
 * The org a staff member is currently impersonating, or null. Only a staff
 * member can have a row in staff_impersonation_sessions (RLS), so a non-null
 * result is itself proof the caller is staff with a live grant.
 */
export async function getActiveImpersonationOrg(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("staff_impersonation_sessions")
    .select("target_org_id")
    .eq("staff_user_id", userId)
    .is("ended_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("started_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return (data[0] as { target_org_id: string }).target_org_id;
}
