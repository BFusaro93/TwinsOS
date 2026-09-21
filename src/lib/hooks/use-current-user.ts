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

    async function syncFromUserId(userId: string) {
      // maybeSingle(), not single(): zero rows is a state to report on its
      // own terms, not a PostgREST error indistinguishable from a real
      // query failure.
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      // Unmounted (or signed out) mid-request: the pending fetch aborting is
      // expected, so bail before logging anything.
      if (cancelled) return;

      if (error) {
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
