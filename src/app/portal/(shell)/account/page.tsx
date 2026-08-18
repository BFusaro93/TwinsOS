import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createServiceClient } from "@/lib/supabase/server";
import PortalAccountPage from "@/components/portal/PortalAccountPage";

export default async function AccountPage() {
  const ctx = await getPortalContext();
  if (!ctx) redirect("/portal/login");

  const supabase = createServiceClient();

  const [clientRes, contactsRes] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "display_name, first_name, last_name, primary_email, primary_phone, billing_address, billing_city, billing_state, billing_zip, saved_payment_method_type, saved_payment_method_summary"
      )
      .eq("id", ctx.clientId)
      .single(),

    supabase
      .from("client_contacts")
      .select("id, first_name, last_name, email, phone, contact_type")
      .eq("client_id", ctx.clientId)
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
  ]);

  return (
    <PortalAccountPage
      client={clientRes.data}
      email={ctx.email}
      contacts={contactsRes.data ?? []}
    />
  );
}
