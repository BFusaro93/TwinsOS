// Per-service timing inside a stop ("Track time per service", an org setting).
//
// A stop clocks in/out once. With the setting on, the crew also taps Start /
// Finish on each service (one at a time) and the stop's man-hours are divided
// by each service's own window instead of by budget. The windows live on
// crm_job_visits.service_started_at / service_ended_at — NOT on clocked_in_at /
// clocked_out_at, which stay the stop's clock (payroll punches and
// recomputeStopLabor group a stop's visits by an identical clocked_in_at).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

/** organizations.customizations.crewServiceTiming — off unless explicitly true. */
export async function isServiceTimingOn(supabase: AnySupabase, orgId: string | null | undefined): Promise<boolean> {
  if (!orgId) return false;
  try {
    const { data } = await supabase.from("organizations").select("customizations").eq("id", orgId).maybeSingle();
    return (data?.customizations as Record<string, unknown> | null | undefined)?.crewServiceTiming === true;
  } catch {
    return false;
  }
}

export interface ServiceWindowRow {
  id: string;
  service_started_at: string | null;
  service_ended_at: string | null;
  /** Idle seconds between a Finish and a later Resume; worked time excludes them. */
  service_gap_seconds?: number | null;
}

/**
 * Each row's tracked window in hours (an unfinished window runs to `nowIso`), or
 * null unless EVERY row has a positive window. All-or-nothing on purpose: a
 * stop where the crew forgot to tap one service falls back to the budget split
 * rather than handing the untracked service zero hours.
 */
export function serviceWindowHours(rows: ServiceWindowRow[], nowIso: string): Map<string, number> | null {
  if (rows.length < 2) return null;
  const nowMs = new Date(nowIso).getTime();
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.service_started_at) return null;
    const start = new Date(r.service_started_at).getTime();
    const end = r.service_ended_at ? new Date(r.service_ended_at).getTime() : nowMs;
    const hours = (end - start - Math.max(0, Number(r.service_gap_seconds ?? 0)) * 1000) / 3_600_000;
    if (!Number.isFinite(hours) || hours <= 0) return null;
    out.set(r.id, hours);
  }
  return out;
}
