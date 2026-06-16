import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUserStore } from "@/stores/current-user-store";
import { mapOrgUser } from "@/lib/supabase/mappers";

/**
 * Syncs the Zustand currentUser store with the authenticated Supabase session.
 * Call once near the top of the layout — subsequent renders are no-ops.
 *
 * Uses getSession() (reads from local cookie — zero network round-trip) rather
 * than getUser() (validates JWT via network request to Supabase Auth server).
 * The middleware already calls getUser() on every request, so by the time this
 * hook runs the session cookie is fresh and trusted.
 */
export function useSyncCurrentUser() {
  const { setCurrentUser } = useCurrentUserStore();

  useEffect(() => {
    const supabase = createClient();
    // getSession() reads from the cookie set by middleware — no extra network hop.
    supabase.auth.getSession().then(({ data: { session } }) => {
      const userId = session?.user?.id;
      if (!userId) return;
      supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single()
        .then(async ({ data }) => {
          if (!data) return;
          // If the profile is still marked "invited", the user has now signed in —
          // flip it to "active" so the Users page reflects their real status.
          if (data.status === "invited") {
            await supabase
              .from("profiles")
              .update({ status: "active" })
              .eq("id", userId);
            data = { ...data, status: "active" };
          }
          setCurrentUser(mapOrgUser(data));
        });
    });
  }, [setCurrentUser]);
}
