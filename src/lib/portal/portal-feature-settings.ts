import { createServiceClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";

/** The portal toggles that gate payments and service visibility. A missing settings row
 *  means everything on and no limits — the same default the table's columns carry. */
export interface PortalFeatureSettings {
  allowAutopay: boolean;
  allowCardManagement: boolean;
  cardMaxPaymentCents: number | null;
  achMaxPaymentCents: number | null;
  showUpcomingServices: boolean;
  showServiceHistory: boolean;
}

export const PORTAL_FEATURE_DEFAULTS: PortalFeatureSettings = {
  allowAutopay: true,
  allowCardManagement: true,
  cardMaxPaymentCents: null,
  achMaxPaymentCents: null,
  showUpcomingServices: true,
  showServiceHistory: true,
};

interface FeatureRow {
  allow_autopay: boolean | null;
  allow_card_management: boolean | null;
  card_max_payment_cents: number | null;
  ach_max_payment_cents: number | null;
  show_upcoming_services: boolean | null;
  show_service_history: boolean | null;
}

export const PORTAL_FEATURE_COLUMNS =
  "allow_autopay, allow_card_management, card_max_payment_cents, ach_max_payment_cents, show_upcoming_services, show_service_history";

export function toPortalFeatureSettings(row: FeatureRow | null | undefined): PortalFeatureSettings {
  return {
    allowAutopay: row?.allow_autopay !== false,
    allowCardManagement: row?.allow_card_management !== false,
    cardMaxPaymentCents: row?.card_max_payment_cents ?? null,
    achMaxPaymentCents: row?.ach_max_payment_cents ?? null,
    showUpcomingServices: row?.show_upcoming_services !== false,
    showServiceHistory: row?.show_service_history !== false,
  };
}

/** Read with the service client — portal logins have no RLS path to client_portal_settings.
 *  `orgId` must be server-derived (the portal context), never a request value. */
export async function loadPortalFeatureSettings(orgId: string): Promise<PortalFeatureSettings> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (createServiceClient() as any)
    .from("client_portal_settings")
    .select(PORTAL_FEATURE_COLUMNS)
    .eq("org_id", orgId)
    .maybeSingle();
  return toPortalFeatureSettings(data as FeatureRow | null);
}

/** Refusal message when `amountCents` is over the org's per-payment ceiling for `method`, else null.
 *  The amount is the invoice balance / prepayment, before any card processing fee. */
export function portalPaymentLimitError(
  settings: PortalFeatureSettings,
  method: "card" | "us_bank_account",
  amountCents: number
): string | null {
  const limit = method === "card" ? settings.cardMaxPaymentCents : settings.achMaxPaymentCents;
  if (limit === null || amountCents <= limit) return null;
  const how = method === "card" ? "by card" : "by bank transfer";
  return `Online payments ${how} are limited to ${formatCurrency(limit)} each. Please make a smaller payment or contact us to arrange this one.`;
}
