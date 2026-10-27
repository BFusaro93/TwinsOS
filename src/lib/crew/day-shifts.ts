import { resolveWorkingMemberIds } from "@/lib/crew/stop-punches";
import { shiftYmd } from "@/lib/time/zone";

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
    .select("id, crew_member_id, ended_at, break_minutes")
    .eq("org_id", p.orgId)
    .eq("work_date", p.workDate)
    .is("deleted_at", null)
    .in("crew_member_id", memberIds);
  const has = new Set(((existing ?? []) as { crew_member_id: string }[]).map((r) => r.crew_member_id));

  // A job started after End Day (storm call-back, an accidental End Day, a
  // second shift): the member's shift for today is already ended, and the
  // unique member+day index means no new one can be opened — so the hours
  // worked after End Day were never on the clock and payroll (which pays the
  // shift) silently dropped them. Reopen it the way a late "member in" does,
  // taking the time away off the clock. Only when a job start triggers it:
  // an explicit Start Day on an ended day stays a no-op.
  if (p.source === "auto_first_job") {
    const atMs = new Date(p.at).getTime();
    for (const s of (existing ?? []) as { id: string; ended_at: string | null; break_minutes: number | null }[]) {
      if (!s.ended_at) continue;
      const endedMs = new Date(s.ended_at).getTime();
      if (endedMs >= atMs) continue;
      const awayMinutes = Math.max(0, Math.round((atMs - endedMs) / 60_000));
      const { error: reopenErr } = await supabase
        .from("crm_crew_day_shifts")
        .update({ ended_at: null, break_minutes: Number(s.break_minutes ?? 0) + awayMinutes })
        .eq("id", s.id)
        .eq("ended_at", s.ended_at);
      if (reopenErr) throw new Error(reopenErr.message);
    }
  }
  const rows = memberIds
    .filter((id) => !has.has(id))
    .map((id) => ({
      org_id: p.orgId, crew_member_id: id, work_date: p.workDate,
      started_at: p.at, source: p.source, created_by: p.userId,
    }));
  if (rows.length === 0) return 0;
  const { error } = await supabase.from("crm_crew_day_shifts").insert(rows);
  if (!error) return rows.length;
  // 23505 = a double tap / offline retry already opened the shift (partial
  // unique index on member+day). Idempotent: insert row by row and count only
  // the ones that actually landed.
  if (error.code !== "23505") throw new Error(error.message);
  let opened = 0;
  for (const row of rows) {
    const { error: rowErr } = await supabase.from("crm_crew_day_shifts").insert(row);
    if (!rowErr) opened += 1;
    else if (rowErr.code !== "23505") throw new Error(rowErr.message);
  }
  return opened;
}

/**
 * An open shift older than this is a forgotten one: End Day / leaving early
 * leaves it open so payroll flags it, instead of paying ~a full day.
 */
export const MAX_AUTO_CLOSE_SHIFT_MS = 16 * 3_600_000;

/**
 * Closes one member's open shift (today's, or one that crossed midnight) at
 * `at`. Returns whether a shift was closed. Throws on a write failure.
 */
export async function closeMemberOpenShift(
  supabase: AnySupabase,
  p: { orgId: string; crewMemberId: string; workDate: string; at: string }
): Promise<boolean> {
  const atMs = new Date(p.at).getTime();
  const { data: openRows } = await supabase.from("crm_crew_day_shifts").select("id, started_at")
    .eq("crew_member_id", p.crewMemberId).eq("org_id", p.orgId)
    .gte("work_date", openShiftLookbackDate(p.workDate)).lte("work_date", p.workDate)
    .gt("started_at", new Date(atMs - MAX_AUTO_CLOSE_SHIFT_MS).toISOString())
    .is("deleted_at", null).is("ended_at", null)
    .order("started_at", { ascending: false }).limit(1);
  const open = ((openRows ?? []) as { id: string; started_at: string }[])[0];
  if (!open) return false;
  const end = new Date(open.started_at).getTime() > atMs ? open.started_at : p.at;
  const { error } = await supabase.from("crm_crew_day_shifts").update({ ended_at: end }).eq("id", open.id).is("ended_at", null);
  if (error) throw new Error(error.message);
  return true;
}

/**
 * The earliest work_date an open shift may still be closed from. A shift that
 * started the evening before and runs past midnight keeps the earlier
 * work_date, so closing it has to look back one day. Anything older than that
 * is a forgotten shift — leave it open (payroll flags it) instead of closing
 * it at an absurd length.
 */
export function openShiftLookbackDate(workDate: string): string {
  return shiftYmd(workDate, -1);
}

/** Closes every open shift for the crew's roster (today's, or one that crossed midnight). Returns how many closed. */
export async function endCrewDay(
  supabase: AnySupabase,
  p: { orgId: string; crewId: string; workDate: string; at: string }
): Promise<number> {
  // includeAbsent: someone who left early was marked absent but still has a shift to close.
  const memberIds = await resolveWorkingMemberIds(supabase, p.orgId, p.crewId, p.workDate, { includeAbsent: true, includeInactive: true });
  if (memberIds.length === 0) return 0;
  const { data: open } = await supabase
    .from("crm_crew_day_shifts")
    .select("id, started_at")
    .eq("org_id", p.orgId)
    .gte("work_date", openShiftLookbackDate(p.workDate))
    .lte("work_date", p.workDate)
    .gt("started_at", new Date(new Date(p.at).getTime() - MAX_AUTO_CLOSE_SHIFT_MS).toISOString())
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
