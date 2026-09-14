import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUserStore } from "@/stores/current-user-store";
import { mapOrgUser } from "@/lib/supabase/mappers";
import { logger } from "@/lib/logger";

const log = logger.child("use-current-user");

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
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        log.error("failed to load profile for current user", { error, userId });
        return;
      }
      if (!data || cancelled) return;

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
      const userId = session?.user?.id;
      if (!userId) return;
      void syncFromUserId(userId);
    });

    // Re-sync on sign-in / token refresh so a session that wasn't hydrated yet
    // on first paint (or that changes later) doesn't leave the store stranded
    // on the placeholder.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user?.id;
      if (userId) void syncFromUserId(userId);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [setCurrentUser]);
}
