import { redirect } from "next/navigation";
import { getPortalOrgChoices } from "@/lib/portal/get-portal-context";
import { createServiceClient } from "@/lib/supabase/server";
import { PortalOrgPicker } from "@/components/portal/PortalOrgPicker";

/**
 * Shown when a portal user has a client_portal_users row for more than one
 * org (a person who is a client of two different Landscapt-using
 * companies under the same email) and hasn't picked which one to view yet
 * — see src/lib/portal/get-portal-context.ts and the shell layout's
 * redirect logic.
 */
export default async function SelectOrgPage() {
  const choices = await getPortalOrgChoices();
  if (choices.length === 0) redirect("/portal/login");
  if (choices.length === 1) redirect("/portal"); // nothing to pick — getPortalContext() already resolves this alone

  const supabase = createServiceClient();
  const orgIds = [...new Set(choices.map((c) => c.org_id))];
  const clientIds = [...new Set(choices.map((c) => c.client_id))];

  const [{ data: orgs }, settingsRes, { data: clients }] = await Promise.all([
    supabase.from("organizations").select("id, name, brand_color").in("id", orgIds),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("client_portal_settings")
      .select("org_id, company_name, logo_url")
      .in("org_id", orgIds) as Promise<{ data: { org_id: string; company_name: string | null; logo_url: string | null }[] | null }>,
    supabase.from("clients").select("id, display_name").in("id", clientIds),
  ]);

  const options = choices.map((c) => {
    const org = orgs?.find((o) => o.id === c.org_id);
    const settings = (settingsRes.data ?? []).find((s) => s.org_id === c.org_id);
    const client = clients?.find((cl) => cl.id === c.client_id);
    return {
      orgId: c.org_id,
      companyName: settings?.company_name ?? org?.name ?? "Unknown Company",
      accentColor: org?.brand_color ?? "#60ab45",
      clientName: client?.display_name ?? null,
    };
  });

  return <PortalOrgPicker options={options} />;
}
