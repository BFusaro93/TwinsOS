import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchCurrentProfile } from "@/lib/hooks/use-current-profile";
import type { CostMethod } from "@/lib/cost-methods";
import type { CompanyAddress } from "@/stores/settings-store";
import { coerceTimeZone } from "@/lib/time/zone";

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
  /** Where client replies land — see lib/email/reply-to.ts. Null until set. */
  replyToEmail: string | null;
  accountNumberPrefix: string;
  accountNumberNext: number;
  accountNumberSuffix: string;
  defaultBillingTerms: string;
  defaultInvoiceFrequency: string;
  defaultInvoiceDelivery: string;
  ccProcessingFeeEnabled: boolean;
  ccProcessingFeePercent: number;
  ccProcessingFeeThresholdDollars: number;
  achPaymentsEnabled: boolean;
  crewHidePricing: boolean;
  /** IANA name. The org's operating clock — what "today" and "this service
   *  day" mean for every user, regardless of where they're sitting. */
  timezone: string;
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
  replyToEmail?: string | null;
  accountNumberPrefix?: string;
  accountNumberNext?: number;
  accountNumberSuffix?: string;
  defaultBillingTerms?: string;
  defaultInvoiceFrequency?: string;
  defaultInvoiceDelivery?: string;
  ccProcessingFeeEnabled?: boolean;
  ccProcessingFeePercent?: number;
  ccProcessingFeeThresholdDollars?: number;
  achPaymentsEnabled?: boolean;
  crewHidePricing?: boolean;
  timezone?: string;
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
    replyToEmail: ((row.customizations as Record<string, unknown>)?.reply_to_email as string) ?? null,
    accountNumberPrefix: (row.account_number_prefix as string) ?? "",
    accountNumberNext: typeof row.account_number_next === "number" ? row.account_number_next : 1000,
    accountNumberSuffix: (row.account_number_suffix as string) ?? "",
    defaultBillingTerms: (row.default_billing_terms as string) ?? "due_on_receipt",
    defaultInvoiceFrequency: (row.default_invoice_frequency as string) ?? "daily",
    defaultInvoiceDelivery: (row.default_invoice_delivery as string) ?? "email",
    ccProcessingFeeEnabled: typeof row.cc_processing_fee_enabled === "boolean" ? row.cc_processing_fee_enabled : true,
    ccProcessingFeePercent: typeof row.cc_processing_fee_bps === "number" ? row.cc_processing_fee_bps / 100 : 3.5,
    ccProcessingFeeThresholdDollars:
      typeof row.cc_processing_fee_threshold_cents === "number" ? row.cc_processing_fee_threshold_cents / 100 : 500,
    achPaymentsEnabled: typeof row.ach_payments_enabled === "boolean" ? row.ach_payments_enabled : false,
    crewHidePricing: typeof row.crew_hide_pricing === "boolean" ? row.crew_hide_pricing : false,
    // coerce, don't trust: an org row predating the column reads back null,
    // and the whole point of this value is that nothing downstream has to
    // second-guess it.
    timezone: coerceTimeZone(row.timezone as string | null | undefined),
  };
}

async function fetchOrgSettings(queryClient: QueryClient): Promise<OrgSettingsData> {
  const profile = await fetchCurrentProfile(queryClient);
  if (!profile) throw new Error("Not authenticated");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, slug, name, brand_color, address, tax_rate_percent, cost_method, portal_enabled, customizations, account_number_prefix, account_number_next, account_number_suffix, default_billing_terms, default_invoice_frequency, default_invoice_delivery, cc_processing_fee_enabled, cc_processing_fee_bps, cc_processing_fee_threshold_cents, ach_payments_enabled, crew_hide_pricing, timezone")
    .eq("id", profile.orgId)
    .single();
  if (error) throw error;
  return mapOrgSettings(data as unknown as Record<string, unknown>);
}

export function useOrgSettings() {
  const queryClient = useQueryClient();
  return useQuery<OrgSettingsData>({
    queryKey: ["org-settings"],
    queryFn: () => fetchOrgSettings(queryClient),
  });
}

export function useUpdateOrgSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rawInput: UpdateOrgSettingsInput) => {
      let input = rawInput;
      const profile = await fetchCurrentProfile(queryClient);
      if (!profile) throw new Error("Not authenticated");
      const supabase = createClient();

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
      if (input.ccProcessingFeeEnabled !== undefined) patch.cc_processing_fee_enabled = input.ccProcessingFeeEnabled;
      if (input.ccProcessingFeePercent !== undefined) patch.cc_processing_fee_bps = Math.round(input.ccProcessingFeePercent * 100);
      if (input.ccProcessingFeeThresholdDollars !== undefined)
        patch.cc_processing_fee_threshold_cents = Math.round(input.ccProcessingFeeThresholdDollars * 100);
      if (input.achPaymentsEnabled !== undefined) patch.ach_payments_enabled = input.achPaymentsEnabled;
      if (input.crewHidePricing !== undefined) patch.crew_hide_pricing = input.crewHidePricing;
      if (input.timezone !== undefined) patch.timezone = input.timezone;

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

      // Same reasoning as the Maps key above: lives in customizations, so no
      // migration and no schema churn for a single optional address.
      if (input.replyToEmail !== undefined) {
        input = {
          ...input,
          customizations: {
            ...(input.customizations ?? {}),
            reply_to_email: input.replyToEmail?.trim() || null,
          },
        };
      }

      if (input.customizations !== undefined) {
        const { data: existing } = await supabase
          .from("organizations")
          .select("customizations")
          .eq("id", profile.orgId)
          .single();
        const prev = (existing?.customizations as Record<string, unknown>) ?? {};
        patch.customizations = { ...prev, ...input.customizations };
      }

      // RLS (settings_permission_update_org) silently filters the row out for
      // a user without company_settings/crm_settings — PostgREST then reports
      // success with zero rows and the UI used to toast "saved" while nothing
      // changed (D-20: Google Maps key "saved" but badge stayed Not Connected).
      // Select the updated row back so a blocked write is a real error.
      const { data: updated, error } = await supabase
        .from("organizations")
        // `as never`: postgrest rejects excess properties on a dynamically-built patch.
        .update(patch as never)
        .eq("id", profile.orgId)
        .select("id");
      if (error) throw error;
      if (!updated || updated.length === 0) {
        throw new Error("Save was blocked — you don't have permission to change organization settings.");
      }
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ["org-settings"] });
      // Changing the clock changes what "today" is, so every cached list that
      // was filtered or defaulted by a date is now potentially off by a day.
      if (input.timezone !== undefined) queryClient.invalidateQueries();
    },
    onError: (err) => {
      // Surface to browser console so devs can see save failures even without a UI handler
      console.error("[useUpdateOrgSettings] save failed:", err);
    },
  });
}
