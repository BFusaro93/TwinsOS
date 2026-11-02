import { redirect } from "next/navigation";
import { getPortalAccounts, getPortalContext, subAccountNames } from "@/lib/portal/get-portal-context";
import { createClient } from "@/lib/supabase/server";
import PortalServicesPage from "@/components/portal/PortalServicesPage";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { labelPortalVisits, loadUpcomingPortalVisits } from "@/lib/portal/visit-labels";

export default async function ServicesPage() {
  const ctx = await getPortalContext();
  if (!ctx) redirect("/portal/login");

  const supabase = await createClient();
  // The customer's portal shows the SERVICE PROVIDER's day — a customer in
  // another timezone must see the same schedule the crew works to.
  const today = todayInZone(await getOrgTimeZone(supabase, ctx.orgId));
  // A parent client's login also sees its sub-accounts' visits.
  const accounts = await getPortalAccounts(ctx);
  const clientIds = accounts.map((a) => a.id);
  const accountNames = subAccountNames(accounts);

  const [upcoming, completedRes] = await Promise.all([
    loadUpcomingPortalVisits(supabase, { clientIds, orgId: ctx.orgId, today, limit: 25 }),

    supabase
      .from("crm_job_visits")
      .select("id, client_id, scheduled_date, status, completed_at, job_id, job_service_id, invoice_description")
      .in("client_id", clientIds)
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null)
      // A multi-crew stop is one visit to the customer — show the lead's only.
      .eq("crew_group_secondary", false)
      .eq("status", "completed")
      .order("scheduled_date", { ascending: false })
      .limit(25),
  ]);

  const upcomingRows = upcoming.visits;
  const completedRows = completedRes.data ?? [];
  const completedLabels = await labelPortalVisits(ctx.orgId, completedRows);
  const labels = new Map([...upcoming.labels, ...completedLabels]);

  const mapVisit = (v: { id: string; client_id: string; scheduled_date: string; status: string; completed_at?: string | null }) => {
    const label = labels.get(v.id);
    return {
      id: v.id,
      scheduled_date: v.scheduled_date,
      status: v.status,
      completed_at: v.completed_at ?? null,
      jobTitle: label?.title ?? "Service Visit",
      jobDetail: label?.detail ?? null,
      jobType: label?.jobType ?? "one_time",
      windowStart: label?.windowStart ?? null,
      windowEnd: label?.windowEnd ?? null,
      accountName: accountNames.get(v.client_id) ?? null,
    };
  };

  return (
    <PortalServicesPage
      upcoming={upcomingRows.map(mapVisit)}
      completed={completedRows.map(mapVisit)}
      clientIds={clientIds}
      orgId={ctx.orgId}
    />
  );
}
