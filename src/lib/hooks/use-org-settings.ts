import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { CostMethod } from "@/lib/cost-methods";
import type { CompanyAddress } from "@/stores/settings-store";

export interface OrgSettingsData {
  id: string;
  slug: string;
  name: string;
  brandColor: string;
  address: CompanyAddress;
  taxRatePercent: number;
  costMethod: CostMethod;
  portalEnabled: boolean;
  customizations: Record<string, unknown>;
  googleMapsApiKey: string | null;
  accountNumberPrefix: string;
  accountNumberNext: number;
  accountNumberSuffix: string;
  defaultBillingTerms: string;
  defaultInvoiceFrequency: string;
  defaultInvoiceDelivery: string;
}

export interface UpdateOrgSettingsInput {
  name?: string;
  brandColor?: string;
  address?: Partial<CompanyAddress>;
  taxRatePercent?: number;
  costMethod?: CostMethod;
  portalEnabled?: boolean;
  customizations?: Record<string, unknown>;
  googleMapsApiKey?: string | null;
  accountNumberPrefix?: string;
  accountNumberNext?: number;
  accountNumberSuffix?: string;
  defaultBillingTerms?: string;
  defaultInvoiceFrequency?: string;
  defaultInvoiceDelivery?: string;
}

function mapOrgSettings(row: Record<string, unknown>): OrgSettingsData {
  const addr = (row.address as Partial<CompanyAddress>) ?? {};
  return {
    id: row.id as string,
    slug: (row.slug as string) ?? "",
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
    googleMapsApiKey: ((row.customizations as Record<string, unknown>)?.google_maps_api_key as string) ?? null,
    accountNumberPrefix: (row.account_number_prefix as string) ?? "",
    accountNumberNext: typeof row.account_number_next === "number" ? row.account_number_next : 1000,
    accountNumberSuffix: (row.account_number_suffix as string) ?? "",
    defaultBillingTerms: (row.default_billing_terms as string) ?? "due_on_receipt",
    defaultInvoiceFrequency: (row.default_invoice_frequency as string) ?? "daily",
    defaultInvoiceDelivery: (row.default_invoice_delivery as string) ?? "email",
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
        .select("id, slug, name, brand_color, address, tax_rate_percent, cost_method, portal_enabled, customizations, account_number_prefix, account_number_next, account_number_suffix, default_billing_terms, default_invoice_frequency, default_invoice_delivery")
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
    mutationFn: async (rawInput: UpdateOrgSettingsInput) => {
      let input = rawInput;
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
      if (input.accountNumberPrefix !== undefined) patch.account_number_prefix = input.accountNumberPrefix;
      if (input.accountNumberNext !== undefined)   patch.account_number_next   = input.accountNumberNext;
      if (input.accountNumberSuffix !== undefined) patch.account_number_suffix = input.accountNumberSuffix;
      if (input.defaultBillingTerms !== undefined)     patch.default_billing_terms     = input.defaultBillingTerms;
      if (input.defaultInvoiceFrequency !== undefined) patch.default_invoice_frequency = input.defaultInvoiceFrequency;
      if (input.defaultInvoiceDelivery !== undefined)  patch.default_invoice_delivery  = input.defaultInvoiceDelivery;

      // Merge customizations with existing values instead of replacing them
      if (input.googleMapsApiKey !== undefined) {
        // Store the API key inside customizations so no migration is needed
        input = {
          ...input,
          customizations: {
            ...(input.customizations ?? {}),
            google_maps_api_key: input.googleMapsApiKey ?? null,
          },
        };
      }

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
    onError: (err) => {
      // Surface to browser console so devs can see save failures even without a UI handler
      console.error("[useUpdateOrgSettings] save failed:", err);
    },
  });
}
