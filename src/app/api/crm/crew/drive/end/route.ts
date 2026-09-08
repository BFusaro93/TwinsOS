import { NextResponse } from "next/server";
import { getRouteAuth, resolveCallerCrewId } from "@/lib/supabase/route-auth";
import { closeOpenDriveSegment } from "@/lib/crew/drive-time";

/**
 * POST /api/crm/crew/drive/end — "Arrived". Closes the caller's crew's open
 * drive segment (see crm_crew_drive_segments). No-op (not an error) if
 * there's nothing open, so a double-tap/retry is harmless.
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

  const result = await closeOpenDriveSegment(supabase, crewId);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json({ closed: result.closed });
}
