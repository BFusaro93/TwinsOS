import { redirect } from "next/navigation";
import { getPortalContext, getPortalOrgChoices } from "@/lib/portal/get-portal-context";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import PortalShell from "@/components/portal/PortalShell";
import type { PortalSettingsRow } from "@/lib/portal/portal-db";

export default async function PortalShellLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getPortalContext();
  if (!ctx) {
    // null means either "not a portal user at all" or "portal user with
    // more than one org and no active-org cookie yet" — tell those apart
    // so someone who's a client of two Landscapt orgs gets sent to pick
    // one instead of bouncing to a login screen they're already past.
    const choices = await getPortalOrgChoices();
    if (choices.length > 1) redirect("/portal/select-org");
    // A signed-in user with no live portal link (access reset, client deleted, add-on gone)
    // used to bounce between the login form and here with no explanation.
    // Only a real (former) portal login gets the revoked notice — which also signs it out. A
    // staff session that opens /portal must not be signed out of the office app.
    const { data: { user } } = await (await createClient()).auth.getUser();
    let wasPortalUser = !!user?.user_metadata?.portal;
    if (user && !wasPortalUser) {
      const { count } = await createServiceClient()
        .from("client_portal_users")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      wasPortalUser = (count ?? 0) > 0;
    }
    redirect(wasPortalUser ? "/portal/login?reason=revoked" : "/portal/login");
  }

  const supabase = createServiceClient();

  const [{ data: client }, settingsRes, orgRes] = await Promise.all([
    supabase
      .from("clients")
      .select("display_name, first_name")
      .eq("id", ctx.clientId)
      .eq("org_id", ctx.orgId)
      .single(),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("client_portal_settings")
      .select("company_name, logo_url, accent_color, support_email, support_phone, allow_tickets, allow_estimates, allow_documents")
      .eq("org_id", ctx.orgId)
      .single() as Promise<{ data: Pick<PortalSettingsRow, "company_name" | "logo_url" | "accent_color" | "support_email" | "support_phone" | "allow_tickets" | "allow_estimates" | "allow_documents"> | null }>,

    supabase
      .from("organizations")
      .select("name, brand_color, customizations")
      .eq("id", ctx.orgId)
      .single(),
  ]);

  const settings = settingsRes.data;
  const org = orgRes.data;

  const branding = {
    companyName: settings?.company_name ?? org?.name ?? "Your Service Provider",
    // Fall back to the org's own logo (Settings > Branding, stored in
    // organizations.customizations.logoDataUrl) when no portal-specific logo
    // is set. Without this an org that has uploaded a logo still shows the
    // first-letter placeholder in the portal, because client_portal_settings
    // .logo_url is a separate, usually-empty field.
    logoUrl:
      settings?.logo_url ??
      ((org?.customizations as Record<string, unknown> | null)?.logoDataUrl as string | undefined) ??
      null,
    accentColor: settings?.accent_color ?? org?.brand_color ?? "#60ab45",
    supportEmail: settings?.support_email ?? null,
    supportPhone: settings?.support_phone ?? null,
    allowTickets: settings?.allow_tickets !== false,
    allowEstimates: settings?.allow_estimates !== false,
    allowDocuments: settings?.allow_documents !== false,
  };

  const clientName = client?.first_name ?? client?.display_name ?? "there";

  return (
    <PortalShell branding={branding} clientName={clientName}>
      {children}
    </PortalShell>
  );
}
