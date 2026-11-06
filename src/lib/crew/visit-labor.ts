import { createServiceClient } from "@/lib/supabase/server";
import { memberVisitPauseMinutes } from "@/lib/crew/visit-pause";

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
 * Fully-loaded labor $/hr (cents) per crew member: the member's own
 * labor_burden_cents_per_hour when set (> 0), else the linked employee's
 * hourly_rate_cents × (1 + the org's labor_burden_bps/10000) — the same
 * fallback rpt_job_visits and the crew-average reports use. 0 when neither is
 * configured. Without it a crew whose burden field was never filled in costed
 * every punch at $0 while the reports (which did fall back) showed a rate.
 * The employee rate and org burden are read with the service client: pay
 * columns aren't SELECT-able by the crew/authenticated roles that call this.
 */
export async function memberLaborRatesCents(
  supabase: AnySupabase,
  memberIds: string[],
  orgId: string | null | undefined
): Promise<Map<string, number>> {
  const rates = new Map<string, number>();
  if (memberIds.length === 0) return rates;
  const { data: members } = await supabase
    .from("crm_crew_members")
    .select("id, employee_id, labor_burden_cents_per_hour")
    .in("id", memberIds);
  const rows = (members ?? []) as { id: string; employee_id: string | null; labor_burden_cents_per_hour: number | null }[];
  const needFallback = rows.filter((m) => !(Number(m.labor_burden_cents_per_hour ?? 0) > 0) && m.employee_id);
  const hourlyByEmployee = new Map<string, number>();
  let burdenBps = 0;
  if (needFallback.length > 0) {
    const admin = createServiceClient();
    const [{ data: emps }, { data: overhead }] = await Promise.all([
      admin.from("crm_employees").select("id, hourly_rate_cents").in("id", needFallback.map((m) => m.employee_id as string)),
      orgId
        ? admin.from("crm_overhead_settings").select("labor_burden_bps").eq("org_id", orgId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    for (const e of (emps ?? []) as { id: string; hourly_rate_cents: number | null }[]) {
      hourlyByEmployee.set(e.id, Number(e.hourly_rate_cents ?? 0));
    }
    burdenBps = Number((overhead as { labor_burden_bps: number | null } | null)?.labor_burden_bps ?? 0);
  }
  for (const m of rows) {
    const own = Number(m.labor_burden_cents_per_hour ?? 0);
    rates.set(
      m.id,
      own > 0 ? own : Math.round((hourlyByEmployee.get(m.employee_id ?? "") ?? 0) * (1 + burdenBps / 10000))
    );
  }
  return rates;
}

/**
 * Burdened labor cost (cents) of the CLOSED crew-member punches recorded
 * against `visitId`: Σ hours (net of break + lunch) × the member's
 * labor rate (memberLaborRatesCents: burden field, else hourly rate × org burden). Shared by the visit and stop clock-out routes
 * and by recomputeStopLabor() so the three can't drift.
 *
 * Punches are only ever recorded against a stop's anchor visit (the crew
 * clocks in once for the stop).
 *
 * Pause time (the visit's break_minutes, written by Pause/Resume on every
 * visit in the stop, so the anchor's value is the stop's) is deducted from each
 * member's span — capped at the time that member's punch overlaps the visit's
 * clock window (memberVisitPauseMinutes) — when the break is UNPAID (org default, or the visit's
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
    .select("org_id, break_minutes, break_paid, clocked_in_at, clocked_out_at")
    .eq("id", visitId)
    .maybeSingle();
  const orgBreaksUnpaid = await getCrewBreaksUnpaid(supabase, visitRow?.org_id as string | undefined);
  const pauseUnpaid = !!visitRow && isBreakUnpaid(visitRow.break_paid as boolean | null, orgBreaksUnpaid);

  const memberIds = [...new Set(punches.map((p) => p.crew_member_id))];
  const rateById = await memberLaborRatesCents(supabase, memberIds, visitRow?.org_id as string | undefined);

  let total = 0;
  for (const p of punches) {
    if (!p.clocked_in_at) continue;
    const inMs = new Date(p.clocked_in_at).getTime();
    const outMs = new Date(p.clocked_out_at).getTime();
    const unpaidBreakMins = pauseUnpaid
      ? memberVisitPauseMinutes({
          pauseMinutes: visitRow?.break_minutes as number | null,
          punchIn: p.clocked_in_at,
          punchOut: p.clocked_out_at,
          visitIn: visitRow?.clocked_in_at as string | null,
          visitOut: visitRow?.clocked_out_at as string | null,
        })
      : 0;
    const deductMins = Number(p.break_minutes ?? 0) + Number(p.lunch_minutes ?? 0) + unpaidBreakMins;
    const hours = Math.max(0, (outMs - inMs) / 3_600_000 - deductMins / 60);
    total += Math.round(hours * (rateById.get(p.crew_member_id) ?? 0));
  }
  return total;
}

/**
 * Man-hours of the CLOSED crew-member punches recorded against `visitId`:
 * Σ per member of (out − in) − that member's break and lunch − their share of
 * the visit's pause time (memberVisitPauseMinutes: capped at their overlap
 * with the visit's clock window). Always net of the pause (paid or not) — hours measure time on
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
    .select("break_minutes, clocked_in_at, clocked_out_at")
    .eq("id", visitId)
    .maybeSingle();

  let total = 0;
  for (const p of punches) {
    const spanHours = (new Date(p.clocked_out_at).getTime() - new Date(p.clocked_in_at as string).getTime()) / 3_600_000;
    const pauseHours = memberVisitPauseMinutes({
      pauseMinutes: visitRow?.break_minutes as number | null,
      punchIn: p.clocked_in_at as string,
      punchOut: p.clocked_out_at,
      visitIn: visitRow?.clocked_in_at as string | null,
      visitOut: visitRow?.clocked_out_at as string | null,
    }) / 60;
    total += Math.max(0, spanHours - (Number(p.break_minutes ?? 0) + Number(p.lunch_minutes ?? 0)) / 60 - pauseHours);
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
      const siblingQuery = supabase
        .from("crm_job_visits")
        .select("id, job_id, clocked_out_at, status, actual_hours");
      // .eq(col, null) matches nothing in PostgREST; a client-less stop has no client.
      const { data: siblings } = await (anchor.client_id
        ? siblingQuery.eq("client_id", anchor.client_id)
        : siblingQuery.is("client_id", null))
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
