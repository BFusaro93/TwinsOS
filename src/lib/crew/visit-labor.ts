import { createServiceClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

/**
 * Org default for crew pauses: unpaid unless the org explicitly turned
 * `customizations.crewBreaksUnpaid` off. Falls back to unpaid on a failed
 * read — the documented default — rather than throwing.
 */
export async function getCrewBreaksUnpaid(supabase: AnySupabase, orgId: string | null | undefined): Promise<boolean> {
  if (!orgId) return true;
  try {
    const { data } = await supabase.from("organizations").select("customizations").eq("id", orgId).maybeSingle();
    const v = (data?.customizations as Record<string, unknown> | null | undefined)?.crewBreaksUnpaid;
    return v !== false;
  } catch {
    return true;
  }
}

/**
 * Resolves whether a visit's break_minutes are UNPAID: the per-visit
 * break_paid override wins (true = paid, false = unpaid); NULL follows the org.
 */
export function isBreakUnpaid(breakPaid: boolean | null | undefined, orgBreaksUnpaid: boolean): boolean {
  return breakPaid == null ? orgBreaksUnpaid : !breakPaid;
}

/**
 * Burdened labor cost (cents) of the CLOSED crew-member punches recorded
 * against `visitId`: Σ hours (net of break + lunch) × the member's
 * labor_burden_cents_per_hour. Shared by the visit and stop clock-out routes
 * and by recomputeStopLabor() so the three can't drift.
 *
 * Punches are only ever recorded against a stop's anchor visit (the crew
 * clocks in once for the stop).
 *
 * Pause time (the visit's break_minutes, written by Pause/Resume on every
 * visit in the stop, so the anchor's value is the stop's) is deducted from each
 * member's span when the break is UNPAID (org default, or the visit's
 * break_paid override); when PAID the full span is costed. Hours elsewhere
 * (computeActualHours, crm_recompute_job_actual_hours, rpt_job_visits) are net
 * of break either way: hours measure productivity on site, pay is a separate
 * question. A member's cost never goes below 0.
 */
export async function sumPunchLaborCents(supabase: AnySupabase, visitId: string): Promise<number> {
  const { data: memberTimes } = await supabase
    .from("crm_crew_member_times")
    .select("crew_member_id, clocked_in_at, clocked_out_at, break_minutes, lunch_minutes")
    .eq("visit_id", visitId)
    .is("deleted_at", null)
    .not("clocked_out_at", "is", null);
  const punches = (memberTimes ?? []) as {
    crew_member_id: string;
    clocked_in_at: string | null;
    clocked_out_at: string;
    break_minutes: number | null;
    lunch_minutes: number | null;
  }[];
  if (punches.length === 0) return 0;

  const { data: visitRow } = await supabase
    .from("crm_job_visits")
    .select("org_id, break_minutes, break_paid")
    .eq("id", visitId)
    .maybeSingle();
  const orgBreaksUnpaid = await getCrewBreaksUnpaid(supabase, visitRow?.org_id as string | undefined);
  const unpaidBreakMins = visitRow && isBreakUnpaid(visitRow.break_paid as boolean | null, orgBreaksUnpaid)
    ? Math.max(0, Number(visitRow.break_minutes ?? 0))
    : 0;

  const memberIds = [...new Set(punches.map((p) => p.crew_member_id))];
  const { data: members } = await supabase
    .from("crm_crew_members")
    .select("id, labor_burden_cents_per_hour")
    .in("id", memberIds);
  const rateById = new Map<string, number>(
    ((members ?? []) as { id: string; labor_burden_cents_per_hour: number | null }[])
      .map((m) => [m.id, Number(m.labor_burden_cents_per_hour ?? 0)])
  );

  let total = 0;
  for (const p of punches) {
    if (!p.clocked_in_at) continue;
    const inMs = new Date(p.clocked_in_at).getTime();
    const outMs = new Date(p.clocked_out_at).getTime();
    const deductMins = Number(p.break_minutes ?? 0) + Number(p.lunch_minutes ?? 0) + unpaidBreakMins;
    const hours = Math.max(0, (outMs - inMs) / 3_600_000 - deductMins / 60);
    total += Math.round(hours * (rateById.get(p.crew_member_id) ?? 0));
  }
  return total;
}

/**
 * Man-hours of the CLOSED crew-member punches recorded against `visitId`:
 * Σ per member of (out − in) − that member's break and lunch − the visit's
 * pause time. Always net of the pause (paid or not) — hours measure time on
 * site, pay is a separate question — which is the same netting
 * computeActualHours / rpt_job_visits / rpt_timesheets apply. Returns null when
 * nothing has been punched out yet. This is the figure the Timesheet report
 * totals, so a visit's hours must equal it whenever punches exist.
 */
export async function sumPunchManHours(supabase: AnySupabase, visitId: string): Promise<number | null> {
  const { data: memberTimes } = await supabase
    .from("crm_crew_member_times")
    .select("clocked_in_at, clocked_out_at, break_minutes, lunch_minutes")
    .eq("visit_id", visitId)
    .is("deleted_at", null)
    .not("clocked_out_at", "is", null);
  const punches = ((memberTimes ?? []) as {
    clocked_in_at: string | null;
    clocked_out_at: string;
    break_minutes: number | null;
    lunch_minutes: number | null;
  }[]).filter((p) => !!p.clocked_in_at);
  if (punches.length === 0) return null;

  const { data: visitRow } = await supabase
    .from("crm_job_visits")
    .select("break_minutes")
    .eq("id", visitId)
    .maybeSingle();
  const visitBreakHours = Math.max(0, Number(visitRow?.break_minutes ?? 0)) / 60;

  let total = 0;
  for (const p of punches) {
    const spanHours = (new Date(p.clocked_out_at).getTime() - new Date(p.clocked_in_at as string).getTime()) / 3_600_000;
    total += Math.max(0, spanHours - (Number(p.break_minutes ?? 0) + Number(p.lunch_minutes ?? 0)) / 60 - visitBreakHours);
  }
  return Math.round(total * 100) / 100;
}

/** Re-sums crm_jobs.actual_labor_cost_cents from the job's visits (service client — crew RLS can't see every crew's visits). */
export async function rollupJobLabor(jobIds: string[]): Promise<void> {
  const admin = createServiceClient();
  for (const jobId of [...new Set(jobIds)]) {
    const { data: visitTotals } = await admin
      .from("crm_job_visits")
      .select("actual_labor_cost_cents")
      .eq("job_id", jobId)
      .is("deleted_at", null);
    const jobLaborCents = (visitTotals ?? []).reduce(
      (sum: number, v: { actual_labor_cost_cents: number | null }) => sum + (v.actual_labor_cost_cents ?? 0), 0
    );
    await admin.from("crm_jobs").update({ actual_labor_cost_cents: jobLaborCents }).eq("id", jobId);
  }
}

/**
 * Recomputes the stored labor cost of an already-closed stop after its punches
 * were edited (office Edit Job Times, crew edit). The clock-out routes compute
 * actual_labor_cost_cents once; without this, a corrected punch left the
 * visit and job totals stale forever.
 *
 * The anchor's total is split across the stop's closed visits (same client,
 * day and clock-in instant — how a stop clocks out together) by actual_hours,
 * falling back to an even split. No-ops when nothing in the stop has been
 * clocked out yet (the clock-out route will compute it then). Non-throwing.
 */
export async function recomputeStopLabor(supabase: AnySupabase, anchorVisitId: string): Promise<void> {
  try {
    const { data: anchor } = await supabase
      .from("crm_job_visits")
      .select("id, job_id, client_id, scheduled_date, clocked_in_at, clocked_out_at, status, actual_hours")
      .eq("id", anchorVisitId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!anchor) return;

    let stop = [anchor] as typeof anchor[];
    if (anchor.clocked_in_at) {
      const { data: siblings } = await supabase
        .from("crm_job_visits")
        .select("id, job_id, clocked_out_at, status, actual_hours")
        .eq("client_id", anchor.client_id)
        .eq("scheduled_date", anchor.scheduled_date)
        .eq("clocked_in_at", anchor.clocked_in_at)
        .is("deleted_at", null)
        .not("status", "in", "(cancelled,skipped)");
      const byId = new Map<string, typeof anchor>();
      for (const r of [anchor, ...(siblings ?? [])]) byId.set(r.id, r);
      stop = [...byId.values()];
    }
    const closed = stop.filter((r) => r.clocked_out_at || r.status === "completed");
    if (closed.length === 0) return;

    // Hours first: a corrected punch (one member late or gone early) changes
    // the crew's man-hours, but the visit's actual_hours is an override the
    // clock-out flow wrote as span × crew size, which stays at the old figure —
    // Job Costing would then show hours the Timesheet report does not. Re-split
    // the punches' man-hours across the stop's visits in the proportions they
    // already hold (even split if none has hours). Labor below then weights by
    // the new hours, so both stay on the same basis.
    const punchHours = await sumPunchManHours(supabase, anchor.id);
    if (punchHours != null) {
      const weights = closed.map((r) => Math.max(0, Number(r.actual_hours ?? 0)));
      const wSum = weights.reduce((a, b) => a + b, 0);
      const shares = closed.map((_, i) => Math.round(punchHours * (wSum > 0 ? weights[i] / wSum : 1 / closed.length) * 100) / 100);
      const diff = Math.round((punchHours - shares.reduce((a, b) => a + b, 0)) * 100) / 100;
      if (diff !== 0) shares[weights.indexOf(Math.max(...weights))] += diff;
      for (let i = 0; i < closed.length; i++) {
        await supabase.from("crm_job_visits").update({ actual_hours: shares[i] }).eq("id", closed[i].id);
        closed[i].actual_hours = shares[i];
      }
    }

    const total = await sumPunchLaborCents(supabase, anchor.id);
    const weightSum = closed.reduce((s, r) => s + Math.max(0, Number(r.actual_hours ?? 0)), 0);
    for (const r of closed) {
      const share = weightSum > 0 ? Math.max(0, Number(r.actual_hours ?? 0)) / weightSum : 1 / closed.length;
      await supabase
        .from("crm_job_visits")
        .update({ actual_labor_cost_cents: Math.round(total * share) })
        .eq("id", r.id);
    }
    await rollupJobLabor(stop.map((r) => r.job_id as string));
  } catch {
    // Non-fatal — a stale cost must not fail the punch edit itself.
  }
}
