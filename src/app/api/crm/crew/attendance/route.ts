import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth, resolveCallerCrewId, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { isoInZone, todayInZone } from "@/lib/time/zone";
import { closeMemberOpenShift } from "@/lib/crew/day-shifts";
import { stopPunchOwnerVisitId } from "@/lib/crew/stop-punches";
import { resolveOccurredAt } from "@/lib/crew/occurred-at";
import { isPayrollLockedError } from "@/lib/crew/payroll-lock";
import { assertOrgWritable } from "@/lib/org-writable";
import { createServiceClient } from "@/lib/supabase/server";

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
  /** When the leader tapped (ISO) — a queued offline tap replays later. Bounded by resolveOccurredAt. */
  occurredAt: z.string().optional(),
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
  // Shift / punch writes below may use the service role, which skips the
  // read-only-when-canceled RLS — a canceled org's crew must not keep clocking time.
  const readOnly = await assertOrgWritable(createServiceClient(), orgId);
  if (readOnly) return readOnly;

  const { data: member } = await db
    .from("crm_crew_members")
    .select("id, crew_id")
    .eq("id", crewMemberId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "Crew member not found" }, { status: 404 });

  // The tap time (bounded), and the work date it falls on in the org's zone.
  const now = resolveOccurredAt(parsed.data.occurredAt).toISOString();
  const workDate = isoInZone(new Date(now), await getOrgTimeZone(supabase, orgId));

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

  // The visit whose punch is closed must be one this caller may act on — a
  // crew login only its own crew's (RLS on crm_job_visits checks the org, not
  // the crew) — and the punch lives on whichever of the stop's visits owns the
  // punches, which need not be the one the app sent (same as crew/day).
  let punchVisitId: string | null = null;
  if (visitId && absent) {
    const { data: visit } = await db.from("crm_job_visits")
      .select("id, org_id, crew_id, crew_unassigned, crm_jobs:crew_job(crew_id)")
      .eq("id", visitId).eq("org_id", orgId).is("deleted_at", null).maybeSingle();
    if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    if (profile.role === "crew" && !(await assertCallerOwnsVisit(db, user.id, orgId, visit))) {
      return NextResponse.json({ error: "That visit isn't on your crew" }, { status: 403 });
    }
    punchVisitId = await stopPunchOwnerVisitId(db, visitId);
  }

  // Crew logins can't write shifts / punches directly (RLS) — their time writes
  // go through the service client, after the own-crew check above. Office users
  // keep writing under their own RLS.
  const timeWriter = profile.role === "crew" ? createServiceClient() : db;
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
    // Absent also means "left for the day": close the member's open shift
    // the same way crew/day member_out does, so they aren't paid until a
    // forgotten End Day.
    try {
      await closeMemberOpenShift(timeWriter, { orgId, crewMemberId, workDate, at: now });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to close shift";
      return NextResponse.json({ error: message }, { status: isPayrollLockedError(message) ? 409 : 500 });
    }
    if (punchVisitId) {
      // Ends an in-progress punch: the member isn't on this job any more.
      await timeWriter
        .from("crm_crew_member_times")
        .update({ clocked_out_at: now, updated_at: now })
        .eq("org_id", orgId)
        .eq("visit_id", punchVisitId)
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
