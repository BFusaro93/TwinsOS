import { NextResponse } from "next/server";
import { z } from "zod";
import { recomputeStopLabor } from "@/lib/crew/visit-labor";
import { stopPunchOwnerVisitId } from "@/lib/crew/stop-punches";
import { createServiceClient } from "@/lib/supabase/server";
import { getRouteAuth, assertCallerOwnsVisit, effectiveVisitCrewId } from "@/lib/supabase/route-auth";
import { assertOrgWritable } from "@/lib/org-writable";
import { isPayrollLockedError } from "@/lib/crew/payroll-lock";

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
 *     punch on this visit (so a correction survives a later roster change — or
 *     the member being removed from the crew: their existing punch stays
 *     editable, but a removed member gets no NEW punch);
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
  /** Office only: the member's own break on this punch, in minutes (replaces it). Ignored for crew logins. */
  breakMinutes: z.number().int().min(0).max(1440).nullable().optional(),
});

const DeleteBody = z.object({ crewMemberId: z.string().uuid() });

const VISIT_SELECT = "id, org_id, crew_id, crew_unassigned, scheduled_date, crm_jobs:crew_job(crew_id)";

interface VisitRow {
  id: string;
  org_id: string;
  crew_id: string | null;
  scheduled_date: string;
  crm_jobs: { crew_id: string | null } | null;
}

type Supabase = Awaited<ReturnType<typeof getRouteAuth>>["supabase"];


const INVOICED_PUNCH_MESSAGE =
  "This visit's invoice has already been sent, so crew punches can't be changed. Ask the office to correct the time.";

/**
 * True when the visit carries a line on an ISSUED invoice (not deleted, not
 * draft, not void). A draft doesn't count: clock-out auto-invoices the visit
 * onto a draft straight away, and crew must still be able to fix their punches
 * after Stop Job — auto-invoice lines bill the service's qty × rate, not punch
 * hours, so a punch edit doesn't change the draft's amount. (Stricter than
 * lib/visits/invoiced-guard on purpose — that one guards moving/un-completing
 * the visit, which a draft invoice line does depend on.) Fails closed: if the
 * check errors, a crew caller is refused rather than let rewrite billed hours.
 */
async function visitIsInvoiced(_supabase: Supabase, visitId: string): Promise<boolean> {
  // Crew logins can't read crm_invoice_line_items (RLS), so a user-scoped query
  // would return no rows and the lock would never fire. The visit was already
  // authorized for the caller, so look up billing state with the service client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (createServiceClient() as any)
    .from("crm_invoice_line_items")
    .select("visit_id, crm_invoices!inner(deleted_at, status)")
    .eq("visit_id", visitId)
    .is("crm_invoices.deleted_at", null)
    .not("crm_invoices.status", "in", "(draft,void)")
    .limit(1);
  if (error) return true;
  return (data ?? []).length > 0;
}

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
  // Punches belong to the stop, held on whichever of its visits owned them at
  // Start Job. If the caller's derived anchor is a different sibling, read and
  // write the owner's punches rather than seeding a second set. The owner
  // shares the stop key — and so the effective crew — of the visit just
  // authorized.
  const ownerId = await stopPunchOwnerVisitId(supabase, visit.id);
  if (ownerId !== visit.id) {
    const { data: owner } = await db
      .from("crm_job_visits")
      .select(VISIT_SELECT)
      .eq("id", ownerId)
      .is("deleted_at", null)
      .maybeSingle();
    if (owner) return { visit: owner as VisitRow, isCrew };
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
  // Not filtered on deleted_at: a member removed from the crew (soft-deleted
  // roster row) mid-day must still have the punch they already have corrected.
  const { data: member } = await db
    .from("crm_crew_members")
    .select("id, crew_id, org_id, deleted_at")
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
  // Removed from the crew: no new punches.
  if (member.deleted_at) return false;

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
  // Crew edits write with the service role (no read-only-when-canceled RLS).
  const readOnly = await assertOrgWritable(createServiceClient(), visit.org_id);
  if (readOnly) return readOnly;

  // Crew can't rewrite punches once the visit's invoice is issued (a draft is
  // fine); office keeps the ability.
  if (isCrew && (await visitIsInvoiced(supabase, visit.id))) {
    return NextResponse.json({ error: INVOICED_PUNCH_MESSAGE, code: "invoiced_visit_locked" }, { status: 409 });
  }

  const { crewMemberId } = parsed.data;
  const clockedInAt = parsed.data.clockedInAt ?? null;
  const clockedOutAt = parsed.data.clockedOutAt ?? null;

  const problem = validatePunch(clockedInAt, clockedOutAt, isCrew);
  if (problem) return NextResponse.json({ error: problem }, { status: 422 });

  if (!(await memberBelongsToVisit(supabase, visit, crewMemberId))) {
    return NextResponse.json({ error: "That crew member isn't on this visit's crew" }, { status: 403 });
  }

  // Crew logins can't write punches directly (RLS) — after the checks above
  // their edit goes through the service client. Office edits stay under RLS.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writer = (isCrew ? createServiceClient() : supabase) as any;

  // A corrected in/out kept the punch's old break and lunch: a member who came
  // back (time away is added to break_minutes) and was then corrected to a
  // short punch could keep a break longer than the punch and drop to 0 hours.
  // With both times given: the office may set the break outright; otherwise the
  // existing break and lunch are kept but clamped to the new punch length.
  const breakFields: { break_minutes?: number; lunch_minutes?: number } = {};
  if (clockedInAt && clockedOutAt) {
    const punchMinutes = Math.floor((Date.parse(clockedOutAt) - Date.parse(clockedInAt)) / 60_000);
    const { data: prior } = await writer
      .from("crm_crew_member_times")
      .select("break_minutes, lunch_minutes")
      .eq("visit_id", visit.id)
      .eq("crew_member_id", crewMemberId)
      .is("deleted_at", null)
      .maybeSingle();
    const lunch = Math.min(Math.max(0, Number(prior?.lunch_minutes ?? 0)), punchMinutes);
    const requested = !isCrew && parsed.data.breakMinutes != null ? parsed.data.breakMinutes : null;
    if (requested != null && requested + lunch > punchMinutes) {
      return NextResponse.json({ error: "The break can't be longer than the time worked on this punch." }, { status: 422 });
    }
    breakFields.break_minutes = requested ?? Math.min(Math.max(0, Number(prior?.break_minutes ?? 0)), punchMinutes - lunch);
    breakFields.lunch_minutes = lunch;
  }

  const now = new Date().toISOString();
  // Upsert — one record per (visit_id, crew_member_id). deleted_at is cleared
  // so re-adding a member whose punch was removed revives that row (the unique
  // constraint would otherwise reject a second one).
  const { data, error } = await writer
    .from("crm_crew_member_times")
    .upsert(
      {
        org_id:         visit.org_id,
        visit_id:       visit.id,
        crew_member_id: crewMemberId,
        clocked_in_at:  clockedInAt,
        clocked_out_at: clockedOutAt,
        ...breakFields,
        deleted_at:     null,
        updated_at:     now,
      },
      { onConflict: "visit_id,crew_member_id", ignoreDuplicates: false }
    )
    .select()
    .single();

  // Inside the payroll lock period: the database's own sentence, as a 409.
  if (error) return NextResponse.json({ error: error.message }, { status: isPayrollLockedError(error.message) ? 409 : 500 });
  // Keep an already-closed stop's stored labor cost in step with the edit.
  await recomputeStopLabor(supabase, visit.id);
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
  const readOnly = await assertOrgWritable(createServiceClient(), auth.visit.org_id);
  if (readOnly) return readOnly;
  if (auth.isCrew && (await visitIsInvoiced(supabase, auth.visit.id))) {
    return NextResponse.json({ error: INVOICED_PUNCH_MESSAGE, code: "invoiced_visit_locked" }, { status: 409 });
  }

  // Soft delete — never hard-delete payroll punches. Crew logins can't write
  // punches directly (RLS), so theirs goes through the service client.
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((auth.isCrew ? createServiceClient() : supabase) as any)
    .from("crm_crew_member_times")
    .update({ deleted_at: now, updated_at: now })
    .eq("visit_id", auth.visit.id)
    .eq("crew_member_id", parsed.data.crewMemberId)
    .is("deleted_at", null);

  // Inside the payroll lock period: the database's own sentence, as a 409.
  if (error) return NextResponse.json({ error: error.message }, { status: isPayrollLockedError(error.message) ? 409 : 500 });
  await recomputeStopLabor(supabase, auth.visit.id);
  return NextResponse.json({ ok: true });
}

/**
 * Re-derives the stop's hours and labor from its punches without changing any
 * punch. The Dispatch Board's Edit Job Times dialog rolls the crew's earliest
 * in / latest out up onto the visits after a punch edit, which rewrites the
 * visits' times and hours; this puts hours and labor back on the punches.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId } = await params;
  const auth = await authorizeVisit(supabase, user.id, visitId);
  if ("response" in auth) return auth.response;
  const readOnly = await assertOrgWritable(createServiceClient(), auth.visit.org_id);
  if (readOnly) return readOnly;

  await recomputeStopLabor(supabase, auth.visit.id);
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

  // Inside the payroll lock period: the database's own sentence, as a 409.
  if (error) return NextResponse.json({ error: error.message }, { status: isPayrollLockedError(error.message) ? 409 : 500 });
  return NextResponse.json(data);
}
