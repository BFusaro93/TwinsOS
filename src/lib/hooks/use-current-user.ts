import { useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUserStore } from "@/stores/current-user-store";
import { mapOrgUser } from "@/lib/supabase/mappers";
import { logger } from "@/lib/logger";

const log = logger.child("use-current-user");

/**
 * Client-portal accounts are tagged with `user_metadata.portal` by
 * /api/portal/register and deliberately have NO `profiles` row — they are
 * clients, not org members. The middleware now bounces a profile-less
 * session out of every staff area, but it cannot help a page that is
 * ALREADY rendered: a portal sign-in in one tab broadcasts its session
 * through onAuthStateChange to every other tab of the same browser,
 * including one left open on a staff page. That is what sent a bogus
 * "failed to load profile for current user" to Sentry from
 * /crm/clients/:clientId the moment a client registered — so skip the
 * lookup here too.
 *
 * Only a hint, never a gate: /api/portal/register links an invite to an
 * EXISTING auth user when the email is already registered, and that user's
 * metadata may carry no `portal` flag at all. Those sessions fall through
 * to the zero-row branch below, which is why it no longer reports an error.
 */
function isPortalSession(user: User | null | undefined): boolean {
  return user?.user_metadata?.portal === true;
}

/**
 * postgrest-js reports a fetch that never reached Supabase (no signal, a
 * backgrounded iOS tab resuming, a request aborted mid-navigation) as an
 * ordinary `{ error }` with an empty code and a "TypeError: Load failed" /
 * "Failed to fetch" message — not a thrown exception. Crew open /crm/crew on
 * phones in the field, so this is routine there and says nothing about the
 * account or its RLS access.
 */
function isTransientNetworkError(error: { message?: string; code?: string }): boolean {
  return !error.code && /load failed|failed to fetch|networkerror|network request failed/i.test(error.message ?? "");
}

/**
 * A 401 on this request is almost always a refresh race, not a bad session:
 * supabase-js fired it with an access token that expired moments earlier and
 * the refresh landed right after (PROD edge logs show the 401 followed by a
 * 200 for the same user within half a second). PostgREST reports that as
 * PGRST301 "JWT expired"; the gateway's own rejection says "Invalid JWT" with
 * no code. Either way onAuthStateChange(TOKEN_REFRESHED) re-runs the sync, so
 * there is nothing to retry here and nothing for Sentry to act on.
 */
function isExpiredTokenError(error: { message?: string; code?: string }): boolean {
  if (error.code === "PGRST301" || error.code === "PGRST302" || error.code === "PGRST303") return true;
  return !error.code && /\bjwt\b/i.test(error.message ?? "");
}

const NETWORK_RETRY_DELAY_MS = 1500;

/**
 * Syncs the Zustand currentUser store with the authenticated Supabase session.
 * Call once near the top of the layout — subsequent renders are no-ops.
 *
 * Uses getSession() (reads from local cookie — zero network round-trip) rather
 * than getUser() (validates JWT via network request to Supabase Auth server).
 * The middleware already calls getUser() on every request, so by the time this
 * hook runs the session cookie is fresh and trusted.
 *
 * Also subscribes to onAuthStateChange so the store re-syncs after a token
 * refresh or sign-in that happens after mount — without this, a session that
 * isn't hydrated yet on first paint (or a profile fetch that errors, e.g. RLS
 * denying the row) left the sidebar stuck on the "Loading…" / "viewer"
 * placeholder forever, since the one-shot effect never re-ran and neither
 * failure path was even logged.
 */
export function useSyncCurrentUser() {
  const { setCurrentUser } = useCurrentUserStore();

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    // getSession() and the INITIAL_SESSION auth event both resolve on mount,
    // so without this the profile is fetched twice back to back (and a 401
    // from a refresh race was reported twice). Safe to drop the duplicate:
    // loadProfile handles the refresh race itself rather than relying on the
    // TOKEN_REFRESHED event that this guard might swallow.
    let inFlightUserId: string | null = null;

    async function syncFromUserId(userId: string) {
      if (inFlightUserId === userId) return;
      inFlightUserId = userId;
      try {
        await loadProfile(userId);
      } finally {
        if (inFlightUserId === userId) inFlightUserId = null;
      }
    }

    async function loadProfile(userId: string) {
      // maybeSingle(), not single(): zero rows is a state to report on its
      // own terms, not a PostgREST error indistinguishable from a real
      // query failure.
      const fetchProfile = () =>
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

      let { data, error } = await fetchProfile();

      // One quiet retry for a dropped connection before treating it as a failure.
      if (error && isTransientNetworkError(error) && !cancelled) {
        await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_DELAY_MS));
        if (cancelled) return;
        ({ data, error } = await fetchProfile());
      }

      // Expired token: the refresh is already under way (supabase-js starts
      // it the moment it sees the expiry), and getSession() waits on that
      // in-flight refresh, so one retry after it lands has the new token. Done
      // here rather than left to onAuthStateChange(TOKEN_REFRESHED), because
      // that event can fire while this request is still pending, and the
      // in-flight guard in syncFromUserId would then drop it.
      if (error && isExpiredTokenError(error) && !cancelled) {
        await supabase.auth.getSession();
        if (cancelled) return;
        ({ data, error } = await fetchProfile());
      }

      // Unmounted (or signed out) mid-request: the pending fetch aborting is
      // expected, so bail before logging anything.
      if (cancelled) return;

      if (error) {
        // Still offline after the retry: warn, not error. The store stays on
        // its placeholder until the next auth event (token refresh, tab focus)
        // re-runs the sync, so there is nothing for Sentry to act on.
        if (isTransientNetworkError(error)) {
          log.warn("profile lookup failed: network unreachable", { error, userId });
          return;
        }
        // Still 401 after the refresh landed: the session itself is dead
        // (revoked, signed out elsewhere) and the middleware will bounce the
        // next navigation. Not a profile problem, so not an error.
        if (isExpiredTokenError(error)) {
          log.warn("profile lookup unauthorized after token refresh", { error, userId });
          return;
        }
        log.error("failed to load profile for current user", { error, userId });
        return;
      }
      if (!data) {
        // Either a portal account whose metadata lacks the flag, or a staff
        // account whose profile row never got created. warn, not error: the
        // first is routine, and the second is already loud without Sentry —
        // the middleware redirects a profile-less session off every staff
        // route, so that user cannot reach a screen this hook feeds.
        log.warn("no profile row for current user", { userId });
        return;
      }

      let profile = data;
      // If the profile is still marked "invited", the user has now signed in —
      // flip it to "active" so the Users page reflects their real status.
      if (profile.status === "invited") {
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ status: "active" })
          .eq("id", userId);
        if (updateError) {
          log.error("failed to flip invited profile to active", { error: updateError, userId });
        } else {
          profile = { ...profile, status: "active" };
        }
      }
      if (!cancelled) setCurrentUser(mapOrgUser(profile));
    }

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        log.error("failed to read session", { error });
        return;
      }
      const user = session?.user;
      if (!user || isPortalSession(user)) return;
      void syncFromUserId(user.id);
    });

    // Re-sync on sign-in / token refresh so a session that wasn't hydrated yet
    // on first paint (or that changes later) doesn't leave the store stranded
    // on the placeholder.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      if (!user || isPortalSession(user)) return;
      void syncFromUserId(user.id);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [setCurrentUser]);
}
