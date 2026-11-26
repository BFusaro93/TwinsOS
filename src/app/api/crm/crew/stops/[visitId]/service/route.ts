import { NextResponse } from "next/server";
import { z } from "zod";
import { assertOrgWritable } from "@/lib/org-writable";
import { createServiceClient } from "@/lib/supabase/server";
import { createVisitWriter } from "@/lib/crew/visit-writer";
import { resolveOccurredAt } from "@/lib/crew/occurred-at";
import { isServiceTimingOn } from "@/lib/crew/service-timing";
import { stopKeyForVisit, type StopKeyInput } from "@/lib/utils/visit-stops";
import { getRouteAuth, assertCallerOwnsVisit, effectiveVisitCrewId } from "@/lib/supabase/route-auth";
import { CREW_VISIT_RESPONSE_COLUMNS } from "@/lib/visits/visit-columns";

const Body = z.object({
  /** The visit (service) being started or finished — must belong to the stop. */
  serviceVisitId: z.string().uuid(),
  action: z.enum(["start", "finish"]),
  occurredAt: z.string().optional(),
});

interface VisitRow {
  id: string;
  org_id: string;
  client_id: string;
  scheduled_date: string;
  push_number?: number | null;
  storm_event_id?: string | null;
  crew_id: string | null;
  status: string;
  clocked_in_at: string | null;
  clocked_out_at: string | null;
  service_started_at: string | null;
  service_ended_at: string | null;
  service_gap_seconds: number | null;
  crm_jobs: { crew_id?: string | null; property_id: string | null; service_address: string | null; service_city: string | null } | null;
}

function toStopKeyInput(row: VisitRow): StopKeyInput {
  return {
    clientId: row.client_id,
    scheduledDate: row.scheduled_date,
    crewId: effectiveVisitCrewId(row),
    pushNumber: row.push_number,
    stormEventId: row.storm_event_id,
    job: row.crm_jobs
      ? { propertyId: row.crm_jobs.property_id, serviceAddress: row.crm_jobs.service_address, serviceCity: row.crm_jobs.service_city }
      : undefined,
  };
}

const VISIT_SELECT =
  "id, org_id, client_id, scheduled_date, push_number, storm_event_id, crew_id, crew_unassigned, status, clocked_in_at, clocked_out_at, service_started_at, service_ended_at, service_gap_seconds, crm_jobs:crew_job(crew_id, property_id, service_address, service_city)";

/**
 * Starts or finishes ONE service within a running stop ("Track time per
 * service" org setting). One at a time: starting a service ends whichever
 * other service of the stop is still running at the same instant. The stop's
 * own clock (Start Job / Stop Job) is untouched; at Stop Job the stop's
 * man-hours are divided by these windows (see clock-out + serviceWindowHours).
 *
 * Accepts the web app's cookie session or crew-app's bearer token (getRouteAuth).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId: anchorVisitId } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { serviceVisitId, action, occurredAt } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: anchorRow, error: anchorErr } = await (supabase as any)
    .from("crm_crew_job_visits")
    .select(VISIT_SELECT)
    .eq("id", anchorVisitId)
    .is("deleted_at", null)
    .single();
  if (anchorErr || !anchorRow) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  const anchor = anchorRow as VisitRow;

  if (!(await assertCallerOwnsVisit(supabase, user.id, anchor.org_id, anchor))) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
  }
  const readOnly = await assertOrgWritable(createServiceClient(), anchor.org_id);
  if (readOnly) return readOnly;
  if (!(await isServiceTimingOn(createServiceClient(), anchor.org_id))) {
    return NextResponse.json({ error: "Per-service timing is not turned on for this company" }, { status: 409 });
  }

  const candidateQuery = // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("crm_crew_job_visits").select(VISIT_SELECT);
  const { data: candidateRows, error: candErr } = await (anchor.client_id
    ? candidateQuery.eq("client_id", anchor.client_id)
    : candidateQuery.is("client_id", null))
    .eq("scheduled_date", anchor.scheduled_date)
    .is("deleted_at", null)
    .not("status", "in", "(cancelled,skipped)");
  if (candErr) return NextResponse.json({ error: candErr.message }, { status: 500 });

  const anchorKey = stopKeyForVisit(toStopKeyInput(anchor));
  // Same stop, same effective crew (ownership was proven for the anchor above).
  const stopRows = (candidateRows as VisitRow[])
    .filter((r) => effectiveVisitCrewId(r) === effectiveVisitCrewId(anchor))
    .filter((r) => stopKeyForVisit(toStopKeyInput(r)) === anchorKey);
  const target = stopRows.find((r) => r.id === serviceVisitId);
  if (!target) return NextResponse.json({ error: "That service is not part of this stop" }, { status: 400 });
  if (!anchor.clocked_in_at || anchor.clocked_out_at) {
    return NextResponse.json({ error: "Start the job before timing a service" }, { status: 409 });
  }
  if (target.status === "completed") {
    return NextResponse.json({ error: "That service is already finished" }, { status: 409 });
  }

  const now = resolveOccurredAt(occurredAt, { notBefore: anchor.clocked_in_at }).toISOString();
  const writer = createVisitWriter(user.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = writer as any;

  if (action === "start") {
    // One at a time: end every other running service at this instant.
    const running = stopRows.filter((r) => r.id !== target.id && r.service_started_at && !r.service_ended_at);
    if (running.length > 0) {
      const { error } = await w
        .from("crm_job_visits")
        .update({ service_ended_at: now, updated_at: now })
        .in("id", running.map((r) => r.id))
        .is("service_ended_at", null);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // Already running (double tap / offline replay): leave its start alone.
    if (target.service_started_at && !target.service_ended_at) {
      return NextResponse.json({ visitIds: stopRows.map((r) => r.id), alreadyStarted: true });
    }
    // Resume (it already ran once): keep the first start and add the idle time
    // since its Finish to the gap, so worked time adds up every run.
    const resumed = !!target.service_started_at && !!target.service_ended_at;
    const idleSeconds = resumed
      ? Math.max(0, Math.round((new Date(now).getTime() - new Date(target.service_ended_at as string).getTime()) / 1000))
      : 0;
    const { error } = await w
      .from("crm_job_visits")
      .update(
        resumed
          ? { service_ended_at: null, service_gap_seconds: (target.service_gap_seconds ?? 0) + idleSeconds, updated_at: now }
          : { service_started_at: now, service_ended_at: null, service_gap_seconds: 0, updated_at: now }
      )
      .eq("id", target.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    if (!target.service_started_at) {
      return NextResponse.json({ error: "Start this service first" }, { status: 409 });
    }
    if (!target.service_ended_at) {
      const { error } = await w
        .from("crm_job_visits")
        .update({ service_ended_at: now, updated_at: now })
        .eq("id", target.id)
        .is("service_ended_at", null);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const { data } = await w
    .from("crm_job_visits")
    .select(CREW_VISIT_RESPONSE_COLUMNS)
    .in("id", stopRows.map((r) => r.id));
  return NextResponse.json({ visitIds: stopRows.map((r) => r.id), visits: data });
}
