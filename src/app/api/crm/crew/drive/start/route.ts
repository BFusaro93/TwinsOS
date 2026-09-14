import { NextResponse } from "next/server";
import { getRouteAuth, resolveCallerCrewId } from "@/lib/supabase/route-auth";
import { isoNy } from "@/lib/reports/ny-date";

/**
 * POST /api/crm/crew/drive/start
 * Starts a day-level drive-time segment for the caller's own crew (yard to
 * first stop, between stops, or last stop to yard — crm_crew_drive_segments
 * is day-level, not tied to any one crm_job_visits row). Idempotent: if the
 * crew already has an open segment, returns it instead of creating a
 * duplicate (the DB's partial unique index would reject a second one
 * anyway — this just avoids surfacing that as a client-facing error on a
 * double-tap/retry).
 */
export async function POST(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = profile?.org_id as string | undefined;
  if (!orgId) return NextResponse.json({ error: "No organization for this user" }, { status: 403 });

  const crewId = await resolveCallerCrewId(supabase, user.id, orgId);
  if (!crewId) return NextResponse.json({ error: "Not a crew account" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from("crm_crew_drive_segments")
    .select("*")
    .eq("crew_id", crewId)
    .is("ended_at", null)
    .maybeSingle();
  if (existing) return NextResponse.json({ segment: existing });

  const now = new Date();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_crew_drive_segments")
    .insert({
      org_id: orgId,
      crew_id: crewId,
      work_date: isoNy(now),
      started_at: now.toISOString(),
      created_by: user.id,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ segment: data });
}
