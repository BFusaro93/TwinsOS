import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth, resolveCallerCrewId } from "@/lib/supabase/route-auth";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { resolveWorkingMemberIds } from "@/lib/crew/stop-punches";
import { startCrewDay, endCrewDay } from "@/lib/crew/day-shifts";

/**
 * The crew's paid day (shop to shop).
 *   GET  — today's roster with each member's shift and absent flag.
 *   POST — { action: "start_day" | "end_day" | "member_in" | "member_out" }.
 *
 * Crew logins only, and only for their own crew's roster. The work date is the
 * org's today, computed here — never taken from the request.
 */
const Body = z.object({
  action: z.enum(["start_day", "end_day", "member_in", "member_out"]),
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
  return NextResponse.json({
    workDate,
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

    // Per-member actions: the member must be on this crew's roster today.
    if (!crewMemberId) return NextResponse.json({ error: "crewMemberId is required" }, { status: 400 });
    const roster = await resolveWorkingMemberIds(db, orgId, crewId, workDate, { includeAbsent: true });
    if (!roster.includes(crewMemberId)) {
      return NextResponse.json({ error: "That crew member isn't on your crew today" }, { status: 403 });
    }

    if (action === "member_in") {
      // Arriving (late): back on the roster, shift starts now.
      await db.from("crm_crew_day_absences").update({ deleted_at: now })
        .eq("crew_member_id", crewMemberId).eq("work_date", workDate).is("deleted_at", null);
      const { data: shift } = await db.from("crm_crew_day_shifts").select("id, ended_at, break_minutes")
        .eq("crew_member_id", crewMemberId).eq("work_date", workDate).is("deleted_at", null).maybeSingle();
      if (shift) {
        // Already has a shift today (left, then came back): reopen it, and take
        // the time they were away off the clock as an unpaid break.
        const awayMinutes = shift.ended_at
          ? Math.max(0, Math.round((Date.now() - new Date(shift.ended_at as string).getTime()) / 60_000))
          : 0;
        await db.from("crm_crew_day_shifts")
          .update({ ended_at: null, break_minutes: Number(shift.break_minutes ?? 0) + awayMinutes })
          .eq("id", shift.id);
      } else {
        const { error } = await db.from("crm_crew_day_shifts").insert({
          org_id: orgId, crew_member_id: crewMemberId, work_date: workDate, started_at: now, source: "crew", created_by: user.id,
        });
        if (error) throw new Error(error.message);
      }
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
    const { data: open } = await db.from("crm_crew_day_shifts").select("id, started_at")
      .eq("crew_member_id", crewMemberId).eq("work_date", workDate).is("deleted_at", null).is("ended_at", null).maybeSingle();
    if (open) {
      const end = new Date(open.started_at as string).getTime() > Date.now() ? open.started_at : now;
      await db.from("crm_crew_day_shifts").update({ ended_at: end }).eq("id", open.id);
    }
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
