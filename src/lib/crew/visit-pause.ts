/**
 * A stop's pause (Pause/Resume: lunch, waiting out rain, stopping for the day)
 * is stored once on the VISIT as a minute total (crm_job_visits.break_minutes);
 * the individual pause intervals are not kept. Every member's punch used to be
 * docked the whole total, so someone who joined after the pause (or left before
 * it) lost time they actually worked, and a member who left at 4pm lost an
 * overnight pause to 0 hours.
 *
 * The rule now, shared by payroll (compute.ts), Job Costing (visit-labor.ts),
 * the punch-mismatch flag and the rpt_timesheets view (which must agree with
 * the app — the Timesheet total equals the visit hours):
 *
 *   a member's share of the visit pause = min(pause minutes, the minutes their
 *   punch overlaps the visit's own clock window)
 *
 * so it can never exceed the time they were on the job, nor their punch length.
 * The window is the visit's clocked_in_at → clocked_out_at, each falling back
 * to the punch's own edge when the visit doesn't have it.
 *
 * Limitation: without the pause intervals this is a cap, not an exact overlap.
 * A member present for most of the visit but not during the pause itself is
 * still docked up to their overlap. Exact per-person pause time would need the
 * pause intervals stored (a pauses table) — deliberately not done here.
 *
 * Pure: safe in client components.
 */
export function memberVisitPauseMinutes(p: {
  pauseMinutes: number | null | undefined;
  punchIn: string;
  punchOut: string;
  visitIn?: string | null;
  visitOut?: string | null;
}): number {
  const pause = Math.max(0, Number(p.pauseMinutes ?? 0));
  if (pause === 0) return 0;
  const inMs = Date.parse(p.punchIn);
  const outMs = Date.parse(p.punchOut);
  if (!Number.isFinite(inMs) || !Number.isFinite(outMs)) return 0;
  const vIn = p.visitIn ? Date.parse(p.visitIn) : NaN;
  const vOut = p.visitOut ? Date.parse(p.visitOut) : NaN;
  const from = Math.max(inMs, Number.isFinite(vIn) ? vIn : inMs);
  const to = Math.min(outMs, Number.isFinite(vOut) ? vOut : outMs);
  const overlapMinutes = Math.max(0, (to - from) / 60_000);
  return Math.min(pause, overlapMinutes);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

/**
 * When a stop is clocked out while still PAUSED (the crew never tapped Resume),
 * the work stopped at the pause. The routes used to count the running pause up
 * to the clock-out tap: paused at 4pm, End Day at 5pm, Stop Job the next
 * morning → a ~900-minute pause docked from punches that ended at 5pm (and from
 * the day shift), zeroing everyone's pay for the day.
 *
 * Returns the instant the stop should be treated as clocked out: the moment the
 * crew's day was over — every punch on the stop already closed (the latest
 * punch-out), or every member still punched in has a day shift that ended
 * after the pause began (the latest End Day) — when that is earlier than
 * `now`. Never earlier than the pause start. Falls back to `now` when there is
 * no such evidence (nobody punched, or someone's shift is still running).
 * Non-throwing.
 */
export async function runningPauseClockOut(
  supabase: AnySupabase,
  p: { orgId: string; punchVisitId: string; pausedAt: string; now: string }
): Promise<string> {
  const pausedMs = Date.parse(p.pausedAt);
  const nowMs = Date.parse(p.now);
  if (!Number.isFinite(pausedMs) || !Number.isFinite(nowMs) || nowMs <= pausedMs) return p.now;
  try {
    const { data: punches } = await supabase
      .from("crm_crew_member_times")
      .select("crew_member_id, clocked_out_at")
      .eq("visit_id", p.punchVisitId)
      .is("deleted_at", null)
      .not("clocked_in_at", "is", null);
    const rows = (punches ?? []) as { crew_member_id: string; clocked_out_at: string | null }[];
    if (rows.length === 0) return p.now;

    let capMs = -Infinity;
    const stillIn: string[] = [];
    for (const r of rows) {
      if (r.clocked_out_at) capMs = Math.max(capMs, Date.parse(r.clocked_out_at));
      else stillIn.push(r.crew_member_id);
    }

    if (stillIn.length > 0) {
      // Each member still punched in must have ended the day that covers the pause.
      const { data: shifts } = await supabase
        .from("crm_crew_day_shifts")
        .select("crew_member_id, started_at, ended_at")
        .eq("org_id", p.orgId)
        .is("deleted_at", null)
        .in("crew_member_id", stillIn)
        .lte("started_at", p.pausedAt)
        .gte("started_at", new Date(pausedMs - 24 * 3_600_000).toISOString());
      const byMember = new Map<string, { started_at: string; ended_at: string | null }>();
      for (const s of (shifts ?? []) as { crew_member_id: string; started_at: string; ended_at: string | null }[]) {
        const cur = byMember.get(s.crew_member_id);
        if (!cur || s.started_at > cur.started_at) byMember.set(s.crew_member_id, s);
      }
      for (const id of stillIn) {
        const s = byMember.get(id);
        if (!s?.ended_at) return p.now; // still on the clock (or no shift): no evidence the day ended
        const endedMs = Date.parse(s.ended_at);
        if (endedMs < pausedMs) return p.now; // that shift ended before the pause — not this one
        capMs = Math.max(capMs, endedMs);
      }
    }

    if (!Number.isFinite(capMs) || capMs >= nowMs) return p.now;
    return new Date(Math.max(capMs, pausedMs)).toISOString();
  } catch {
    return p.now;
  }
}
