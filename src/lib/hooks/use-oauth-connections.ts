import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";

export interface OAuthConnection {
  id: string;
  clientName: string;
  connectedByName: string | null;
  /** Profile id of the person who connected the app. */
  connectedByUserId: string | null;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
}

/** Lists the org's active OAuth connections (Settings > Connected Apps). */
export function useOAuthConnections(options: { enabled?: boolean } = {}) {
  return useQuery<OAuthConnection[]>({
    enabled: options.enabled ?? true,
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
