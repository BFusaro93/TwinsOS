import { memberWorksOn } from "@/lib/crew/roster-days";
import { effectiveVisitCrewId } from "@/lib/supabase/crew-id";
import { stopKeyForVisit, pickPunchOwner } from "@/lib/utils/visit-stops";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

/**
 * Which of a stop's visits holds its crew punches. Punches are written against
 * whichever visit was the stop's anchor at Start Job; the anchor is re-derived
 * from the visits on every request, so it can change while the job runs (an
 * office edit to a sibling's route order, or an anchor rule change on deploy).
 * Reading or writing punches on the newly derived anchor then orphaned the
 * real ones and seeded a duplicate set. The punches themselves are the source
 * of truth: the visit with open punches wins, then the one with the most
 * punches, then `fallbackId` (the derived anchor) when none has any.
 */
export async function resolvePunchOwnerVisitId(
  supabase: AnySupabase,
  stopVisitIds: string[],
  fallbackId: string
): Promise<string> {
  const ids = [...new Set([fallbackId, ...stopVisitIds])];
  if (ids.length <= 1) return fallbackId;
  try {
    const { data } = await supabase
      .from("crm_crew_member_times")
      .select("visit_id, clocked_out_at")
      .in("visit_id", ids)
      .is("deleted_at", null);
    return pickPunchOwner((data ?? []) as { visit_id: string; clocked_out_at: string | null }[], fallbackId);
  } catch {
    return fallbackId;
  }
}

const STOP_VISIT_SELECT =
  "id, org_id, client_id, scheduled_date, push_number, crew_id, crew_unassigned, crm_jobs:crew_job(crew_id, property_id, service_address, service_city)";

interface StopVisitRow {
  id: string;
  client_id: string | null;
  scheduled_date: string;
  push_number?: number | null;
  crew_id: string | null;
  crew_unassigned: boolean | null;
  crm_jobs: { crew_id: string | null; property_id: string | null; service_address: string | null; service_city: string | null } | null;
}

/**
 * The punch-owning visit of the stop `visitId` belongs to (see
 * resolvePunchOwnerVisitId), for routes that are handed a single visit id —
 * member times, paid breaks. Siblings are derived here from the same stop key
 * the clock-in route uses, never from the request. Returns `visitId` itself
 * when the stop has no punches yet or the lookup fails.
 */
export async function stopPunchOwnerVisitId(supabase: AnySupabase, visitId: string): Promise<string> {
  try {
    const siblingIds = await stopSiblingVisitIds(supabase, visitId);
    return resolvePunchOwnerVisitId(supabase, siblingIds, visitId);
  } catch {
    return visitId;
  }
}

/**
 * Every visit on the same stop as `visitId` (same stop key and effective
 * crew, any status), including `visitId` itself. Derived from the visit, never
 * from the request. Returns just `[visitId]` when the visit can't be read.
 */
export async function stopSiblingVisitIds(supabase: AnySupabase, visitId: string): Promise<string[]> {
  const { data: visit } = await supabase
    .from("crm_job_visits")
    .select(STOP_VISIT_SELECT)
    .eq("id", visitId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!visit) return [visitId];
  const row = visit as StopVisitRow;
  const query = supabase.from("crm_job_visits").select(STOP_VISIT_SELECT);
  const { data: candidates } = await (row.client_id ? query.eq("client_id", row.client_id) : query.is("client_id", null))
    .eq("scheduled_date", row.scheduled_date)
    .is("deleted_at", null);
  const key = stopKeyForVisit(toStopKey(row));
  const ids = ((candidates ?? []) as StopVisitRow[])
    .filter((r) => stopKeyForVisit(toStopKey(r)) === key && effectiveVisitCrewId(r) === effectiveVisitCrewId(row))
    .map((r) => r.id);
  return ids.includes(visitId) ? ids : [visitId, ...ids];
}

function toStopKey(row: StopVisitRow) {
  return {
    clientId: row.client_id ?? "",
    scheduledDate: row.scheduled_date,
    crewId: effectiveVisitCrewId(row),
    pushNumber: row.push_number,
    job: row.crm_jobs
      ? { propertyId: row.crm_jobs.property_id, serviceAddress: row.crm_jobs.service_address, serviceCity: row.crm_jobs.service_city }
      : undefined,
  };
}

/**
 * Crew members working with `crewId` on `workDate`, minus anyone the leader
 * marked absent (unless `includeAbsent`). A same-day reassignment (crm_crew_daily_members) wins over the
 * default roster — the same rule the Dispatch Board's effectiveCrewMemberIds
 * and the member-times route apply.
 */
export async function resolveWorkingMemberIds(
  supabase: AnySupabase,
  orgId: string,
  crewId: string,
  workDate: string,
  opts: {
    includeAbsent?: boolean;
    includeInactive?: boolean;
    /**
     * ISO instant: also include roster rows soft-deleted at/after it. End Day
     * passes this so a member removed from the crew mid-day still has the shift
     * they were already on closed (otherwise it stayed open for payroll to flag).
     */
    includeRemovedSince?: string;
  } = {}
): Promise<string[]> {
  const memberQuery = supabase.from("crm_crew_members").select("id, crew_id, employee_id, days_of_week").eq("org_id", orgId);
  const [{ data: defaults }, { data: overrides }, { data: absences }] = await Promise.all([
    opts.includeRemovedSince
      ? memberQuery.or(`deleted_at.is.null,deleted_at.gte."${opts.includeRemovedSince}"`)
      : memberQuery.is("deleted_at", null),
    supabase.from("crm_crew_daily_members").select("member_id, crew_id").eq("org_id", orgId).eq("work_date", workDate),
    supabase.from("crm_crew_day_absences").select("crew_member_id").eq("org_id", orgId).eq("work_date", workDate).is("deleted_at", null),
  ]);
  const overrideCrew = new Map<string, string>(
    ((overrides ?? []) as { member_id: string; crew_id: string }[]).map((o) => [o.member_id, o.crew_id])
  );
  const absent = new Set(((absences ?? []) as { crew_member_id: string }[]).map((a) => a.crew_member_id));
  const onCrew = ((defaults ?? []) as { id: string; crew_id: string; employee_id: string | null; days_of_week: number[] | null }[])
    .filter((m) => {
      const moved = overrideCrew.get(m.id);
      // A same-day move is explicit; otherwise the member is only on their default
      // crew on the days they're rostered for it.
      if (moved === undefined && !memberWorksOn(m.days_of_week, workDate)) return false;
      return (moved ?? m.crew_id) === crewId && (opts.includeAbsent || !absent.has(m.id));
    });

  // A deactivated (terminated) employee can still have a roster row. Without
  // this they were punched in by every Start Day / Start Job and carried on
  // payroll. End Day passes includeInactive so a shift of someone deactivated
  // mid-day can still be closed. Read separately and fail-open: if the
  // employees can't be read the roster is returned as before.
  const employeeIds = [...new Set(onCrew.map((m) => m.employee_id).filter((v): v is string => !!v))];
  if (employeeIds.length === 0 || opts.includeInactive) return onCrew.map((m) => m.id);
  const { data: employees } = await supabase
    .from("crm_employees")
    .select("id, is_active, deleted_at")
    .in("id", employeeIds);
  const inactive = new Set(
    ((employees ?? []) as { id: string; is_active: boolean | null; deleted_at: string | null }[])
      .filter((e) => e.is_active === false || !!e.deleted_at)
      .map((e) => e.id)
  );
  return onCrew.filter((m) => !m.employee_id || !inactive.has(m.employee_id)).map((m) => m.id);
}

/**
 * Start Job: the crew leader clocks in the whole crew. Punches every working
 * member against the stop's anchor visit at the clock-in instant, leaving
 * alone anyone who already has an open punch (a double tap, or a member the
 * leader punched individually first). Non-throwing — a failed auto-punch must
 * never block the crew from starting the job; the office can still add punches.
 * Reports `rosterEmpty` when nobody is on the crew that day, so the crew app can warn that
 * no time is being recorded for payroll.
 */
export async function openStopPunches(
  supabase: AnySupabase,
  anchor: { id: string; orgId: string; crewId: string | null; scheduledDate: string },
  clockedInAt: string
): Promise<{ rosterEmpty: boolean }> {
  try {
    if (!anchor.crewId) return { rosterEmpty: true };
    const memberIds = await resolveWorkingMemberIds(supabase, anchor.orgId, anchor.crewId, anchor.scheduledDate);
    if (memberIds.length === 0) return { rosterEmpty: true };

    const { data: existing } = await supabase
      .from("crm_crew_member_times")
      .select("crew_member_id")
      .eq("visit_id", anchor.id)
      .is("deleted_at", null);
    const punched = new Set(((existing ?? []) as { crew_member_id: string }[]).map((p) => p.crew_member_id));
    const rows = memberIds
      .filter((id) => !punched.has(id))
      .map((id) => ({
        org_id: anchor.orgId,
        visit_id: anchor.id,
        crew_member_id: id,
        clocked_in_at: clockedInAt,
        clocked_out_at: null,
        deleted_at: null,
        updated_at: clockedInAt,
      }));
    if (rows.length === 0) return { rosterEmpty: false };
    await supabase
      .from("crm_crew_member_times")
      .upsert(rows, { onConflict: "visit_id,crew_member_id", ignoreDuplicates: false });
    return { rosterEmpty: false };
  } catch {
    // Non-fatal — see above.
    return { rosterEmpty: false };
  }
}

/**
 * Stop Job: closes every still-open punch on the anchor visit at the clock-out
 * instant. A member whose punch-in is at/after that instant (arrived as the
 * crew was leaving) gets a zero-length punch rather than a negative one.
 * Non-throwing.
 */
export async function closeStopPunches(
  supabase: AnySupabase,
  anchorVisitId: string,
  clockedOutAt: string
): Promise<void> {
  try {
    const { data: open } = await supabase
      .from("crm_crew_member_times")
      .select("id, clocked_in_at")
      .eq("visit_id", anchorVisitId)
      .is("deleted_at", null)
      .is("clocked_out_at", null)
      .not("clocked_in_at", "is", null);
    const outMs = new Date(clockedOutAt).getTime();
    for (const p of (open ?? []) as { id: string; clocked_in_at: string }[]) {
      const out = new Date(p.clocked_in_at).getTime() >= outMs ? p.clocked_in_at : clockedOutAt;
      await supabase
        .from("crm_crew_member_times")
        .update({ clocked_out_at: out, updated_at: clockedOutAt })
        .eq("id", p.id)
        .is("clocked_out_at", null);
    }
  } catch {
    // Non-fatal — the office can close a punch from Edit Job Times.
  }
}
