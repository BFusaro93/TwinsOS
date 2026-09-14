import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** The org's configured non-admin roles allowed to grant write access via
 * the OAuth sign-in flow (Settings > Public API Keys > OAuth Write Access). */
export function useOAuthWriteRoles() {
  return useQuery<string[]>({
    queryKey: ["oauth-write-roles"],
    queryFn: async () => {
      const res = await fetch("/api/settings/oauth-write-roles");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load OAuth write-access settings");
      return data.roles as string[];
    },
  });
}

export function useSetOAuthWriteRoles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (roles: string[]) => {
      const res = await fetch("/api/settings/oauth-write-roles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update OAuth write-access settings");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oauth-write-roles"] });
    },
  });
}
