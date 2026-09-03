import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface SmsRegistrationBusinessInfo {
  legal_business_name: string;
  ein: string;
  business_type: "sole_proprietorship" | "partnership" | "llc" | "corporation" | "nonprofit";
  business_industry: string;
  business_website: string;
  business_address: { street: string; city: string; region: string; postal_code: string; iso_country: string };
  business_regions_of_operation: "usa_and_canada" | "usa_only";
  contact_first_name: string;
  contact_last_name: string;
  contact_email: string;
  contact_phone: string;
  support_email: string;
  support_phone: string;
  opt_in_website_url: string;
  opt_in_checkbox_label: string;
  verbal_opt_in_script: string;
}

export type SmsRegistrationStatus =
  | "not_started"
  | "subaccount_created"
  | "profile_submitted"
  | "profile_approved"
  | "profile_rejected"
  | "brand_submitted"
  | "brand_approved"
  | "brand_rejected"
  | "number_provisioned"
  | "campaign_submitted"
  | "campaign_approved"
  | "campaign_rejected"
  | "complete";

export interface SmsRegistration extends Partial<SmsRegistrationBusinessInfo> {
  status: SmsRegistrationStatus;
  twilio_phone_number: string | null;
  twilio_brand_failure_reason: string | null;
  twilio_campaign_failure_reason: string | null;
  last_synced_at: string | null;
}

const QUERY_KEY = ["sms-onboarding"];

export function useSmsRegistration() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<SmsRegistration | null> => {
      const res = await fetch("/api/sms-onboarding");
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to load");
      const { registration } = await res.json();
      return registration;
    },
  });
}

export function useSaveSmsBusinessInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (info: SmsRegistrationBusinessInfo) => {
      const res = await fetch("/api/sms-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(info),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to save");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useAdvanceSmsProvisioning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/sms-onboarding/provision", { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Provisioning step failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useCheckSmsStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/sms-onboarding/check-status", { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Status check failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
