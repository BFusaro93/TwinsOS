import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth } from "@/lib/supabase/route-auth";
import { computePayroll } from "@/lib/payroll/compute";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { shiftYmd, zoneWallClockToInstant } from "@/lib/time/zone";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";
import { isPayrollLockedError } from "@/lib/crew/payroll-lock";
import { applyOvertime, getOvertimeRule, overtimeComputeRange } from "@/lib/payroll/overtime";
import { payrollPunchDate } from "@/lib/payroll/punch-date";
import { recomputeStopLabor } from "@/lib/crew/visit-labor";
import { createVisitWriter } from "@/lib/crew/visit-writer";

/**
 * GET  /api/crm/reports/payroll?from=YYYY-MM-DD&to=YYYY-MM-DD — rows carry
 *      regular / overtime hours under the org's overtime rule (returned as
 *      `overtime`); a weekly rule is computed over whole weeks around the range
 *      so a pay period starting mid-week still counts the week's earlier days.
 * PUT  /api/crm/reports/payroll — upsert one member-day adjustment. Also how the office ADDS a
 *      day nobody clocked (forgot to clock in, paper timesheets): an adjustment with times or
 *      hours for a member-day that has no shift is a complete entry.
 * DELETE /api/crm/reports/payroll — remove one member-day that shouldn't exist (the leader
 *      clocked in someone who never worked): soft-deletes the day's shift, job punches and
 *      adjustment, then re-derives the affected visits' hours and labor cost.
 *
 * Requires the payroll_report permission (admins always have it). Crew logins
 * never hold it, and the crm_payroll_adjustments RLS policy enforces the same
 * rule in the database.
 */
const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MAX_RANGE_DAYS = 62;
/** One member-day: storm work past midnight can legitimately run past 24 hours of pay. */
const MAX_DAY_HOURS = 48;

const PutBody = z.object({
  crewMemberId: z.string().uuid(),
  workDate: Ymd,
  hoursOverride: z.number().min(0).max(MAX_DAY_HOURS).nullable(),
  /** Corrected clock times, "HH:mm" in the org's timezone on workDate. */
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  /** Unpaid minutes off the clock for the day (replaces the recorded break). */
  breakMinutes: z.number().int().min(0).max(1440).nullable(),
  /** Extra worked time — counts toward overtime. */
  extraHours: z.number().min(0).max(MAX_DAY_HOURS),
  /** Paid time off — paid, never overtime. Optional so older clients keep working. */
  ptoHours: z.number().min(0).max(MAX_DAY_HOURS).optional().default(0),
  note: z.string().max(500).nullable(),
});

async function authorize(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: profile } = await db.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
  if (profile) profile.org_id = (await getEffectiveOrgId(db)) ?? profile.org_id;
  if (!profile?.org_id) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const { data: hasCrm } = await db.rpc("has_crm_access");
  if (!hasCrm) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  // The payroll_report crm_roles permission (admins always pass inside the RPC).
  const { data: allowed } = await db.rpc("has_settings_permission", { p_key: "payroll_report" });
  if (allowed !== true) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { db, user, orgId: profile.org_id as string };
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const range = z.object({ from: Ymd, to: Ymd }).safeParse({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  if (!range.success) return NextResponse.json({ error: "from and to (YYYY-MM-DD) are required" }, { status: 400 });
  const { from, to } = range.data;
  const days = (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000;
  if (days < 0 || days > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `Pick a range of at most ${MAX_RANGE_DAYS} days` }, { status: 400 });
  }

  const overtime = await getOvertimeRule(auth.db, auth.orgId);
  const span = overtimeComputeRange(overtime, from, to);
  const rows = applyOvertime(await computePayroll(auth.db, auth.orgId, span.from, span.to), overtime)
    .filter((r) => r.workDate >= from && r.workDate <= to);
  return NextResponse.json({ from, to, rows, overtime });
}

export async function PUT(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const parsed = PutBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const b = parsed.data;

  const { data: member } = await auth.db
    .from("crm_crew_members").select("id").eq("id", b.crewMemberId).eq("org_id", auth.orgId).maybeSingle();
  if (!member) return NextResponse.json({ error: "Crew member not found" }, { status: 404 });

  const note = b.note?.trim() || null;
  const now = new Date().toISOString();
  const isEmpty = b.hoursOverride == null && b.startTime == null && b.endTime == null && b.breakMinutes == null && b.extraHours === 0 && b.ptoHours === 0 && !note;

  const { data: existing } = await auth.db
    .from("crm_payroll_adjustments")
    .select("id")
    .eq("org_id", auth.orgId)
    .eq("crew_member_id", b.crewMemberId)
    .eq("work_date", b.workDate)
    .is("deleted_at", null)
    .maybeSingle();

  if (isEmpty) {
    // Back to the computed figures — soft delete, never a hard delete.
    if (existing) {
      const { error: clearErr } = await auth.db.from("crm_payroll_adjustments").update({ deleted_at: now, updated_by: auth.user.id }).eq("id", existing.id);
      if (clearErr) {
        return NextResponse.json({ error: clearErr.message }, { status: isPayrollLockedError(clearErr.message) ? 409 : 500 });
      }
    }
    return NextResponse.json({ ok: true, cleared: true });
  }

  const tz = await getOrgTimeZone(auth.db, auth.orgId);
  const startAt = b.startTime ? zoneWallClockToInstant(b.workDate, b.startTime, tz) : null;
  // An end at/before the start means the day ran past midnight (storm work).
  let endAt = b.endTime ? zoneWallClockToInstant(b.workDate, b.endTime, tz) : null;
  if ((b.startTime && !startAt) || (b.endTime && !endAt)) {
    return NextResponse.json({ error: "Invalid time" }, { status: 422 });
  }
  // With only an End given, the day's start is the recorded shift start.
  let refStartMs = startAt ? startAt.getTime() : null;
  if (refStartMs == null && endAt) {
    const { data: shift } = await auth.db
      .from("crm_crew_day_shifts")
      .select("started_at")
      .eq("org_id", auth.orgId)
      .eq("crew_member_id", b.crewMemberId)
      .eq("work_date", b.workDate)
      .is("deleted_at", null)
      .maybeSingle();
    if (shift?.started_at) refStartMs = new Date(shift.started_at as string).getTime();
  }
  if (refStartMs != null && endAt && endAt.getTime() <= refStartMs) {
    endAt = zoneWallClockToInstant(shiftYmd(b.workDate, 1), b.endTime as string, tz);
  }

  const values = {
    start_override: startAt ? startAt.toISOString() : null,
    end_override: endAt ? endAt.toISOString() : null,
    break_override: b.breakMinutes,
    hours_override: b.hoursOverride,
    extra_hours: b.extraHours,
    pto_hours: b.ptoHours,
    note,
    updated_by: auth.user.id,
  };
  const { error } = existing
    ? await auth.db.from("crm_payroll_adjustments").update(values).eq("id", existing.id)
    : await auth.db.from("crm_payroll_adjustments").insert({
        ...values,
        org_id: auth.orgId,
        crew_member_id: b.crewMemberId,
        work_date: b.workDate,
        created_by: auth.user.id,
      });
  // A day inside the payroll lock (organizations.payroll_locked_through) is refused by the database.
  if (error) return NextResponse.json({ error: error.message }, { status: isPayrollLockedError(error.message) ? 409 : 500 });
  return NextResponse.json({ ok: true });
}

const DeleteBody = z.object({ crewMemberId: z.string().uuid(), workDate: Ymd });

export async function DELETE(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const parsed = DeleteBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { crewMemberId, workDate } = parsed.data;

  const { data: member } = await auth.db
    .from("crm_crew_members").select("id").eq("id", crewMemberId).eq("org_id", auth.orgId).maybeSingle();
  if (!member) return NextResponse.json({ error: "Crew member not found" }, { status: 404 });

  const tz = await getOrgTimeZone(auth.db, auth.orgId);
  const now = new Date().toISOString();
  const fail = (message: string) =>
    NextResponse.json({ error: message }, { status: isPayrollLockedError(message) ? 409 : 500 });

  // Which punches belong to this day: the same rule payroll and the lock use.
  const { data: shiftRows } = await auth.db
    .from("crm_crew_day_shifts")
    .select("work_date, started_at, ended_at")
    .eq("org_id", auth.orgId)
    .eq("crew_member_id", crewMemberId)
    .is("deleted_at", null)
    .gte("work_date", shiftYmd(workDate, -1))
    .lte("work_date", workDate);
  const shifts = (shiftRows ?? []) as { work_date: string; started_at: string; ended_at: string | null }[];
  const shiftFor = (_m: string, d: string) => shifts.find((s) => s.work_date === d);

  const { data: punchRows, error: punchReadErr } = await auth.db
    .from("crm_crew_member_times")
    .select("id, visit_id, clocked_in_at")
    .eq("org_id", auth.orgId)
    .eq("crew_member_id", crewMemberId)
    .is("deleted_at", null)
    .not("clocked_in_at", "is", null)
    .gte("clocked_in_at", `${shiftYmd(workDate, -1)}T00:00:00Z`)
    .lt("clocked_in_at", `${shiftYmd(workDate, 2)}T00:00:00Z`);
  if (punchReadErr) return fail(punchReadErr.message);
  const punches = ((punchRows ?? []) as { id: string; visit_id: string; clocked_in_at: string }[])
    .filter((p) => payrollPunchDate(shiftFor, crewMemberId, p.clocked_in_at, tz) === workDate);

  // Punches first: the payroll lock dates them by their shift, so removing the shift first
  // would let an already-locked punch slip to a different date.
  if (punches.length > 0) {
    const { error } = await auth.db
      .from("crm_crew_member_times")
      .update({ deleted_at: now, updated_at: now })
      .in("id", punches.map((p) => p.id));
    if (error) return fail(error.message);
  }
  for (const table of ["crm_crew_day_shifts", "crm_payroll_adjustments"] as const) {
    const { error } = await auth.db
      .from(table)
      .update({ deleted_at: now })
      .eq("org_id", auth.orgId)
      .eq("crew_member_id", crewMemberId)
      .eq("work_date", workDate)
      .is("deleted_at", null);
    if (error) return fail(error.message);
  }

  // Job Costing: the visits that carried those punches lose the hours and labor.
  const writer = createVisitWriter(auth.user.id);
  for (const visitId of new Set(punches.map((p) => p.visit_id))) {
    await recomputeStopLabor(auth.db, visitId, writer);
  }
  return NextResponse.json({ ok: true, removedPunches: punches.length });
}
