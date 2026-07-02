import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createServiceClient } from "@/lib/supabase/server";
import PortalShell from "@/components/portal/PortalShell";
import type { PortalSettingsRow } from "@/lib/portal/portal-db";

export default async function PortalShellLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getPortalContext();
  if (!ctx) redirect("/portal/login");

  const supabase = createServiceClient();

  const [{ data: client }, settingsRes, orgRes] = await Promise.all([
    supabase
      .from("clients")
      .select("display_name, first_name")
      .eq("id", ctx.clientId)
      .single(),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("client_portal_settings")
      .select("company_name, logo_url, accent_color, support_email, support_phone, allow_tickets, allow_estimates")
      .eq("org_id", ctx.orgId)
      .single() as Promise<{ data: Pick<PortalSettingsRow, "company_name" | "logo_url" | "accent_color" | "support_email" | "support_phone" | "allow_tickets" | "allow_estimates"> | null }>,

    supabase
      .from("organizations")
      .select("name, brand_color")
      .eq("id", ctx.orgId)
      .single(),
  ]);

  const settings = settingsRes.data;
  const org = orgRes.data;

  const branding = {
    companyName: settings?.company_name ?? org?.name ?? "Your Service Provider",
    logoUrl: settings?.logo_url ?? null,
    accentColor: settings?.accent_color ?? org?.brand_color ?? "#60ab45",
    supportEmail: settings?.support_email ?? null,
    supportPhone: settings?.support_phone ?? null,
    allowTickets: settings?.allow_tickets !== false,
    allowEstimates: settings?.allow_estimates !== false,
  };

  const clientName = client?.first_name ?? client?.display_name ?? "there";

  return (
    <PortalShell branding={branding} clientName={clientName}>
      {children}
    </PortalShell>
  );
}
