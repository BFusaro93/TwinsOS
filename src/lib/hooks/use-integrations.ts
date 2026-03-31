import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/types/supabase";

export interface Integration {
  id: string;
  orgId: string;
  provider: string;
  apiKey: string | null;
  config: Record<string, unknown>;
  enabled: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: "ok" | "error" | "partial" | null;
  createdAt: string;
  updatedAt: string;
}

function mapIntegration(row: Record<string, unknown>): Integration {
  return {
    id:               row.id as string,
    orgId:            row.org_id as string,
    provider:         row.provider as string,
    apiKey:           (row.api_key as string | null) ?? null,
    config:           (row.config as Record<string, unknown>) ?? {},
    enabled:          (row.enabled as boolean) ?? true,
    lastSyncAt:       (row.last_sync_at as string | null) ?? null,
    lastSyncStatus:   (row.last_sync_status as Integration["lastSyncStatus"]) ?? null,
    createdAt:        row.created_at as string,
    updatedAt:        row.updated_at as string,
  };
}

/** Fetch the integration row for the current org and a given provider. */
export function useIntegration(provider: string) {
  return useQuery<Integration | null>({
    queryKey: ["integrations", provider],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("integrations")
        .select("*")
        .eq("provider", provider)
        .maybeSingle();
      if (error) throw error;
      return data ? mapIntegration(data as Record<string, unknown>) : null;
    },
  });
}

/** Create or update the integration row for the current org and provider. */
export function useUpsertIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      provider,
      apiKey,
      config,
      enabled,
    }: {
      provider: string;
      apiKey?: string | null;
      config?: Record<string, unknown>;
      enabled?: boolean;
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();
      if (!profile) throw new Error("Profile not found");

      const { error } = await supabase
        .from("integrations")
        .upsert(
          {
            org_id:   profile.org_id,
            provider,
            ...(apiKey  !== undefined && { api_key: apiKey ?? null }),
            ...(config  !== undefined && { config: config as Json }),
            ...(enabled !== undefined && { enabled }),
          },
          { onConflict: "org_id,provider" }
        );
      if (error) throw error;
    },
    onSuccess: (_, { provider }) => {
      queryClient.invalidateQueries({ queryKey: ["integrations", provider] });
    },
  });
}
