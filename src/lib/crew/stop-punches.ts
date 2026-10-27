import { memberWorksOn } from "@/lib/crew/roster-days";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

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
  opts: { includeAbsent?: boolean } = {}
): Promise<string[]> {
  const [{ data: defaults }, { data: overrides }, { data: absences }] = await Promise.all([
    supabase.from("crm_crew_members").select("id, crew_id, days_of_week").eq("org_id", orgId).is("deleted_at", null),
    supabase.from("crm_crew_daily_members").select("member_id, crew_id").eq("org_id", orgId).eq("work_date", workDate),
    supabase.from("crm_crew_day_absences").select("crew_member_id").eq("org_id", orgId).eq("work_date", workDate).is("deleted_at", null),
  ]);
  const overrideCrew = new Map<string, string>(
    ((overrides ?? []) as { member_id: string; crew_id: string }[]).map((o) => [o.member_id, o.crew_id])
  );
  const absent = new Set(((absences ?? []) as { crew_member_id: string }[]).map((a) => a.crew_member_id));
  return ((defaults ?? []) as { id: string; crew_id: string; days_of_week: number[] | null }[])
    .filter((m) => {
      const moved = overrideCrew.get(m.id);
      // A same-day move is explicit; otherwise the member is only on their default
      // crew on the days they're rostered for it.
      if (moved === undefined && !memberWorksOn(m.days_of_week, workDate)) return false;
      return (moved ?? m.crew_id) === crewId && (opts.includeAbsent || !absent.has(m.id));
    })
    .map((m) => m.id);
}

/**
 * Start Job: the crew leader clocks in the whole crew. Punches every working
 * member against the stop's anchor visit at the clock-in instant, leaving
 * alone anyone who already has an open punch (a double tap, or a member the
 * leader punched individually first). Non-throwing — a failed auto-punch must
 * never block the crew from starting the job; the office can still add punches.
 */
export async function openStopPunches(
  supabase: AnySupabase,
  anchor: { id: string; orgId: string; crewId: string | null; scheduledDate: string },
  clockedInAt: string
): Promise<void> {
  try {
    if (!anchor.crewId) return;
    const memberIds = await resolveWorkingMemberIds(supabase, anchor.orgId, anchor.crewId, anchor.scheduledDate);
    if (memberIds.length === 0) return;

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
    if (rows.length === 0) return;
    await supabase
      .from("crm_crew_member_times")
      .upsert(rows, { onConflict: "visit_id,crew_member_id", ignoreDuplicates: false });
  } catch {
    // Non-fatal — see above.
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
