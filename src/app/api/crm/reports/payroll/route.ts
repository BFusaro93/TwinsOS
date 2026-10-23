import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth } from "@/lib/supabase/route-auth";
import { computePayroll } from "@/lib/payroll/compute";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { shiftYmd, zoneWallClockToInstant } from "@/lib/time/zone";

/**
 * GET  /api/crm/reports/payroll?from=YYYY-MM-DD&to=YYYY-MM-DD
 * PUT  /api/crm/reports/payroll — upsert one member-day adjustment.
 *
 * Requires the payroll_report permission (admins always have it). Crew logins
 * never hold it, and the crm_payroll_adjustments RLS policy enforces the same
 * rule in the database.
 */
const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MAX_RANGE_DAYS = 62;

const PutBody = z.object({
  crewMemberId: z.string().uuid(),
  workDate: Ymd,
  hoursOverride: z.number().min(0).max(24).nullable(),
  /** Corrected clock times, "HH:mm" in the org's timezone on workDate. */
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  /** Unpaid minutes off the clock for the day (replaces the recorded break). */
  breakMinutes: z.number().int().min(0).max(1440).nullable(),
  extraHours: z.number().min(0).max(24),
  note: z.string().max(500).nullable(),
});

async function authorize(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: profile } = await db.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
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

  const rows = await computePayroll(auth.db, auth.orgId, from, to);
  return NextResponse.json({ from, to, rows });
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
  const isEmpty = b.hoursOverride == null && b.startTime == null && b.endTime == null && b.breakMinutes == null && b.extraHours === 0 && !note;

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
      await auth.db.from("crm_payroll_adjustments").update({ deleted_at: now, updated_by: auth.user.id }).eq("id", existing.id);
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
  if (startAt && endAt && endAt.getTime() <= startAt.getTime()) {
    endAt = zoneWallClockToInstant(shiftYmd(b.workDate, 1), b.endTime as string, tz);
  }

  const values = {
    start_override: startAt ? startAt.toISOString() : null,
    end_override: endAt ? endAt.toISOString() : null,
    break_override: b.breakMinutes,
    hours_override: b.hoursOverride,
    extra_hours: b.extraHours,
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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
