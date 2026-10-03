import { createServiceClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

/**
 * Burdened labor cost (cents) of the CLOSED crew-member punches recorded
 * against `visitId`: Σ hours (net of break + lunch) × the member's
 * labor_burden_cents_per_hour. Shared by the visit and stop clock-out routes
 * and by recomputeStopLabor() so the three can't drift.
 *
 * Punches are only ever recorded against a stop's anchor visit (the crew
 * clocks in once for the stop).
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
    const deductMins = Number(p.break_minutes ?? 0) + Number(p.lunch_minutes ?? 0);
    const hours = Math.max(0, (outMs - inMs) / 3_600_000 - deductMins / 60);
    total += Math.round(hours * (rateById.get(p.crew_member_id) ?? 0));
  }
  return total;
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
