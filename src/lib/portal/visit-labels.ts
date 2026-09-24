import { createServiceClient } from "@/lib/supabase/server";

export interface PortalVisitRow {
  id: string;
  job_id: string | null;
  job_service_id: string | null;
  invoice_description: string | null;
}

export interface PortalVisitLabel {
  /** What the customer sees as the visit's name, e.g. "Lawn Mowing". */
  title: string;
  /** Secondary line — the customer-facing description or package, if any. */
  detail: string | null;
  jobType: string;
}

/**
 * Names portal visits by their service. Portal users can read their own
 * crm_job_visits rows but have no RLS path to crm_jobs / crm_job_services,
 * so a PostgREST embed from the session client silently returned null and
 * every visit read "Service Visit". The visit rows passed in were already
 * scoped by the portal user's RLS; this only reads labels for those rows,
 * via the service client, pinned to the same org.
 */
export async function labelPortalVisits(
  orgId: string,
  visits: PortalVisitRow[]
): Promise<Map<string, PortalVisitLabel>> {
  const jobIds = [...new Set(visits.map((v) => v.job_id).filter((x): x is string => !!x))];
  const labels = new Map<string, PortalVisitLabel>();
  if (visits.length === 0) return labels;

  const supabase = createServiceClient();
  const [jobsRes, servicesRes] = jobIds.length
    ? await Promise.all([
        supabase
          .from("crm_jobs")
          .select("id, invoice_description, package_name, job_type")
          .eq("org_id", orgId)
          .in("id", jobIds),
        supabase
          .from("crm_job_services")
          .select("id, job_id, service_name")
          .eq("org_id", orgId)
          .in("job_id", jobIds),
      ])
    : [{ data: [] }, { data: [] }];

  const jobs = new Map((jobsRes.data ?? []).map((j) => [j.id, j]));
  const services = servicesRes.data ?? [];
  const serviceById = new Map(services.map((s) => [s.id, s]));

  for (const v of visits) {
    const job = v.job_id ? jobs.get(v.job_id) : undefined;
    // The visit's own service when it has one; otherwise every service on
    // the job (a single-service job is the common case).
    const own = v.job_service_id ? serviceById.get(v.job_service_id)?.service_name : null;
    const jobServiceNames = services
      .filter((s) => s.job_id === v.job_id && s.service_name)
      .map((s) => s.service_name as string);
    const serviceName = own ?? (jobServiceNames.length ? jobServiceNames.join(", ") : null);

    const description = v.invoice_description ?? job?.invoice_description ?? null;
    const title = serviceName ?? description ?? job?.package_name ?? "Service Visit";
    const detailParts = [job?.package_name, description].filter(
      (p): p is string => !!p && p !== title
    );

    labels.set(v.id, {
      title,
      detail: detailParts.length ? [...new Set(detailParts)].join(" · ") : null,
      jobType: job?.job_type ?? "one_time",
    });
  }
  return labels;
}
