import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/supabase/route-auth";

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
 */
export async function GET(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : new Date().toISOString().slice(0, 10);

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
  if (!crew) return NextResponse.json({ date, crewId: null, crewName: null, visits: [] });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_job_visits")
    .select(`
      id, job_id, client_id, job_service_id, crew_id, scheduled_date,
      start_time, end_time, status, sub_status, priority,
      notes_to_crew, notes_to_client, completion_notes, job_comments,
      men_count, actual_hours, clocked_in_at, clocked_out_at,
      acknowledged_notes_at, completed_at, updated_at,
      clients(display_name, primary_phone, billing_address, billing_city, billing_state, billing_zip),
      crm_jobs(job_type, service_address, service_city, service_state, service_zip, budgeted_hours)
    `)
    .eq("org_id", orgId)
    .eq("scheduled_date", date)
    .eq("crew_id", crew.id)
    .is("deleted_at", null)
    .order("priority", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const visits = (data as Record<string, unknown>[]).map((row) => {
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

  return NextResponse.json({ date, crewId: crew.id as string, crewName: crew.name as string, visits });
}
