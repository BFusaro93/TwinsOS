import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createClient } from "@/lib/supabase/server";
import PortalServicesPage from "@/components/portal/PortalServicesPage";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { labelPortalVisits } from "@/lib/portal/visit-labels";

export default async function ServicesPage() {
  const ctx = await getPortalContext();
  if (!ctx) redirect("/portal/login");

  const supabase = await createClient();
  // The customer's portal shows the SERVICE PROVIDER's day — a customer in
  // another timezone must see the same schedule the crew works to.
  const today = todayInZone(await getOrgTimeZone(supabase, ctx.orgId));

  const [upcomingRes, completedRes] = await Promise.all([
    supabase
      .from("crm_job_visits")
      .select("id, scheduled_date, status, job_id, job_service_id, invoice_description")
      .eq("client_id", ctx.clientId)
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null)
      .gte("scheduled_date", today)
      .neq("status", "cancelled")
      .neq("status", "completed")
      .order("scheduled_date", { ascending: true })
      .limit(25),

    supabase
      .from("crm_job_visits")
      .select("id, scheduled_date, status, completed_at, job_id, job_service_id, invoice_description")
      .eq("client_id", ctx.clientId)
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null)
      .eq("status", "completed")
      .order("scheduled_date", { ascending: false })
      .limit(25),
  ]);

  const upcomingRows = upcomingRes.data ?? [];
  const completedRows = completedRes.data ?? [];
  const labels = await labelPortalVisits(ctx.orgId, [...upcomingRows, ...completedRows]);

  const mapVisit = (v: { id: string; scheduled_date: string; status: string; completed_at?: string | null }) => {
    const label = labels.get(v.id);
    return {
      id: v.id,
      scheduled_date: v.scheduled_date,
      status: v.status,
      completed_at: v.completed_at ?? null,
      jobTitle: label?.title ?? "Service Visit",
      jobDetail: label?.detail ?? null,
      jobType: label?.jobType ?? "one_time",
    };
  };

  return (
    <PortalServicesPage
      upcoming={upcomingRows.map(mapVisit)}
      completed={completedRows.map(mapVisit)}
      clientId={ctx.clientId}
      orgId={ctx.orgId}
    />
  );
}
