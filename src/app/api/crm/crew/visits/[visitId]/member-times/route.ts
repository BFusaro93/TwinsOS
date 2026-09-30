import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth, assertCallerOwnsVisit, effectiveVisitCrewId } from "@/lib/supabase/route-auth";

/**
 * Per-crew-member punches for a visit (crm_crew_member_times). Written by the
 * crew tablet's Edit Crew dialog AND the office Dispatch Board's Edit Job
 * Times dialog — so the caller is either a crew login or office staff.
 *
 * Guards (none of which existed before — any crew login in the org could
 * rewrite any visit's payroll punches for any crew member id):
 *   - crew callers must own the visit (its EFFECTIVE crew — see
 *     assertCallerOwnsVisit); staff are gated by crm_job_visits RLS, which
 *     only returns the visit to office roles in the same org;
 *   - crewMemberId must be on the visit's effective crew (default roster, or a
 *     same-day crm_crew_daily_members reassignment onto it), or already have a
 *     punch on this visit (so a correction survives a later roster change);
 *   - timestamps must be real ISO datetimes, out after in, and a sane length;
 *   - DELETE soft-deletes (deleted_at), per the repo's no-hard-delete rule.
 */

/** A single punch longer than this is a typo (wrong AM/PM, wrong day), not a shift. */
const MAX_PUNCH_HOURS = 24;
/** Clock skew allowance for a crew device stamping "now". */
const FUTURE_SKEW_MS = 15 * 60_000;

const IsoDateTime = z.string().datetime({ offset: true });

const Body = z.object({
  crewMemberId: z.string().uuid(),
  clockedInAt:  IsoDateTime.nullable().optional(),
  clockedOutAt: IsoDateTime.nullable().optional(),
});

const DeleteBody = z.object({ crewMemberId: z.string().uuid() });

const VISIT_SELECT = "id, org_id, crew_id, scheduled_date, crm_jobs(crew_id)";

interface VisitRow {
  id: string;
  org_id: string;
  crew_id: string | null;
  scheduled_date: string;
  crm_jobs: { crew_id: string | null } | null;
}

type Supabase = Awaited<ReturnType<typeof getRouteAuth>>["supabase"];

/**
 * Loads the visit and authorizes the caller against it. Returns the visit and
 * whether the caller is a crew login, or a ready-made error response.
 */
async function authorizeVisit(
  supabase: Supabase,
  userId: string,
  visitId: string
): Promise<{ visit: VisitRow; isCrew: boolean } | { response: NextResponse }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: profile } = await db
    .from("profiles")
    .select("org_id, role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.org_id) {
    return { response: NextResponse.json({ error: "No organization for this user" }, { status: 403 }) };
  }

  const { data: visit, error } = await db
    .from("crm_job_visits")
    .select(VISIT_SELECT)
    .eq("id", visitId)
    // Org scoping is RLS's job here (my_org_id(), which honours staff
    // impersonation) — profiles.org_id would be the impersonator's own org.
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { response: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!visit) return { response: NextResponse.json({ error: "Visit not found" }, { status: 404 }) };

  const isCrew = profile.role === "crew";
  if (isCrew && !(await assertCallerOwnsVisit(supabase, userId, visit.org_id, visit))) {
    return { response: NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 }) };
  }
  return { visit: visit as VisitRow, isCrew };
}

/** True when this crew member may have a punch on this visit — see the file header. */
async function memberBelongsToVisit(
  supabase: Supabase,
  visit: VisitRow,
  crewMemberId: string
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: member } = await db
    .from("crm_crew_members")
    .select("id, crew_id, org_id")
    .eq("id", crewMemberId)
    .eq("org_id", visit.org_id)
    .maybeSingle();
  if (!member) return false;

  const { data: existing } = await db
    .from("crm_crew_member_times")
    .select("id")
    .eq("visit_id", visit.id)
    .eq("crew_member_id", crewMemberId)
    .is("deleted_at", null)
    .limit(1);
  if ((existing ?? []).length > 0) return true;

  const crewId = effectiveVisitCrewId(visit);
  // An unassigned visit has no roster to check against; the member is already
  // proven to be in the visit's org. (Crew callers can't get here — owning the
  // visit requires it to have an effective crew.)
  if (!crewId) return true;

  // Same-day reassignment wins over the default roster, matching
  // effectiveCrewMemberIds() on the Dispatch Board.
  const { data: override } = await db
    .from("crm_crew_daily_members")
    .select("crew_id")
    .eq("org_id", visit.org_id)
    .eq("work_date", visit.scheduled_date)
    .eq("member_id", crewMemberId)
    .maybeSingle();
  if (override) return override.crew_id === crewId;
  return member.crew_id === crewId;
}

/** Returns a human-readable problem with the punch, or null when it's sane. */
function validatePunch(
  clockedInAt: string | null,
  clockedOutAt: string | null,
  isCrew: boolean
): string | null {
  const inMs = clockedInAt ? new Date(clockedInAt).getTime() : null;
  const outMs = clockedOutAt ? new Date(clockedOutAt).getTime() : null;
  if (outMs !== null && inMs === null) return "Clock in before clocking out.";
  if (inMs !== null && outMs !== null) {
    if (outMs <= inMs) return "Clock-out must be after clock-in.";
    if (outMs - inMs > MAX_PUNCH_HOURS * 3_600_000) {
      return `A single punch can't be longer than ${MAX_PUNCH_HOURS} hours — check the date and AM/PM.`;
    }
  }
  // Crew devices stamp "now"; a punch in the future is a wrong clock or a
  // crafted request. Office corrections are left alone here.
  if (isCrew) {
    const limit = Date.now() + FUTURE_SKEW_MS;
    if ((inMs !== null && inMs > limit) || (outMs !== null && outMs > limit)) {
      return "Punch times can't be in the future.";
    }
  }
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const auth = await authorizeVisit(supabase, user.id, visitId);
  if ("response" in auth) return auth.response;
  const { visit, isCrew } = auth;

  const { crewMemberId } = parsed.data;
  const clockedInAt = parsed.data.clockedInAt ?? null;
  const clockedOutAt = parsed.data.clockedOutAt ?? null;

  const problem = validatePunch(clockedInAt, clockedOutAt, isCrew);
  if (problem) return NextResponse.json({ error: problem }, { status: 422 });

  if (!(await memberBelongsToVisit(supabase, visit, crewMemberId))) {
    return NextResponse.json({ error: "That crew member isn't on this visit's crew" }, { status: 403 });
  }

  const now = new Date().toISOString();
  // Upsert — one record per (visit_id, crew_member_id). deleted_at is cleared
  // so re-adding a member whose punch was removed revives that row (the unique
  // constraint would otherwise reject a second one).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_crew_member_times")
    .upsert(
      {
        org_id:         visit.org_id,
        visit_id:       visit.id,
        crew_member_id: crewMemberId,
        clocked_in_at:  clockedInAt,
        clocked_out_at: clockedOutAt,
        deleted_at:     null,
        updated_at:     now,
      },
      { onConflict: "visit_id,crew_member_id", ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId } = await params;
  const parsed = DeleteBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const auth = await authorizeVisit(supabase, user.id, visitId);
  if ("response" in auth) return auth.response;

  // Soft delete — never hard-delete payroll punches.
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("crm_crew_member_times")
    .update({ deleted_at: now, updated_at: now })
    .eq("visit_id", auth.visit.id)
    .eq("crew_member_id", parsed.data.crewMemberId)
    .is("deleted_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId } = await params;
  const auth = await authorizeVisit(supabase, user.id, visitId);
  if ("response" in auth) return auth.response;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_crew_member_times")
    .select("*, crm_crew_members(name, role)")
    .eq("visit_id", auth.visit.id)
    .is("deleted_at", null)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
