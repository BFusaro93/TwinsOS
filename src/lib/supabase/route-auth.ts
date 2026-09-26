import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { resolveCallerCrewId } from "@/lib/supabase/crew-id";

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
 * Resolves the crm_crews row the authenticated caller IS — see crew-id.ts
 * for the rules (no soft-deleted crews, oldest row wins, never throws on
 * duplicates). Re-exported here so existing route imports keep working.
 */
export { resolveCallerCrewId };

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
