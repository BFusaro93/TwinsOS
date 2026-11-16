import { resolveStopAddress, embeddedOne, formatStopAddress } from "@/lib/utils/stop-address";
import { snowTagValues } from "@/lib/snow/message-tags";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/** A snow visit older than this is last storm's news, not what a trigger just fired about. */
const RECENT_SNOW_VISIT_DAYS = 7;

/**
 * [stormname]/[stormdate]/[snowservice]/[snowcrew]/[snowstatus]/[snowarrival]/
 * [snowaddress] for an automation step. A run started by a visit event
 * (visit_completed / visit_dispatched / …) remembers that visit, and the tags read
 * THAT stop — so a client with several properties hears about the site the event was
 * about. Without one (other triggers, older runs, a batch that touched several of
 * the client's stops) the client's most recent snow-board stop in the last week is
 * used. No snow visit → every snow tag resolves blank, the same as any other tag
 * with no data behind it.
 *
 * Values are RAW; buildAutomationMergeVars escapes the HTML copy.
 */
export async function buildSnowExtras(
  supabase: AnyClient,
  params: { orgId: string; clientId: string; visitId?: string | null }
): Promise<Record<string, string>> {
  const since = new Date(Date.now() - RECENT_SNOW_VISIT_DAYS * 86400_000).toISOString().slice(0, 10);
  const columns = `
      status, start_time, scheduled_date,
      crm_crews!crm_job_visits_crew_id_fkey(name),
      crm_storm_events(name, event_date),
      clients(service_address, service_city, service_state, service_zip, billing_address, billing_city, billing_state, billing_zip),
      crm_jobs(service_address, service_city, service_state, service_zip, crm_crews(name), crm_job_services(service_name), client_properties(address, city, state, zip))
    `;
  const snowVisits = () => supabase
    .from("crm_job_visits")
    .select(columns)
    .eq("org_id", params.orgId)
    .eq("client_id", params.clientId)
    .not("storm_event_id", "is", null)
    .is("deleted_at", null);
  // The stop the event was about, when it is one of this client's storm visits.
  let row = null;
  if (params.visitId) {
    const { data: own } = await snowVisits().eq("id", params.visitId).limit(1);
    row = (own ?? [])[0] ?? null;
  }
  if (!row) {
    const { data } = await snowVisits()
      .gte("scheduled_date", since)
      .order("scheduled_date", { ascending: false })
      .limit(1);
    row = (data ?? [])[0] ?? null;
  }
  if (!row) return snowTagValues({ stormName: null, stormDate: null, service: null, crew: null, status: null, startTime: null, address: null });

  const job = embeddedOne(row.crm_jobs) as Record<string, unknown> | null;
  const storm = embeddedOne(row.crm_storm_events) as { name?: string; event_date?: string } | null;
  const crew = embeddedOne(row.crm_crews) as { name?: string } | null;
  const jobCrew = embeddedOne(job?.crm_crews as { name?: string } | { name?: string }[] | null);
  const services = ((job?.crm_job_services ?? []) as { service_name: string | null }[])
    .map((s) => s.service_name)
    .filter((n): n is string => !!n);
  const address = resolveStopAddress({
    job: job as Parameters<typeof resolveStopAddress>[0]["job"],
    property: embeddedOne(job?.client_properties as Record<string, unknown> | null) as Parameters<typeof resolveStopAddress>[0]["property"],
    client: embeddedOne(row.clients) as Parameters<typeof resolveStopAddress>[0]["client"],
  });

  return snowTagValues({
    stormName: storm?.name ?? null,
    stormDate: storm?.event_date ?? row.scheduled_date ?? null,
    service: services.join(", ") || null,
    // visit.crew_id is often null — the job's crew is the effective one.
    crew: crew?.name ?? jobCrew?.name ?? null,
    status: row.status ?? null,
    startTime: row.start_time ?? null,
    address: formatStopAddress(address?.parts) || null,
  });
}
