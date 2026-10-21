import { resolveWorkingMemberIds } from "@/lib/crew/stop-punches";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

/**
 * The paid day is shop to shop: Start Day / End Day, tapped once by the crew
 * leader for everyone working. Stop punches (crm_crew_member_times) stay
 * job-level for Job Costing; payroll reads these shifts.
 */

/**
 * Opens a shift for every working member (roster minus absent) who doesn't
 * already have one today. Returns how many were opened. Throws on a write
 * failure — the Start Day route must not report success when nothing saved;
 * the Start Job caller wraps it, since a failed auto-open must not block a job.
 */
export async function startCrewDay(
  supabase: AnySupabase,
  p: { orgId: string; crewId: string; workDate: string; at: string; source: "crew" | "auto_first_job"; userId: string | null }
): Promise<number> {
  const memberIds = await resolveWorkingMemberIds(supabase, p.orgId, p.crewId, p.workDate);
  if (memberIds.length === 0) return 0;
  const { data: existing } = await supabase
    .from("crm_crew_day_shifts")
    .select("crew_member_id")
    .eq("org_id", p.orgId)
    .eq("work_date", p.workDate)
    .is("deleted_at", null)
    .in("crew_member_id", memberIds);
  const has = new Set(((existing ?? []) as { crew_member_id: string }[]).map((r) => r.crew_member_id));
  const rows = memberIds
    .filter((id) => !has.has(id))
    .map((id) => ({
      org_id: p.orgId, crew_member_id: id, work_date: p.workDate,
      started_at: p.at, source: p.source, created_by: p.userId,
    }));
  if (rows.length === 0) return 0;
  const { error } = await supabase.from("crm_crew_day_shifts").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

/** Closes every open shift for the crew's roster today. Returns how many closed. */
export async function endCrewDay(
  supabase: AnySupabase,
  p: { orgId: string; crewId: string; workDate: string; at: string }
): Promise<number> {
  // includeAbsent: someone who left early was marked absent but still has a shift to close.
  const memberIds = await resolveWorkingMemberIds(supabase, p.orgId, p.crewId, p.workDate, { includeAbsent: true });
  if (memberIds.length === 0) return 0;
  const { data: open } = await supabase
    .from("crm_crew_day_shifts")
    .select("id, started_at")
    .eq("org_id", p.orgId)
    .eq("work_date", p.workDate)
    .is("deleted_at", null)
    .is("ended_at", null)
    .in("crew_member_id", memberIds);
  const atMs = new Date(p.at).getTime();
  let closed = 0;
  for (const s of (open ?? []) as { id: string; started_at: string }[]) {
    // Never end before the start (clock skew / an offline-queued tap).
    const end = new Date(s.started_at).getTime() > atMs ? s.started_at : p.at;
    const { error } = await supabase.from("crm_crew_day_shifts").update({ ended_at: end }).eq("id", s.id).is("ended_at", null);
    if (error) throw new Error(error.message);
    closed += 1;
  }
  return closed;
}
