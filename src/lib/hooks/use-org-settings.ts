import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { CostMethod } from "@/lib/cost-methods";
import type { CompanyAddress } from "@/stores/settings-store";

export interface OrgSettingsData {
  id: string;
  name: string;
  brandColor: string;
  address: CompanyAddress;
  taxRatePercent: number;
  costMethod: CostMethod;
  portalEnabled: boolean;
  customizations: Record<string, unknown>;
  samsaraApiKey: string | null;
  lastSamsaraSyncAt: string | null;
  lastSamsaraSyncStatus: "ok" | "error" | "partial" | null;
}

export interface UpdateOrgSettingsInput {
  name?: string;
  brandColor?: string;
  address?: Partial<CompanyAddress>;
  taxRatePercent?: number;
  costMethod?: CostMethod;
  portalEnabled?: boolean;
  customizations?: Record<string, unknown>;
  samsaraApiKey?: string | null;
}

function mapOrgSettings(row: Record<string, unknown>): OrgSettingsData {
  const addr = (row.address as Partial<CompanyAddress>) ?? {};
  return {
    id: row.id as string,
    name: row.name as string,
    brandColor: (row.brand_color as string) ?? "#60ab45",
    address: {
      street: addr.street ?? "",
      city: addr.city ?? "",
      state: addr.state ?? "",
      zip: addr.zip ?? "",
      phone: addr.phone ?? "",
    },
    taxRatePercent: typeof row.tax_rate_percent === "number" ? row.tax_rate_percent : 7,
    costMethod: (row.cost_method as CostMethod) ?? "manual",
    portalEnabled: typeof row.portal_enabled === "boolean" ? row.portal_enabled : true,
    customizations: (row.customizations as Record<string, unknown>) ?? {},
    samsaraApiKey: (row.samsara_api_key as string | null) ?? null,
    lastSamsaraSyncAt: (row.last_samsara_sync_at as string | null) ?? null,
    lastSamsaraSyncStatus: (row.last_samsara_sync_status as "ok" | "error" | "partial" | null) ?? null,
  };
}

export function useOrgSettings() {
  return useQuery<OrgSettingsData>({
    queryKey: ["org-settings"],
    queryFn: async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();
      if (profileErr) throw profileErr;

      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, brand_color, address, tax_rate_percent, cost_method, portal_enabled, customizations, samsara_api_key, last_samsara_sync_at, last_samsara_sync_status")
        .eq("id", profile.org_id)
        .single();
      if (error) throw error;
      return mapOrgSettings(data as unknown as Record<string, unknown>);
    },
  });
}

export function useUpdateOrgSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateOrgSettingsInput) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();
      if (profileErr) throw profileErr;

      const patch: Record<string, unknown> = {};
      if (input.name !== undefined)          patch.name             = input.name;
      if (input.brandColor !== undefined)    patch.brand_color      = input.brandColor;
      if (input.address !== undefined)       patch.address          = input.address;
      if (input.taxRatePercent !== undefined) patch.tax_rate_percent = input.taxRatePercent;
      if (input.costMethod !== undefined)    patch.cost_method      = input.costMethod;
      if (input.portalEnabled !== undefined)  patch.portal_enabled   = input.portalEnabled;
      if (input.samsaraApiKey !== undefined)  patch.samsara_api_key  = input.samsaraApiKey ?? null;

      // Merge customizations with existing values instead of replacing them
      if (input.customizations !== undefined) {
        const { data: existing } = await supabase
          .from("organizations")
          .select("customizations")
          .eq("id", profile.org_id)
          .single();
        const prev = (existing?.customizations as Record<string, unknown>) ?? {};
        patch.customizations = { ...prev, ...input.customizations };
      }

      const { error } = await supabase
        .from("organizations")
        .update(patch)
        .eq("id", profile.org_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-settings"] });
    },
  });
}
