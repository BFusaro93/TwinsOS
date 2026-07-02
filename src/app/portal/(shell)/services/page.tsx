import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createClient } from "@/lib/supabase/server";
import PortalServicesPage from "@/components/portal/PortalServicesPage";

export default async function ServicesPage() {
  const ctx = await getPortalContext();
  if (!ctx) redirect("/portal/login");

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const [upcomingRes, completedRes] = await Promise.all([
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
      .limit(25),

    supabase
      .from("crm_job_visits")
      .select("id, scheduled_date, status, completed_at, job_id, crm_jobs(invoice_description, job_type)")
      .eq("client_id", ctx.clientId)
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null)
      .eq("status", "completed")
      .order("scheduled_date", { ascending: false })
      .limit(25),
  ]);

  type JobInfo = { invoice_description: string | null; job_type: string } | null;

  const mapVisit = (v: { id: string; scheduled_date: string; status: string; completed_at?: string | null; crm_jobs: unknown }) => ({
    id: v.id,
    scheduled_date: v.scheduled_date,
    status: v.status,
    completed_at: (v as { completed_at?: string | null }).completed_at ?? null,
    jobTitle: (v.crm_jobs as JobInfo)?.invoice_description ?? "Service Visit",
    jobType: (v.crm_jobs as JobInfo)?.job_type ?? "one_time",
  });

  return (
    <PortalServicesPage
      upcoming={(upcomingRes.data ?? []).map(mapVisit)}
      completed={(completedRes.data ?? []).map(mapVisit)}
      clientId={ctx.clientId}
      orgId={ctx.orgId}
    />
  );
}
