"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface CurrentProfile {
  userId: string;
  orgId: string;
  role: string | null;
}

export const CURRENT_PROFILE_QUERY_KEY = ["current-profile"] as const;
const CURRENT_PROFILE_STALE_TIME = 5 * 60 * 1000;

async function fetchCurrentProfileRaw(): Promise<CurrentProfile | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single();
  if (error) throw error;

  return { userId: user.id, orgId: profile.org_id, role: profile.role ?? null };
}

/**
 * Single source of truth for "who is logged in / what org / what profile role".
 * Several independent hooks (permissions, module access, trial status, org
 * settings) each need this, and every one of them used to redo its own
 * auth.getUser() + profiles select. Routing them all through this cached
 * query (via useCurrentProfile or fetchCurrentProfile) collapses that into
 * one shared, deduped round trip.
 */
export function useCurrentProfile() {
  return useQuery({
    queryKey: CURRENT_PROFILE_QUERY_KEY,
    queryFn: fetchCurrentProfileRaw,
    staleTime: CURRENT_PROFILE_STALE_TIME,
  });
}

/**
 * For use inside another hook's queryFn (which can't call the useCurrentProfile
 * hook directly). queryClient.fetchQuery dedupes concurrent callers on the
 * same key and reuses the cached result within staleTime, same as the hook.
 */
export function fetchCurrentProfile(queryClient: QueryClient): Promise<CurrentProfile | null> {
  return queryClient.fetchQuery({
    queryKey: CURRENT_PROFILE_QUERY_KEY,
    queryFn: fetchCurrentProfileRaw,
    staleTime: CURRENT_PROFILE_STALE_TIME,
  });
}
