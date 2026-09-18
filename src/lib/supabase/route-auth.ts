import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Authenticates a Route Handler request using EITHER the web app's cookie
 * session (via @supabase/ssr, the existing pattern) OR an `Authorization:
 * Bearer <access_token>` header (used by crew-app, the Expo mobile client,
 * which has no cookies to send).
 *
 * When a bearer token is present it takes priority and the returned Supabase
 * client has the token attached to every request (not just the initial
 * getUser() check) so RLS policies evaluate as that user for any subsequent
 * query — the same effect the cookie-based client gets from the session
 * cookie. Falls back to the cookie-based server client otherwise, so this is
 * additive and does not change the web app's existing auth path.
 */
export async function getRouteAuth(request: Request): Promise<{
  supabase: ReturnType<typeof createServerClient> | ReturnType<typeof createSupabaseClient>;
  user: User | null;
}> {
  const authHeader = request.headers.get("authorization") ?? request.headers.get("Authorization");
  const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
  const bearerToken = bearerMatch?.[1];

  if (bearerToken) {
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${bearerToken}` } } }
    );
    const { data: { user }, error } = await supabase.auth.getUser(bearerToken);
    return { supabase, user: error ? null : user };
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Resolves the crm_crews row the authenticated caller IS (crew accounts log
 * in as the crew itself — see crew/visits/route.ts), scoped to org so a
 * cross-org id can never match.
 *
 * Two things this deliberately does NOT do:
 *  - it doesn't match soft-deleted crews (`deleted_at IS NULL`), which is
 *    both the repo-wide query rule and the reason a retired crew's account
 *    can't keep acting on visits;
 *  - it doesn't use .maybeSingle(), which THROWS when more than one row
 *    comes back. The same auth user being attached to two crm_crews rows is
 *    a data problem, but it used to turn into a blanket 403 on every crew
 *    route (assertCallerOwnsVisit would see a rejected promise) with nothing
 *    in the response explaining why. Ordering by created_at and taking the
 *    first keeps the caller working on their original crew; ownership is
 *    still proven per-visit by assertCallerOwnsVisit below.
 */
export async function resolveCallerCrewId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  orgId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("crm_crews")
    .select("id")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1);
  const rows = (data ?? []) as { id: string }[];
  return rows[0]?.id ?? null;
}

/**
 * Guards the crew-facing visit-action routes (clock-in/out, photos,
 * requisitions) against one crew acting on another crew's visit. RLS on
 * crm_job_visits only checks org_id, not crew_id, so without this a caller
 * who ever gets hold of another crew's visitId (e.g. a stale id cached
 * before a mid-shift reassignment) could still clock in/out or upload
 * photos to it. Returns true and lets the caller proceed only when the
 * authenticated user resolves to the exact crew this visit is assigned to.
 */
export async function assertCallerOwnsVisit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  orgId: string,
  visitCrewId: string | null | undefined
): Promise<boolean> {
  const callerCrewId = await resolveCallerCrewId(supabase, userId, orgId);
  return !!callerCrewId && callerCrewId === visitCrewId;
}
