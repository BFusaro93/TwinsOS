import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUserStore } from "@/stores/current-user-store";
import { mapOrgUser } from "@/lib/supabase/mappers";

/**
 * Syncs the Zustand currentUser store with the authenticated Supabase session.
 * Call once near the top of the layout — subsequent renders are no-ops.
 */
export function useSyncCurrentUser() {
  const { setCurrentUser } = useCurrentUserStore();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data) setCurrentUser(mapOrgUser(data));
        });
    });
  }, [setCurrentUser]);
}
