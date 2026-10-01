import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createServiceClient } from "@/lib/supabase/server";
import PortalBillingPage from "@/components/portal/PortalBillingPage";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";

interface InvoiceRow {
  id: string;
  invoice_number: number;
  total_cents: number;
  balance_cents: number;
  amount_paid_cents: number;
  due_date: string | null;
  status: string;
  created_at: string;
}

export default async function BillingPage() {
  const ctx = await getPortalContext();
  if (!ctx) redirect("/portal/login");

  const supabase = createServiceClient();

  const cols = "id, invoice_number, total_cents, balance_cents, amount_paid_cents, due_date, status, created_at";
  // Recent history is capped, but anything still owing is always included —
  // otherwise a customer with 50+ newer invoices could not see (or pay) an
  // older unpaid one.
  const [recentRes, owingRes] = await Promise.all([
    supabase
      .from("crm_invoices")
      .select(cols)
      .eq("client_id", ctx.clientId)
      .eq("org_id", ctx.orgId)
      // Drafts are unfinished staff work — never shown to the customer.
      .neq("status", "draft")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50) as unknown as Promise<{ data: InvoiceRow[] | null; error: unknown }>,
    supabase
      .from("crm_invoices")
      .select(cols)
      .eq("client_id", ctx.clientId)
      .eq("org_id", ctx.orgId)
      .in("status", ["printed", "sent", "viewed", "partial", "overdue"])
      .gt("balance_cents", 0)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }) as unknown as Promise<{ data: InvoiceRow[] | null; error: unknown }>,
  ]);
  const error = recentRes.error ?? owingRes.error;
  const merged = new Map<string, InvoiceRow>();
  for (const inv of [...(recentRes.data ?? []), ...(owingRes.data ?? [])]) merged.set(inv.id, inv);
  const invoices = [...merged.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));

  if (error) console.error("[portal/billing]", error);

  // Past-due is judged on the service provider's calendar, like the rest of
  // the portal, not the server's UTC day or the viewer's.
  const today = todayInZone(await getOrgTimeZone(supabase, ctx.orgId));

  return <PortalBillingPage invoices={invoices ?? []} today={today} />;
}
