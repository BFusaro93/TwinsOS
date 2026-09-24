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
  /** Package / waiting-list visits aren't booked for one day — they happen
   *  somewhere inside this window. Null for normally-dated visits. */
  windowStart: string | null;
  windowEnd: string | null;
}

/** Job types whose visit date is only the start of a service window. */
const WINDOWED_JOB_TYPES = ["package", "waiting_list"];

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
          .select("id, invoice_description, package_name, job_type, waiting_list_start, waiting_list_end")
          .eq("org_id", orgId)
          .in("id", jobIds),
        supabase
          .from("crm_job_services")
          .select("id, job_id, service_name, start_date, complete_by_date")
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
    const ownService = v.job_service_id ? serviceById.get(v.job_service_id) : undefined;
    const own = ownService?.service_name ?? null;
    const jobServiceNames = services
      .filter((s) => s.job_id === v.job_id && s.service_name)
      .map((s) => s.service_name as string);
    const serviceName = own ?? (jobServiceNames.length ? jobServiceNames.join(", ") : null);

    const description = v.invoice_description ?? job?.invoice_description ?? null;
    const title = serviceName ?? description ?? job?.package_name ?? "Service Visit";
    const detailParts = [job?.package_name, description].filter(
      (p): p is string => !!p && p !== title
    );

    // A package step's own window (e.g. FERT 3 of 5: Sep 1 – Sep 30) wins
    // over the job-wide waiting-list range it sits inside.
    const windowed = WINDOWED_JOB_TYPES.includes(job?.job_type ?? "");
    const windowStart = windowed ? (ownService?.start_date ?? job?.waiting_list_start ?? null) : null;
    const windowEnd = windowed ? (ownService?.complete_by_date ?? job?.waiting_list_end ?? null) : null;

    labels.set(v.id, {
      title,
      detail: detailParts.length ? [...new Set(detailParts)].join(" · ") : null,
      jobType: job?.job_type ?? "one_time",
      windowStart: windowStart && windowEnd ? windowStart : null,
      windowEnd: windowStart && windowEnd ? windowEnd : null,
    });
  }
  return labels;
}

export interface PortalUpcomingVisit extends PortalVisitRow {
  scheduled_date: string;
  status: string;
}

/**
 * The customer's upcoming visits, labeled. A package / waiting-list visit's
 * scheduled_date is only the START of its window, so once that date passes
 * the visit would vanish from "upcoming" while the window (e.g. FERT 3 of 5,
 * Sep 1 – Sep 30) is still open. Those are pulled back in until the window
 * closes.
 */
export async function loadUpcomingPortalVisits(
  // The portal user's own session client — RLS scopes the visit rows.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: { clientId: string; orgId: string; today: string; limit: number }
): Promise<{ visits: PortalUpcomingVisit[]; labels: Map<string, PortalVisitLabel> }> {
  const { clientId, orgId, today, limit } = params;
  const cols = "id, scheduled_date, status, job_id, job_service_id, invoice_description";
  const base = () =>
    supabase
      .from("crm_job_visits")
      .select(cols)
      .eq("client_id", clientId)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .neq("status", "completed");

  const yearAgo = new Date(Date.parse(today + "T00:00:00Z") - 365 * 86_400_000).toISOString().slice(0, 10);
  const [futureRes, openWindowRes] = await Promise.all([
    base().gte("scheduled_date", today).order("scheduled_date", { ascending: true }).limit(limit),
    base().lt("scheduled_date", today).gte("scheduled_date", yearAgo).order("scheduled_date", { ascending: true }).limit(50),
  ]);

  const future = (futureRes.data ?? []) as PortalUpcomingVisit[];
  const past = (openWindowRes.data ?? []) as PortalUpcomingVisit[];
  const labels = await labelPortalVisits(orgId, [...future, ...past]);

  const stillOpen = past.filter((v) => {
    const end = labels.get(v.id)?.windowEnd;
    return !!end && end >= today;
  });
  const visits = [...stillOpen, ...future]
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
    .slice(0, limit);
  return { visits, labels };
}
