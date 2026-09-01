import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export function useIsStaff() {
  return useQuery({
    queryKey: ["is-staff"],
    queryFn: async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { data, error } = await supabase.rpc("is_staff", { uid: user.id });
      if (error) throw error;
      return data ?? false;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export interface ActiveImpersonationSession {
  id: string;
  targetOrgId: string;
  targetOrgName: string;
  reason: string | null;
  startedAt: string;
  expiresAt: string;
}

export function useActiveImpersonationSession() {
  return useQuery({
    queryKey: ["active-impersonation-session"],
    queryFn: async (): Promise<ActiveImpersonationSession | null> => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: session, error } = await supabase
        .from("staff_impersonation_sessions")
        .select("id, target_org_id, reason, started_at, expires_at")
        .eq("staff_user_id", user.id)
        .is("ended_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!session) return null;

      // Once a session is active, my_org_id() resolves to the target org, so
      // this normally-org-scoped read naturally succeeds for exactly that org.
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", session.target_org_id)
        .maybeSingle();

      return {
        id: session.id,
        targetOrgId: session.target_org_id,
        targetOrgName: org?.name ?? "Unknown org",
        reason: session.reason,
        startedAt: session.started_at,
        expiresAt: session.expires_at,
      };
    },
    // Poll — the grant self-expires server-side, and other reads across the
    // app key off my_org_id() which flips the moment expires_at passes.
    refetchInterval: 30 * 1000,
  });
}

export function useStaffOrgList(enabled: boolean) {
  return useQuery({
    queryKey: ["staff-org-list"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("list_organizations_for_staff");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
    enabled,
  });
}

export function useStartImpersonation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { targetOrgId: string; reason: string }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { error } = await supabase.from("staff_impersonation_sessions").insert({
        staff_user_id: user.id,
        target_org_id: input.targetOrgId,
        reason: input.reason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // Every org-scoped query in the app needs to re-run against the new
      // my_org_id() resolution — simplest correct thing is to drop it all.
      queryClient.invalidateQueries();
    },
  });
}

export function useEndImpersonation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("staff_impersonation_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
}
