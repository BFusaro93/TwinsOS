import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createServiceClient } from "@/lib/supabase/server";
import PortalBillingPage from "@/components/portal/PortalBillingPage";

interface InvoiceRow {
  id: string;
  invoice_number: number;
  total_cents: number;
  balance_cents: number;
  amount_paid_cents: number;
  due_date: string;
  status: string;
  created_at: string;
}

export default async function BillingPage() {
  const ctx = await getPortalContext();
  if (!ctx) redirect("/portal/login");

  const supabase = createServiceClient();

  const { data: invoices, error } = await supabase
    .from("crm_invoices")
    .select("id, invoice_number, total_cents, balance_cents, amount_paid_cents, due_date, status, created_at")
    .eq("client_id", ctx.clientId)
    .eq("org_id", ctx.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50) as { data: InvoiceRow[] | null; error: unknown };

  if (error) console.error("[portal/billing]", error);

  return <PortalBillingPage invoices={invoices ?? []} />;
}
