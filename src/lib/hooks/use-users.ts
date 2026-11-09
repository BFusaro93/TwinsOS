import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { mapOrgUser } from "@/lib/supabase/mappers";
import type { OrgUser } from "@/types";

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("profiles").select("*").order("name");
      if (error) throw error;
      return (data.map(mapOrgUser)) as OrgUser[];
    },
  });
}

export function useInviteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; name: string; role: string; crmRoleId?: string | null }) => {
      const res = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((body as { error?: string }).error ?? "Failed to invite user");
      }
      return body as { success: true; warning?: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      // A Landscapt role on the invite creates or links a crm_employees row.
      queryClient.invalidateQueries({ queryKey: ["crm-employees"] });
    },
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ role })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    // Say why: the DB refuses to demote the last active admin ("This is the
    // last active admin — promote another admin first"). Without this the
    // global handler showed a generic "could not be saved".
    onError: (err) => {
      const msg = (err as { message?: string } | null)?.message;
      toast.error(msg ? `Role not changed: ${msg}` : "Role not changed. Please try again.");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

/** Deactivates a login (and its linked employee record — see the route).
 *  `revokeApiKeys` also revokes the API keys the person created. */
export function useDeactivateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, revokeApiKeys = false }: { userId: string; revokeApiKeys?: boolean }) => {
      const res = await fetch(`/api/users/${userId}/deactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revokeApiKeys }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; warning?: string; revokedKeys?: number };
      if (!res.ok) throw new Error(body.error ?? "Failed to deactivate user");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["crm-employees"] });
      queryClient.invalidateQueries({ queryKey: ["crm-crews"] });
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["report-schedules"] });
    },
    // The caller shows the route's message (e.g. the last-active-admin guard).
    onError: () => {},
  });
}

export function useReactivateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/users/${userId}/reactivate`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string; warning?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to reactivate user");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["crm-employees"] });
      queryClient.invalidateQueries({ queryKey: ["crm-crews"] });
    },
    // The caller shows the route's message.
    onError: () => {},
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const res = await fetch(`/api/users/${userId}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Failed to reset password");
      }
    },
  });
}

export function useCreateCrewAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { teamName: string; password: string; customEmail?: string }) => {
      const res = await fetch("/api/users/create-crew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        throw new Error((body as { error?: string }).error ?? "Failed to create crew account");
      }
      return body as { success: true; loginEmail: string; crew: "created" | "linked" | "failed" };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["crm-crews"] });
      queryClient.invalidateQueries({ queryKey: ["crm-crew-logins"] });
    },
  });
}

/** Toggle photo_module_access for a user (admin only — enforced by RLS). */
export function useUpdatePhotoModuleAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, enabled }: { userId: string; enabled: boolean }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ photo_module_access: enabled } as any)
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
