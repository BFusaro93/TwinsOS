import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createClient } from "@/lib/supabase/server";
import PortalDashboard from "@/components/portal/PortalDashboard";

interface EstimateRow {
  id: string;
  estimate_number: string;
  title: string | null;
  total_price_cents: number;
  status: string;
  expires_at: string | null;
}

export default async function PortalHomePage() {
  const ctx = await getPortalContext();
  if (!ctx) redirect("/portal/login");

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const [clientRes, invoicesRes, visitsRes, estimatesRes] = await Promise.all([
    supabase
      .from("clients")
      .select("display_name, first_name, balance_outstanding_cents, balance_credits_cents")
      .eq("id", ctx.clientId)
      .single(),

    supabase
      .from("crm_invoices")
      .select("id, invoice_number, total_cents, balance_cents, due_date, status")
      .eq("client_id", ctx.clientId)
      .eq("org_id", ctx.orgId)
      .in("status", ["printed", "sent", "partial", "overdue"])
      .is("deleted_at", null)
      .order("due_date", { ascending: true })
      .limit(5),

    supabase
      .from("crm_job_visits")
      .select("id, scheduled_date, status, job_id, crm_jobs(invoice_description, job_type)")
      .eq("client_id", ctx.clientId)
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null)
      .gte("scheduled_date", today)
      .neq("status", "cancelled")
      .neq("status", "completed")
      .order("scheduled_date", { ascending: true })
      .limit(5),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("estimates")
      .select("id, estimate_number, title:description, total_price_cents:total_cents, status:stage, expires_at:valid_until_date")
      .eq("client_id", ctx.clientId)
      .eq("org_id", ctx.orgId)
      .eq("stage", "sent")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(3) as Promise<{ data: EstimateRow[] | null }>,
  ]);

  const client = clientRes.data;
  const firstName = client?.first_name ?? client?.display_name?.split(" ")[0] ?? "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // Map visits to shape PortalDashboard expects
  const upcomingVisits = (visitsRes.data ?? []).map((v) => ({
    id: v.id,
    scheduled_date: v.scheduled_date,
    status: v.status,
    jobTitle: (v.crm_jobs as { invoice_description: string | null; job_type: string } | null)?.invoice_description ?? "Service Visit",
  }));

  return (
    <PortalDashboard
      greeting={`${greeting}, ${firstName}!`}
      balanceCents={client?.balance_outstanding_cents ?? 0}
      creditsCents={client?.balance_credits_cents ?? 0}
      invoices={(invoicesRes.data ?? []).map((inv) => ({
        id: inv.id,
        invoice_number: String(inv.invoice_number),
        total_cents: inv.total_cents,
        balance_cents: inv.balance_cents,
        due_date: inv.due_date ?? "",
        status: inv.status,
      }))}
      upcomingVisits={upcomingVisits}
      estimates={estimatesRes.data ?? []}
      clientId={ctx.clientId}
      orgId={ctx.orgId}
    />
  );
}
