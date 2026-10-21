import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth, resolveCallerCrewId } from "@/lib/supabase/route-auth";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";

/**
 * POST /api/crm/crew/attendance — the crew leader marks a member as not
 * working today (absent / not here yet / left for the day) or back on.
 *
 * Start Job auto-punches every working member, so an absent member is simply
 * skipped. Marking someone absent also closes any punch they have open on the
 * given visit, which is how "left early" ends their day. The day is always
 * the org's today, computed here — never taken from the request.
 */
const Body = z.object({
  crewMemberId: z.string().uuid(),
  absent: z.boolean(),
  /** The stop's anchor visit, when there is one — an open punch on it is closed. */
  visitId: z.string().uuid().optional(),
});

export async function GET(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
  if (!profile?.org_id) return NextResponse.json({ error: "No organization for this user" }, { status: 403 });

  const workDate = todayInZone(await getOrgTimeZone(supabase, profile.org_id as string));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_crew_day_absences")
    .select("crew_member_id")
    .eq("org_id", profile.org_id)
    .eq("work_date", workDate)
    .is("deleted_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    workDate,
    absentMemberIds: ((data ?? []) as { crew_member_id: string }[]).map((r) => r.crew_member_id),
  });
}

export async function POST(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { crewMemberId, absent, visitId } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: profile } = await db.from("profiles").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!profile?.org_id) return NextResponse.json({ error: "No organization for this user" }, { status: 403 });
  const orgId = profile.org_id as string;

  const { data: member } = await db
    .from("crm_crew_members")
    .select("id, crew_id")
    .eq("id", crewMemberId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "Crew member not found" }, { status: 404 });

  const workDate = todayInZone(await getOrgTimeZone(supabase, orgId));

  // A crew login can only mark members of its own crew (today's roster, so a
  // same-day reassignment onto this crew counts).
  if (profile.role === "crew") {
    const callerCrewId = await resolveCallerCrewId(supabase, user.id, orgId);
    const { data: override } = await db
      .from("crm_crew_daily_members")
      .select("crew_id")
      .eq("org_id", orgId)
      .eq("work_date", workDate)
      .eq("member_id", crewMemberId)
      .maybeSingle();
    const memberCrewId = (override?.crew_id as string | undefined) ?? (member.crew_id as string);
    if (!callerCrewId || memberCrewId !== callerCrewId) {
      return NextResponse.json({ error: "That crew member isn't on your crew" }, { status: 403 });
    }
  }

  const now = new Date().toISOString();
  if (absent) {
    const { data: existing } = await db
      .from("crm_crew_day_absences")
      .select("id")
      .eq("crew_member_id", crewMemberId)
      .eq("work_date", workDate)
      .is("deleted_at", null)
      .limit(1);
    if (((existing ?? []) as unknown[]).length === 0) {
      const { error } = await db
        .from("crm_crew_day_absences")
        .insert({ org_id: orgId, crew_member_id: crewMemberId, work_date: workDate, created_by: user.id });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (visitId) {
      // Ends an in-progress punch: the member isn't on this job any more.
      await db
        .from("crm_crew_member_times")
        .update({ clocked_out_at: now, updated_at: now })
        .eq("org_id", orgId)
        .eq("visit_id", visitId)
        .eq("crew_member_id", crewMemberId)
        .is("deleted_at", null)
        .is("clocked_out_at", null)
        .lt("clocked_in_at", now);
    }
  } else {
    const { error } = await db
      .from("crm_crew_day_absences")
      .update({ deleted_at: now })
      .eq("crew_member_id", crewMemberId)
      .eq("work_date", workDate)
      .is("deleted_at", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, workDate, absent });
}
