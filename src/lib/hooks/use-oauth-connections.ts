import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface OAuthConnection {
  id: string;
  clientName: string;
  connectedByName: string | null;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
}

/** Lists the org's active OAuth connections (Settings > Connected Apps). */
export function useOAuthConnections() {
  return useQuery<OAuthConnection[]>({
    queryKey: ["oauth-connections"],
    queryFn: async () => {
      const res = await fetch("/api/settings/oauth-connections");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load connected apps");
      return data.connections as OAuthConnection[];
    },
  });
}

/** Disconnects an OAuth connection (revokes its tokens). */
export function useDisconnectOAuthConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/settings/oauth-connections/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oauth-connections"] });
    },
  });
}
