import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimitPerMin: number;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

function mapApiKey(row: Record<string, unknown>): ApiKey {
  return {
    id: row.id as string,
    name: row.name as string,
    keyPrefix: row.key_prefix as string,
    scopes: (row.scopes as string[]) ?? [],
    rateLimitPerMin: row.rate_limit_per_min as number,
    lastUsedAt: (row.last_used_at as string | null) ?? null,
    revokedAt: (row.revoked_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

/** Lists the org's API keys (masked — never returns the plaintext key or its hash). */
export function useApiKeys() {
  return useQuery<ApiKey[]>({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const res = await fetch("/api/settings/api-keys");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load API keys");
      return (data.keys as Record<string, unknown>[]).map(mapApiKey);
    },
  });
}

/** Creates a new scoped API key. The plaintext key is only ever returned from this mutation's result. */
export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, scopes }: { name: string; scopes: string[] }) => {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scopes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create API key");
      return data as { id: string; name: string; key_prefix: string; scopes: string[]; createdAt: string; apiKey: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}

/** Revokes an API key. Revocation is immediate and cannot be undone from the UI. */
export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/settings/api-keys/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to revoke API key");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}
