import { NextResponse } from "next/server";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";
import { fetchConditions } from "@/lib/weather/nws-conditions";

/**
 * GET ?visitId=… — current conditions at the stop, so the crew's chemical conditions can be
 * filled in rather than typed. Temperature, wind speed and direction from the nearest National
 * Weather Service station (the same service as the dispatch board's weather chip). `reading` is
 * null when the stop has no coordinates yet, is outside the US, or no station answered —
 * the crew then types them as before.
 */
export async function GET(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const visitId = new URL(request.url).searchParams.get("visitId");
  if (!visitId) return NextResponse.json({ error: "visitId required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visit } = await (supabase as any)
    .from("crm_job_visits")
    .select("id, org_id, crew_id, crew_unassigned, crm_jobs(crew_id, lat, lng, client_properties(lat, lng))")
    .eq("id", visitId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  if (!(await assertCallerOwnsVisit(supabase, user.id, visit.org_id, visit))) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
  }

  const job = Array.isArray(visit.crm_jobs) ? visit.crm_jobs[0] : visit.crm_jobs;
  const prop = Array.isArray(job?.client_properties) ? job.client_properties[0] : job?.client_properties;
  const lat = job?.lat ?? prop?.lat ?? null;
  const lng = job?.lng ?? prop?.lng ?? null;
  if (lat == null || lng == null) return NextResponse.json({ reading: null });

  return NextResponse.json({ reading: await fetchConditions(Number(lat), Number(lng)) });
}
