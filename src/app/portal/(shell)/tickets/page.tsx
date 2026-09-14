import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createServiceClient } from "@/lib/supabase/server";
import { getEffectiveTicketCategories } from "@/lib/portal/ticket-categories";
import PortalTicketsPage from "@/components/portal/PortalTicketsPage";
import type { PortalSettingsRow } from "@/lib/portal/portal-db";

interface TicketRow {
  id: string;
  ticket_number: number;
  subject: string | null;
  category: string | null;
  status: string;
  priority: string;
  created_at: string;
  body: string | null;
}

export default async function TicketsPage() {
  const ctx = await getPortalContext();
  if (!ctx) redirect("/portal/login");

  const supabase = createServiceClient();

  const [settingsRes, ticketsRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("client_portal_settings")
      .select("allow_tickets, portal_ticket_categories")
      .eq("org_id", ctx.orgId)
      .single() as Promise<{ data: Pick<PortalSettingsRow, "allow_tickets" | "portal_ticket_categories"> | null }>,

    supabase
      .from("crm_tickets")
      .select("id, ticket_number, subject, category, status, priority, created_at, body")
      .eq("client_id", ctx.clientId)
      .eq("org_id", ctx.orgId)
      .eq("visible_to_client", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const settings = settingsRes.data;

  // Only block if settings explicitly disable tickets; missing row = allowed
  if (settings !== null && settings?.allow_tickets === false) {
    redirect("/portal");
  }

  const categories = await getEffectiveTicketCategories(supabase, ctx.orgId, settings?.portal_ticket_categories);

  return (
    <PortalTicketsPage
      tickets={(ticketsRes.data ?? []) as TicketRow[]}
      categories={categories}
    />
  );
}
