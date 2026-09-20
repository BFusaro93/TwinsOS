import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/supabase/route-auth";
import { groupVisitsIntoStops, visitServices } from "@/lib/utils/visit-stops";
import type { CRMJob, CRMJobVisit } from "@/types/crm-jobs";
import { getMyTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";

/**
 * GET /api/crm/crew/visits?date=YYYY-MM-DD
 *
 * Returns the authenticated crew member's visits for the given date (default
 * today). Server-side counterpart to the web app's useMyCrewVisits() hook
 * (src/lib/hooks/use-crew-app.ts), which queries Supabase directly from the
 * browser — crew-app (the Expo mobile client) has no browser Supabase client
 * with RLS-friendly cookies, so it needs this route instead. Accepts either
 * the web app's cookie session or crew-app's bearer token — see
 * getRouteAuth() — though this route's primary caller is the mobile app.
 *
 * org_id is never taken from the request — it's derived server-side from the
 * authenticated user's profile, per this repo's multi-tenancy rules.
 *
 * The response carries both shapes: `visits` (the original flat per-visit
 * list — kept as-is so nothing that already reads it breaks) and `stops`
 * (grouped the same way the web crew page groups them, via
 * groupVisitsIntoStops() in src/lib/utils/visit-stops.ts — the same function
 * the web app's useMyCrewStops() calls, so both surfaces derive "what is one
 * stop" from one place). `drive` mirrors the web's useCrewDriveToday() for
 * the day-level drive-time banner.
 */
export async function GET(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");
  // Which day the crew's schedule opens on is the ORG's day. A crew phone set
  // to another timezone (or a UTC server) must not show a different route than
  // the office dispatched.
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : todayInZone(await getMyTimeZone(supabase));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  const orgId = profile?.org_id as string | undefined;
  if (!orgId) return NextResponse.json({ error: "No organization for this user" }, { status: 403 });

  // Crew accounts log in as the crew itself — find the crew by user_id on
  // crm_crews, same lookup useMyCrewVisits() does client-side.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: crew, error: crewError } = await (supabase as any)
    .from("crm_crews")
    .select("id, name")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (crewError) return NextResponse.json({ error: crewError.message }, { status: 500 });
  if (!crew) {
    return NextResponse.json({
      date, crewId: null, crewName: null, visits: [], stops: [],
      drive: { openSegment: null, totalMinutes: 0 },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_job_visits")
    .select(`
      id, job_id, client_id, job_service_id, crew_id, scheduled_date,
      start_time, end_time, status, sub_status, priority,
      notes_to_crew, notes_to_client, completion_notes, job_comments,
      men_count, actual_hours, budgeted_hours, clocked_in_at, clocked_out_at,
      paused_at, break_minutes, skip_reason,
      acknowledged_notes_at, notes_to_crew_updated_at, completed_at, created_at, updated_at,
      clients(display_name, primary_phone, billing_address, billing_city, billing_state, billing_zip),
      crm_jobs(job_type, property_id, service_address, service_city, service_state, service_zip, budgeted_hours,
        notes_to_crew, notes_to_crew_updated_at,
        crm_job_services(id, service_name, budgeted_hours, team_size, sort_order))
    `)
    .eq("org_id", orgId)
    .eq("scheduled_date", date)
    .eq("crew_id", crew.id)
    .is("deleted_at", null)
    .order("priority", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data as Record<string, unknown>[];

  const visits = rows.map((row) => {
    const client = row.clients as Record<string, unknown> | null;
    const job = row.crm_jobs as Record<string, unknown> | null;
    return {
      id: row.id as string,
      jobId: row.job_id as string,
      clientId: row.client_id as string,
      jobServiceId: (row.job_service_id as string) ?? null,
      crewId: row.crew_id as string | null,
      scheduledDate: row.scheduled_date as string,
      startTime: row.start_time as string | null,
      endTime: row.end_time as string | null,
      status: row.status as string,
      subStatus: row.sub_status as string | null,
      priority: (row.priority as number) ?? 1,
      notesToCrew: row.notes_to_crew as string | null,
      notesToClient: row.notes_to_client as string | null,
      completionNotes: row.completion_notes as string | null,
      jobComments: Array.isArray(row.job_comments) ? row.job_comments : [],
      menCount: (row.men_count as number) ?? 1,
      actualHours: row.actual_hours as number | null,
      clockedInAt: row.clocked_in_at as string | null,
      clockedOutAt: row.clocked_out_at as string | null,
      acknowledgedNotesAt: row.acknowledged_notes_at as string | null,
      notesToCrewUpdatedAt: (row.notes_to_crew_updated_at as string) ?? null,
      completedAt: row.completed_at as string | null,
      updatedAt: row.updated_at as string,
      clientName: (client?.display_name as string) ?? null,
      clientPhone: (client?.primary_phone as string) ?? null,
      address: {
        line1: (job?.service_address as string) ?? (client?.billing_address as string) ?? null,
        city: (job?.service_city as string) ?? (client?.billing_city as string) ?? null,
        state: (job?.service_state as string) ?? (client?.billing_state as string) ?? null,
        zip: (job?.service_zip as string) ?? (client?.billing_zip as string) ?? null,
      },
      jobType: (job?.job_type as string) ?? null,
      budgetedHours: (job?.budgeted_hours as number) ?? null,
    };
  });

  // ── stop-grouped shape ────────────────────────────────────────────────────
  // Reuses the exact grouping function the web crew page's useMyCrewStops()
  // calls (src/lib/utils/visit-stops.ts) so "what counts as one stop" can
  // never drift between the web crew UI and crew-app. mapRowToStopVisit()
  // below is only a shaping step (snake_case DB row -> the CRMJobVisit shape
  // groupVisitsIntoStops() expects) — it duplicates the row->camelCase
  // mapping useMyCrewStops() does client-side (mapVisit() in
  // use-crew-app.ts), which is expected: that mapping runs against a browser
  // Supabase client's raw response and can't be shared with a server route
  // without adding a browser-only dependency here.
  const mapped: CRMJobVisit[] = rows.map((row) => {
    const client = row.clients as Record<string, unknown> | null;
    const job = row.crm_jobs as Record<string, unknown> | null;
    const services = Array.isArray(job?.crm_job_services)
      ? (job!.crm_job_services as Record<string, unknown>[]).map((s) => ({
          id: s.id as string,
          jobId: row.job_id as string,
          serviceId: null,
          serviceName: s.service_name as string,
          qty: 1,
          rateCents: null,
          budgetedHours: (s.budgeted_hours as number) ?? 0,
          teamSize: (s.team_size as number) ?? 1,
          sortOrder: (s.sort_order as number) ?? 0,
        }))
      : [];
    return {
      id: row.id as string,
      orgId,
      jobId: row.job_id as string,
      clientId: row.client_id as string,
      jobServiceId: (row.job_service_id as string) ?? null,
      stormEventId: null,
      snowDepthInches: null,
      temperature: null,
      assetType: null,
      materialsUsed: [],
      clientName: (client?.display_name as string) ?? null,
      clientPhone: (client?.primary_phone as string) ?? null,
      crewId: row.crew_id as string | null,
      scheduledDate: row.scheduled_date as string,
      startTime: row.start_time as string | null,
      endTime: row.end_time as string | null,
      status: row.status as CRMJobVisit["status"],
      subStatus: (row.sub_status as string) ?? null,
      orderNum: null,
      completionNotes: row.completion_notes as string | null,
      actualHours: row.actual_hours as number | null,
      budgetedHours: (row.budgeted_hours as number) ?? (job?.budgeted_hours as number) ?? null,
      completedAt: row.completed_at as string | null,
      priority: (row.priority as number) ?? 1,
      notesToCrew: row.notes_to_crew as string | null,
      notesToClient: row.notes_to_client as string | null,
      invoiceDescription: null,
      menCount: (row.men_count as number) ?? 1,
      qty: null,
      rateCents: null,
      jobComments: Array.isArray(row.job_comments) ? (row.job_comments as CRMJobVisit["jobComments"]) : [],
      assignedEmployeeId: null,
      dispatchedAt: null,
      clockedInAt: row.clocked_in_at as string | null,
      clockedOutAt: row.clocked_out_at as string | null,
      pausedAt: row.paused_at as string | null,
      breakMinutes: (row.break_minutes as number) ?? 0,
      acknowledgedNotesAt: row.acknowledged_notes_at as string | null,
      notesToCrewUpdatedAt: (row.notes_to_crew_updated_at as string) ?? null,
      skipReason: row.skip_reason as string | null,
      createdAt: (row.created_at as string) ?? "",
      updatedAt: row.updated_at as string,
      deletedAt: null,
      job: job
        ? ({
            id: row.job_id as string,
            orgId,
            clientId: row.client_id as string,
            propertyId: (job.property_id as string) ?? null,
            jobType: job.job_type as string,
            notesToCrew: (job.notes_to_crew as string) ?? null,
            notesToCrewUpdatedAt: (job.notes_to_crew_updated_at as string) ?? null,
            serviceAddress: (job.service_address as string) ?? null,
            serviceCity: (job.service_city as string) ?? null,
            serviceState: (job.service_state as string) ?? null,
            serviceZip: (job.service_zip as string) ?? null,
            budgetedHours: (job.budgeted_hours as number) ?? null,
            services,
          } as unknown as CRMJob)
        : undefined,
    } as unknown as CRMJobVisit;
  });

  const stops = groupVisitsIntoStops(mapped).map((stop) => ({
    key: stop.key,
    anchorVisitId: stop.anchorVisitId,
    clientName: stop.clientName,
    clientPhone: stop.clientPhone,
    address: stop.address,
    propertyId: stop.propertyId,
    derivedStatus: stop.derivedStatus,
    clockedInAt: stop.clockedInAt,
    clockedOutAt: stop.clockedOutAt,
    pausedAt: stop.pausedAt,
    breakMinutes: Math.max(0, ...stop.visits.map((v) => v.breakMinutes ?? 0), 0),
    notesToCrew: stop.notesToCrew,
    notesToCrewUpdatedAt: stop.notesToCrewUpdatedAt,
    scheduledDate: stop.visits[0]?.scheduledDate ?? date,
    visits: stop.visits.map((v) => {
      const svc = visitServices(v)[0];
      return {
        id: v.id,
        jobServiceId: v.jobServiceId,
        serviceName: svc?.serviceName ?? null,
        budgetedHours: svc?.budgetedHours ?? v.budgetedHours ?? null,
        teamSize: svc?.teamSize ?? null,
        status: v.status,
        startTime: v.startTime,
        endTime: v.endTime,
        actualHours: v.actualHours,
        completionNotes: v.completionNotes,
        acknowledgedNotesAt: v.acknowledgedNotesAt,
        skipReason: v.skipReason,
        jobComments: v.jobComments,
      };
    }),
  }));

  // ── day-level drive segments (see useCrewDriveToday() on the web) ────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: driveRows } = await (supabase as any)
    .from("crm_crew_drive_segments")
    .select("id, started_at, ended_at, minutes")
    .eq("crew_id", crew.id)
    .eq("work_date", date)
    .order("started_at", { ascending: true });

  const segments = ((driveRows ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    startedAt: r.started_at as string,
    endedAt: (r.ended_at as string) ?? null,
    minutes: (r.minutes as number) ?? null,
  }));
  const openSegment = segments.find((s) => !s.endedAt) ?? null;
  const totalMinutes = segments.reduce((sum, s) => sum + (s.minutes ?? 0), 0);

  return NextResponse.json({
    date,
    crewId: crew.id as string,
    crewName: crew.name as string,
    visits,
    stops,
    drive: { openSegment, totalMinutes },
  });
}
