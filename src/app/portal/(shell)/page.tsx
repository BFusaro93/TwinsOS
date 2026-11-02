import { redirect } from "next/navigation";
import { getPortalAccounts, getPortalContext, subAccountNames } from "@/lib/portal/get-portal-context";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import PortalDashboard from "@/components/portal/PortalDashboard";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { hourInZone, todayInZone } from "@/lib/time/zone";
import { labelPortalVisits, loadUpcomingPortalVisits } from "@/lib/portal/visit-labels";

interface EstimateRow {
  id: string;
  client_id: string;
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
  // The customer's portal shows the SERVICE PROVIDER's day — a customer in
  // another timezone must see the same schedule the crew works to.
  const timeZone = await getOrgTimeZone(supabase, ctx.orgId);
  const today = todayInZone(timeZone);
  // A parent client's login also sees (and owes) its sub-accounts' work.
  const accounts = await getPortalAccounts(ctx);
  const clientIds = accounts.map((a) => a.id);
  const accountNames = subAccountNames(accounts);

  const [clientRes, balancesRes, invoicesRes, visitsRes, recentRes, estimatesRes, settingsRes] = await Promise.all([
    supabase
      .from("clients")
      .select("display_name, first_name")
      .eq("id", ctx.clientId)
      .eq("org_id", ctx.orgId)
      .single(),

    // Balance across the login's own account and its sub-accounts. Service
    // client: the portal user's RLS only reads their own clients row; the
    // ids are already scoped to this login by getPortalAccounts.
    createServiceClient()
      .from("clients")
      .select("balance_outstanding_cents, balance_credits_cents")
      .in("id", clientIds)
      .eq("org_id", ctx.orgId),

    supabase
      .from("crm_invoices")
      .select("id, client_id, invoice_number, total_cents, balance_cents, due_date, status")
      .in("client_id", clientIds)
      .eq("org_id", ctx.orgId)
      .in("status", ["printed", "sent", "viewed", "partial", "overdue"])
      // A fully-paid (or $0) invoice can still sit in "printed"/"sent";
      // it isn't outstanding and mustn't flag the account as past due.
      .gt("balance_cents", 0)
      .is("deleted_at", null)
      .order("due_date", { ascending: true })
      .limit(5),

    loadUpcomingPortalVisits(supabase, { clientIds, orgId: ctx.orgId, today, limit: 5 }),

    supabase
      .from("crm_job_visits")
      .select("id, client_id, scheduled_date, status, job_id, job_service_id, invoice_description")
      .in("client_id", clientIds)
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null)
      // A multi-crew stop is one visit to the customer — show the lead's only.
      .eq("crew_group_secondary", false)
      .eq("status", "completed")
      .order("scheduled_date", { ascending: false })
      .limit(3),

    // Portal customers have no RLS read path to estimates (it would expose
    // internal cost/margin columns) — service client, scoped to this client.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (createServiceClient() as any)
      .from("estimates")
      .select("id, client_id, estimate_number, title:description, total_price_cents:total_cents, status:stage, expires_at:valid_until_date")
      .in("client_id", clientIds)
      .eq("org_id", ctx.orgId)
      .eq("stage", "sent")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(3) as Promise<{ data: EstimateRow[] | null }>,

    // Same service-client read the (shell) layout does for branding —
    // portal users have no RLS path to client_portal_settings.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (createServiceClient() as any)
      .from("client_portal_settings")
      .select("allow_tickets, allow_estimates")
      .eq("org_id", ctx.orgId)
      .maybeSingle() as Promise<{ data: { allow_tickets: boolean | null; allow_estimates: boolean | null } | null }>,
  ]);

  const client = clientRes.data;
  const balanceCents = (balancesRes.data ?? []).reduce((sum, c) => sum + (c.balance_outstanding_cents ?? 0), 0);
  const creditsCents = (balancesRes.data ?? []).reduce((sum, c) => sum + (c.balance_credits_cents ?? 0), 0);
  const firstName = client?.first_name ?? client?.display_name?.split(" ")[0] ?? "there";
  // Server clock is UTC — greet on the service provider's wall clock.
  const hour = hourInZone(new Date(), timeZone);
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // Map visits to shape PortalDashboard expects
  const upcomingRows = visitsRes.visits;
  const recentRows = recentRes.data ?? [];
  const recentLabels = await labelPortalVisits(ctx.orgId, recentRows);
  const labels = new Map([...visitsRes.labels, ...recentLabels]);
  const mapVisit = (v: { id: string; client_id: string; scheduled_date: string; status: string }) => ({
    id: v.id,
    scheduled_date: v.scheduled_date,
    status: v.status,
    jobTitle: labels.get(v.id)?.title ?? "Service Visit",
    jobDetail: labels.get(v.id)?.detail ?? null,
    windowStart: labels.get(v.id)?.windowStart ?? null,
    windowEnd: labels.get(v.id)?.windowEnd ?? null,
    accountName: accountNames.get(v.client_id) ?? null,
  });
  const upcomingVisits = upcomingRows.map(mapVisit);
  const recentVisits = recentRows.map(mapVisit);

  return (
    <PortalDashboard
      greeting={`${greeting}, ${firstName}!`}
      balanceCents={balanceCents}
      creditsCents={creditsCents}
      invoices={(invoicesRes.data ?? []).map((inv) => ({
        id: inv.id,
        invoice_number: String(inv.invoice_number),
        total_cents: inv.total_cents,
        balance_cents: inv.balance_cents,
        due_date: inv.due_date ?? "",
        status: inv.status,
        accountName: accountNames.get(inv.client_id) ?? null,
      }))}
      upcomingVisits={upcomingVisits}
      recentVisits={recentVisits}
      today={today}
      allowTickets={settingsRes.data?.allow_tickets !== false}
      allowEstimates={settingsRes.data?.allow_estimates !== false}
      estimates={(estimatesRes.data ?? []).map((e) => ({ ...e, accountName: accountNames.get(e.client_id) ?? null }))}
      clientIds={clientIds}
      orgId={ctx.orgId}
    />
  );
}
