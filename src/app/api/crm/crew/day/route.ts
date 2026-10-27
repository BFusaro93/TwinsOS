import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { getRouteAuth, resolveCallerCrewId, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { resolveWorkingMemberIds } from "@/lib/crew/stop-punches";
import { memberWorksOn } from "@/lib/crew/roster-days";
import { startCrewDay, endCrewDay, closeMemberOpenShift } from "@/lib/crew/day-shifts";

/**
 * The crew's paid day (shop to shop).
 *   GET  — today's roster with each member's shift and absent flag.
 *   POST — { action: "start_day" | "end_day" | "member_in" | "member_out" | "add_member" }.
 *
 * Crew logins only, and only for their own crew's roster. The work date is the
 * org's today, computed here — never taken from the request.
 */
const Body = z.object({
  action: z.enum(["start_day", "end_day", "member_in", "member_out", "add_member"]),
  crewMemberId: z.string().uuid().optional(),
  /** The stop's anchor visit, when one is in progress — keeps its job punch in step. */
  visitId: z.string().uuid().optional(),
});

async function context(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: profile } = await db.from("profiles").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!profile?.org_id) return { response: NextResponse.json({ error: "No organization for this user" }, { status: 403 }) };
  const orgId = profile.org_id as string;
  const crewId = await resolveCallerCrewId(supabase, user.id, orgId);
  if (!crewId) return { response: NextResponse.json({ error: "This login isn't attached to a crew" }, { status: 403 }) };
  const workDate = todayInZone(await getOrgTimeZone(supabase, orgId));
  return { db, user, orgId, crewId, workDate };
}

export async function GET(request: Request) {
  const ctx = await context(request);
  if ("response" in ctx) return ctx.response;
  const { db, orgId, crewId, workDate } = ctx;

  const memberIds = await resolveWorkingMemberIds(db, orgId, crewId, workDate, { includeAbsent: true });
  const [{ data: members }, { data: shifts }, { data: absences }] = await Promise.all([
    memberIds.length ? db.from("crm_crew_members").select("id, name, role").in("id", memberIds).order("name") : { data: [] },
    memberIds.length
      ? db.from("crm_crew_day_shifts").select("crew_member_id, started_at, ended_at").eq("org_id", orgId).eq("work_date", workDate).is("deleted_at", null).in("crew_member_id", memberIds)
      : { data: [] },
    db.from("crm_crew_day_absences").select("crew_member_id").eq("org_id", orgId).eq("work_date", workDate).is("deleted_at", null),
  ]);
  const shiftBy = new Map<string, { started_at: string; ended_at: string | null }>(
    ((shifts ?? []) as { crew_member_id: string; started_at: string; ended_at: string | null }[]).map((s) => [s.crew_member_id, s])
  );
  const absent = new Set(((absences ?? []) as { crew_member_id: string }[]).map((a) => a.crew_member_id));
  // Crew members from other crews who can be pulled onto this crew for today.
  // Names only — read with the service client (scoped to the caller's org)
  // because a crew login's own RLS shouldn't expose other crews' rosters.
  const admin = createServiceClient();
  const [{ data: everyone }, { data: moves }] = await Promise.all([
    admin.from("crm_crew_members").select("id, name, role, crew_id, days_of_week").eq("org_id", orgId).is("deleted_at", null).order("name"),
    admin.from("crm_crew_daily_members").select("member_id, crew_id").eq("org_id", orgId).eq("work_date", workDate),
  ]);
  const movedTo = new Map(((moves ?? []) as { member_id: string; crew_id: string }[]).map((m) => [m.member_id, m.crew_id]));
  const available = ((everyone ?? []) as { id: string; name: string; role: string | null; crew_id: string; days_of_week: number[] | null }[])
    // Not "on a crew today" when rostered off today, so a member of THIS crew who
    // isn't scheduled today can still be pulled in for the day.
    .filter((m) => (movedTo.get(m.id) ?? (memberWorksOn(m.days_of_week, workDate) ? m.crew_id : null)) !== crewId)
    .map((m) => ({ id: m.id, name: m.name, role: m.role }));
  return NextResponse.json({
    workDate,
    available,
    members: ((members ?? []) as { id: string; name: string; role: string | null }[]).map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      absent: absent.has(m.id),
      startedAt: shiftBy.get(m.id)?.started_at ?? null,
      endedAt: shiftBy.get(m.id)?.ended_at ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const ctx = await context(request);
  if ("response" in ctx) return ctx.response;
  const { db, user, orgId, crewId, workDate } = ctx;

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { action, crewMemberId, visitId } = parsed.data;
  const now = new Date().toISOString();

  try {
    if (action === "start_day") {
      const opened = await startCrewDay(db, { orgId, crewId, workDate, at: now, source: "crew", userId: user.id });
      return NextResponse.json({ ok: true, opened });
    }
    if (action === "end_day") {
      const closed = await endCrewDay(db, { orgId, crewId, workDate, at: now });
      return NextResponse.json({ ok: true, closed });
    }

    if (!crewMemberId) return NextResponse.json({ error: "crewMemberId is required" }, { status: 400 });

    // Pull someone from another crew onto this one for today (the same
    // same-day roster move the Dispatch Board's Team Assignment makes), then
    // clock them in below like a late arrival. Written with the service client:
    // the caller can't yet "own" this member, which is what crew RLS checks.
    if (action === "add_member") {
      const admin = createServiceClient();
      const { data: member } = await admin.from("crm_crew_members").select("id").eq("id", crewMemberId).eq("org_id", orgId).is("deleted_at", null).maybeSingle();
      if (!member) return NextResponse.json({ error: "That person isn't in your company's crew list" }, { status: 404 });
      const { error: moveErr } = await admin.from("crm_crew_daily_members").upsert(
        { org_id: orgId, work_date: workDate, crew_id: crewId, member_id: crewMemberId, created_by: user.id },
        { onConflict: "work_date,member_id" }
      );
      if (moveErr) throw new Error(moveErr.message);
    }

    // Per-member actions: the member must be on this crew's roster today.
    const roster = await resolveWorkingMemberIds(db, orgId, crewId, workDate, { includeAbsent: true });
    if (!roster.includes(crewMemberId)) {
      return NextResponse.json({ error: "That crew member isn't on your crew today" }, { status: 403 });
    }

    // The optional visit must be one of THIS crew's visits in this org —
    // RLS only checks org_id, so a stray id could otherwise punch anyone.
    if (visitId) {
      const { data: visit } = await db.from("crm_job_visits")
        .select("id, crew_id, crew_unassigned, crm_jobs(crew_id)")
        .eq("id", visitId).eq("org_id", orgId).is("deleted_at", null).maybeSingle();
      if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
      if (!(await assertCallerOwnsVisit(db, user.id, orgId, visit))) {
        return NextResponse.json({ error: "That visit isn't on your crew" }, { status: 403 });
      }
    }

    if (action === "member_in" || action === "add_member") {
      // Arriving (late): back on the roster and the shift opened/reopened, in
      // one transaction so a failure can't leave them neither absent nor in.
      const { error: inErr } = await db.rpc("crew_day_member_in", {
        p_member: crewMemberId, p_work_date: workDate, p_at: now,
      });
      if (inErr) throw new Error(inErr.message);
      if (visitId) {
        // A job is in progress: the member also joins its job punches from now.
        const { data: punch } = await db.from("crm_crew_member_times").select("id")
          .eq("visit_id", visitId).eq("crew_member_id", crewMemberId).is("deleted_at", null).maybeSingle();
        if (!punch) {
          await db.from("crm_crew_member_times").upsert(
            { org_id: orgId, visit_id: visitId, crew_member_id: crewMemberId, clocked_in_at: now, clocked_out_at: null, deleted_at: null, updated_at: now },
            { onConflict: "visit_id,crew_member_id", ignoreDuplicates: false }
          );
        }
      }
      return NextResponse.json({ ok: true });
    }

    // member_out — left for the day: end the shift, end any open job punch,
    // and drop them from the roster so the next Start Job doesn't punch them.
    // The open shift may have started before midnight (storm work); a
    // forgotten shift older than 16h is left open for payroll to flag.
    await closeMemberOpenShift(db, { orgId, crewMemberId, workDate, at: now });
    if (visitId) {
      await db.from("crm_crew_member_times").update({ clocked_out_at: now, updated_at: now })
        .eq("visit_id", visitId).eq("crew_member_id", crewMemberId).is("deleted_at", null).is("clocked_out_at", null).lt("clocked_in_at", now);
    }
    const { data: absence } = await db.from("crm_crew_day_absences").select("id")
      .eq("crew_member_id", crewMemberId).eq("work_date", workDate).is("deleted_at", null).maybeSingle();
    if (!absence) {
      await db.from("crm_crew_day_absences").insert({ org_id: orgId, crew_member_id: crewMemberId, work_date: workDate, created_by: user.id });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
