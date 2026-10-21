import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import { getCrewBreaksUnpaid, isBreakUnpaid } from "@/lib/crew/visit-labor";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { isoInZone, shiftYmd } from "@/lib/time/zone";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export interface PayrollRow {
  crewMemberId: string;
  memberName: string;
  crewName: string | null;
  workDate: string;
  /** The paid day, shop to shop (null = nobody clocked the day for this person). */
  shiftStart: string | null;
  shiftEnd: string | null;
  /** Unpaid minutes off the clock inside the day: recorded gaps, lunch, unpaid job pauses. */
  breakMinutes: number;
  /** The office's corrections, when set (shiftStart / shiftEnd / breakMinutes above already reflect them). */
  startOverride: string | null;
  endOverride: string | null;
  breakOverride: number | null;
  /** Day span net of breaks and gaps; 0 while the shift is still open. */
  shiftHours: number;
  /** Hours on jobs (stop punches) — what Job Costing sees. */
  jobHours: number;
  /** Shift time not on a job: drive, shop, loading. Informational. */
  otherHours: number;
  hoursOverride: number | null;
  extraHours: number;
  note: string | null;
  /** The hours payroll starts from: override, else shift, else job hours when there is no shift. */
  baseHours: number;
  totalHours: number;
  adjusted: boolean;
  /** No Start Day was tapped for this person — hours fall back to job punches. */
  noShift: boolean;
  /** The first job opened the day, so the true start (at the shop) is earlier. */
  autoStart: boolean;
  /** Shift never ended — hours are understated until End Day or an override. */
  openShift: boolean;
  openPunches: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const hoursBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;

interface PunchRow {
  crew_member_id: string;
  clocked_in_at: string | null;
  clocked_out_at: string | null;
  break_minutes: number | null;
  lunch_minutes: number | null;
  crm_job_visits: { break_minutes: number | null; break_paid: boolean | null } | null;
}

interface ShiftRow {
  crew_member_id: string;
  work_date: string;
  started_at: string;
  ended_at: string | null;
  break_minutes: number | null;
  source: string;
}

/**
 * Per-member, per-day payroll hours for [from, to] (org-local dates).
 *
 * Paid time is the crew's day shift (Start Day → End Day, shop to shop) less
 * lunch and unpaid job pauses. Job punches only supply the on-job figure so
 * the report can show how much of the day was drive/shop time. Adjustments
 * are layered on top and never touch the shifts or punches.
 */
export async function computePayroll(
  supabase: AnySupabase,
  orgId: string,
  from: string,
  to: string
): Promise<PayrollRow[]> {
  const tz = await getOrgTimeZone(supabase, orgId);
  const orgBreaksUnpaid = await getCrewBreaksUnpaid(supabase, orgId);
  // Padded UTC window; punches are then bucketed by their org-local date.
  const lo = `${shiftYmd(from, -1)}T00:00:00Z`;
  const hi = `${shiftYmd(to, 2)}T00:00:00Z`;

  const punches = await fetchAllRows<PunchRow>(() =>
    supabase
      .from("crm_crew_member_times")
      .select("crew_member_id, clocked_in_at, clocked_out_at, break_minutes, lunch_minutes, crm_job_visits(break_minutes, break_paid)")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .not("clocked_in_at", "is", null)
      .gte("clocked_in_at", lo)
      .lt("clocked_in_at", hi)
  );
  const shifts = await fetchAllRows<ShiftRow>(() =>
    supabase
      .from("crm_crew_day_shifts")
      .select("crew_member_id, work_date, started_at, ended_at, break_minutes, source")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .gte("work_date", from)
      .lte("work_date", to)
  );

  const [{ data: members }, { data: crews }, { data: overrides }, { data: adjustments }] = await Promise.all([
    supabase.from("crm_crew_members").select("id, name, crew_id").eq("org_id", orgId),
    supabase.from("crm_crews").select("id, name").eq("org_id", orgId),
    supabase.from("crm_crew_daily_members").select("member_id, crew_id, work_date").eq("org_id", orgId).gte("work_date", from).lte("work_date", to),
    supabase.from("crm_payroll_adjustments").select("crew_member_id, work_date, hours_override, extra_hours, note, start_override, end_override, break_override").eq("org_id", orgId).is("deleted_at", null).gte("work_date", from).lte("work_date", to),
  ]);

  const memberById = new Map<string, { name: string; crewId: string | null }>(
    ((members ?? []) as { id: string; name: string; crew_id: string | null }[]).map((m) => [m.id, { name: m.name, crewId: m.crew_id }])
  );
  const crewName = new Map<string, string>(((crews ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const overrideByDay = new Map<string, string>(
    ((overrides ?? []) as { member_id: string; crew_id: string; work_date: string }[]).map((o) => [`${o.member_id}|${o.work_date}`, o.crew_id])
  );
  const adjByKey = new Map<string, { hours_override: number | null; extra_hours: number; note: string | null; start_override: string | null; end_override: string | null; break_override: number | null }>(
    ((adjustments ?? []) as { crew_member_id: string; work_date: string; hours_override: number | null; extra_hours: number; note: string | null; start_override: string | null; end_override: string | null; break_override: number | null }[])
      .map((a) => [`${a.crew_member_id}|${a.work_date}`, a])
  );
  const shiftByKey = new Map<string, ShiftRow>(shifts.map((s) => [`${s.crew_member_id}|${s.work_date}`, s]));

  // Per member-day: job hours, off-clock minutes recorded on jobs, open punches.
  const jobs = new Map<string, { jobHours: number; offClockMinutes: number; open: number }>();
  for (const p of punches) {
    if (!p.clocked_in_at) continue;
    const date = isoInZone(new Date(p.clocked_in_at), tz);
    if (date < from || date > to) continue;
    const k = `${p.crew_member_id}|${date}`;
    const cur = jobs.get(k) ?? { jobHours: 0, offClockMinutes: 0, open: 0 };
    if (!p.clocked_out_at) {
      cur.open += 1;
    } else {
      const visitPause = isBreakUnpaid(p.crm_job_visits?.break_paid, orgBreaksUnpaid)
        ? Math.max(0, Number(p.crm_job_visits?.break_minutes ?? 0))
        : 0;
      const own = Number(p.break_minutes ?? 0) + Number(p.lunch_minutes ?? 0);
      cur.jobHours += Math.max(0, hoursBetween(p.clocked_in_at, p.clocked_out_at) - (own + visitPause) / 60);
      cur.offClockMinutes += own + visitPause;
    }
    jobs.set(k, cur);
  }

  const keys = new Set<string>([...jobs.keys(), ...shiftByKey.keys(), ...adjByKey.keys()]);
  const rows: PayrollRow[] = [];
  for (const k of keys) {
    const [memberId, workDate] = k.split("|");
    const member = memberById.get(memberId);
    if (!member) continue;
    const dayCrewId = overrideByDay.get(k) ?? member.crewId;
    const shift = shiftByKey.get(k);
    const job = jobs.get(k) ?? { jobHours: 0, offClockMinutes: 0, open: 0 };
    const adj = adjByKey.get(k);

    // Corrected times win over the recorded shift (and can supply a day that
    // nobody clocked at all).
    const start = adj?.start_override ?? shift?.started_at ?? null;
    const end = adj?.end_override ?? shift?.ended_at ?? null;
    const breakMinutes = (adj?.break_override != null ? Number(adj.break_override) : Number(shift?.break_minutes ?? 0)) + job.offClockMinutes;
    const hasDay = !!start;
    const openShift = hasDay && !end;
    const shiftHours = start && end
      ? Math.max(0, r2(hoursBetween(start, end) - breakMinutes / 60))
      : 0;
    const jobHours = r2(job.jobHours);
    const noShift = !hasDay;
    const computed = noShift ? jobHours : shiftHours;
    const override = adj?.hours_override != null ? Number(adj.hours_override) : null;
    const base = override ?? computed;
    const extra = Number(adj?.extra_hours ?? 0);

    rows.push({
      crewMemberId: memberId,
      memberName: member.name,
      crewName: dayCrewId ? crewName.get(dayCrewId) ?? null : null,
      workDate,
      shiftStart: start,
      shiftEnd: end,
      breakMinutes,
      startOverride: adj?.start_override ?? null,
      endOverride: adj?.end_override ?? null,
      breakOverride: adj?.break_override != null ? Number(adj.break_override) : null,
      shiftHours,
      jobHours,
      otherHours: end ? Math.max(0, r2(shiftHours - jobHours)) : 0,
      hoursOverride: override,
      extraHours: extra,
      note: adj?.note ?? null,
      baseHours: r2(base),
      totalHours: r2(base + extra),
      adjusted: !!adj && (override != null || extra > 0 || !!adj.note || !!adj.start_override || !!adj.end_override || adj.break_override != null),
      noShift,
      autoStart: !adj?.start_override && shift?.source === "auto_first_job",
      openShift,
      openPunches: job.open,
    });
  }
  return rows.sort((a, b) => a.memberName.localeCompare(b.memberName) || a.workDate.localeCompare(b.workDate));
}
