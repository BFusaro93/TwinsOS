import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import { recalcNextPackageVisitDate } from "@/lib/package-visit-recalc";
import { stopKeyForVisit, type StopKeyInput } from "@/lib/utils/visit-stops";
import { allocateStopHours } from "@/lib/utils/visit-hours";
import { assertCallerOwnsVisit } from "@/lib/supabase/route-auth";
import { isoNy } from "@/lib/reports/ny-date";

const Body = z.object({
  notes: z.string().optional(),
  // HH:mm in the crew member's local time — the server (Vercel) runs in UTC,
  // so the actual local time-of-day must come from the client's browser clock.
  localTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

interface VisitRow {
  id: string;
  org_id: string;
  job_id: string;
  client_id: string;
  scheduled_date: string;
  crew_id: string | null;
  job_service_id: string | null;
  status: string;
  men_count: number | null;
  clocked_in_at: string | null;
  clocked_out_at: string | null;
  start_time: string | null;
  crm_jobs: {
    property_id: string | null;
    service_address: string | null;
    service_city: string | null;
    crm_job_services: { id: string; budgeted_hours: number; team_size: number }[] | null;
  } | null;
}

function toStopKeyInput(row: VisitRow): StopKeyInput {
  return {
    clientId: row.client_id,
    scheduledDate: row.scheduled_date,
    crewId: row.crew_id,
    job: row.crm_jobs
      ? { propertyId: row.crm_jobs.property_id, serviceAddress: row.crm_jobs.service_address, serviceCity: row.crm_jobs.service_city }
      : undefined,
  };
}

const VISIT_SELECT = `
  id, org_id, job_id, client_id, scheduled_date, crew_id, job_service_id, status,
  men_count, clocked_in_at, clocked_out_at, start_time,
  crm_jobs(property_id, service_address, service_city, crm_job_services(id, budgeted_hours, team_size))
`;

/**
 * Clocks out every visit making up this stop with one action, splitting the
 * single measured duration across them proportionally by each visit's own
 * linked service's budgeted hours × team size — falling back to an even
 * split if none have a budget set. See allocateStopHours() for the
 * men-count-multiplication invariant this depends on.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId: anchorVisitId } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  const notes = parsed.success ? parsed.data.notes : undefined;
  const localTime = parsed.success ? parsed.data.localTime : undefined;
  const now = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: anchorRow, error: anchorErr } = await (supabase as any)
    .from("crm_job_visits")
    .select(VISIT_SELECT)
    .eq("id", anchorVisitId)
    .is("deleted_at", null)
    .single();
  if (anchorErr || !anchorRow) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  const anchor = anchorRow as VisitRow;

  // Guard against clocking out another crew's visit — RLS on crm_job_visits
  // only checks org_id, not crew_id, so a caller who obtains another crew's
  // visitId could otherwise still act on it. See assertCallerOwnsVisit().
  if (!(await assertCallerOwnsVisit(supabase, user.id, anchor.org_id, anchor.crew_id))) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: candidateRows, error: candErr } = await (supabase as any)
    .from("crm_job_visits")
    .select(VISIT_SELECT)
    .eq("client_id", anchor.client_id)
    .eq("scheduled_date", anchor.scheduled_date)
    .is("deleted_at", null)
    .not("status", "in", "(cancelled,skipped)");
  if (candErr) return NextResponse.json({ error: candErr.message }, { status: 500 });

  const anchorKey = stopKeyForVisit(toStopKeyInput(anchor));
  // A crew/date reassignment mid-stop changes the stop key for one visit —
  // also catch anything that was clocked in at the exact same instant as the
  // anchor so it isn't orphaned in "in_progress" forever.
  //
  // Security: stopKeyForVisit encodes crew_id, so an anchorKey match already
  // guarantees r.crew_id === anchor.crew_id (whose ownership was verified
  // above). The clocked_in_at fallback clause does NOT carry that guarantee —
  // a mid-stop reassignment can leave a row with a different crew_id than the
  // caller's — so it is intersected with an explicit crew_id check. This
  // means a visit reassigned away from the caller's crew is no longer swept
  // into this batch clock-out (it stays "in_progress" for the office to
  // resolve) rather than letting the caller mutate another crew's visit.
  const allRows = candidateRows as VisitRow[];
  const stopRows = allRows.filter((r) =>
    r.crew_id === anchor.crew_id
    && (
      stopKeyForVisit(toStopKeyInput(r)) === anchorKey
      || (anchor.clocked_in_at && r.clocked_in_at === anchor.clocked_in_at)
    )
  );

  // Already-completed siblings (e.g. an office user closed one out manually)
  // are excluded from both the split and the update — their own value stands.
  const openRows = stopRows.filter((r) => !r.clocked_out_at);
  if (openRows.length === 0) {
    return NextResponse.json({ error: "Nothing to clock out for this stop" }, { status: 400 });
  }

  const startedAt = anchor.clocked_in_at
    ?? openRows.map((r) => r.clocked_in_at).filter(Boolean).sort()[0]
    ?? null;
  const menCount = anchor.men_count || 1;

  let durationHours: number | null = null;
  if (startedAt) {
    durationHours = (new Date(now).getTime() - new Date(startedAt).getTime()) / 3_600_000;
  } else if (anchor.start_time && localTime) {
    const [sh, sm] = anchor.start_time.split(":").map(Number);
    const [eh, em] = localTime.split(":").map(Number);
    if (![sh, sm, eh, em].some(Number.isNaN)) {
      // Snow/storm shifts routinely cross midnight — a local clock-out time
      // strictly before the start time means it's the next day.
      let diffMinutes = eh * 60 + em - (sh * 60 + sm);
      if (diffMinutes < 0) diffMinutes += 24 * 60;
      durationHours = diffMinutes / 60;
    }
  }

  const allocation = durationHours != null && durationHours > 0
    ? allocateStopHours({
        durationHours,
        menCount,
        visits: openRows.map((r) => ({
          id: r.id,
          jobServiceId: r.job_service_id,
          job: { services: (r.crm_jobs?.crm_job_services ?? []).map((s) => ({ id: s.id, budgetedHours: s.budgeted_hours, teamSize: s.team_size })) },
        })),
      })
    : null;

  const openIds = openRows.map((r) => r.id);

  // Per-sibling writes differ (actual_hours), so this is a loop rather than
  // one batched update. Idempotent/recoverable: re-running only touches rows
  // still missing clocked_out_at, using the same startedAt each time.
  const updateErrors: string[] = [];
  for (const row of openRows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("crm_job_visits")
      .update({
        clocked_out_at: now,
        end_time: localTime ? `${localTime}:00` : undefined,
        completed_at: now,
        status: "completed",
        actual_hours: allocation?.get(row.id) ?? undefined,
        men_count: menCount,
        completion_notes: row.id === anchor.id ? (notes ?? null) : undefined,
        updated_at: now,
      })
      .eq("id", row.id);
    if (error) updateErrors.push(`${row.id}: ${error.message}`);
  }
  if (updateErrors.length > 0) {
    return NextResponse.json({ error: `Failed to clock out: ${updateErrors.join("; ")}` }, { status: 500 });
  }

  // Push each affected service's next package-sequenced visit date out if it
  // completed later than its static schedule assumed. Non-fatal.
  for (const row of openRows) {
    try {
      await recalcNextPackageVisitDate(supabase, row.job_service_id, isoNy(new Date(now)));
    } catch (err) {
      console.error("[crew/stops/clock-out] package min_days recalc failed:", err);
    }
  }

  // Labor cost: crew member punches are only ever recorded against the
  // anchor visit (the crew clocks in once, for the stop) — compute the total
  // from there, then allocate it across siblings with the same weights as
  // the hours split, so per-service job costing isn't skewed the same way
  // hours would have been.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: memberTimes } = await (supabase as any)
      .from("crm_crew_member_times")
      .select("crew_member_id, clocked_in_at, clocked_out_at, break_minutes, lunch_minutes")
      .eq("visit_id", anchor.id)
      .not("clocked_out_at", "is", null);

    let totalLaborCents = 0;
    for (const mt of memberTimes ?? []) {
      const inMs = new Date(mt.clocked_in_at as string).getTime();
      const outMs = new Date(mt.clocked_out_at as string).getTime();
      const deductMins = (Number(mt.break_minutes ?? 0) + Number(mt.lunch_minutes ?? 0));
      const hours = Math.max(0, (outMs - inMs) / 3_600_000 - deductMins / 60);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: member } = await (supabase as any)
        .from("crm_crew_members")
        .select("labor_burden_cents_per_hour")
        .eq("id", mt.crew_member_id)
        .single();
      const burdenRate = Number(member?.labor_burden_cents_per_hour ?? 0);
      totalLaborCents += Math.round(hours * burdenRate);
    }

    const totalAllocHours = openRows.reduce((s, r) => s + (allocation?.get(r.id) ?? 0), 0);
    for (const row of openRows) {
      const share = totalAllocHours > 0 ? (allocation?.get(row.id) ?? 0) / totalAllocHours : 1 / openRows.length;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("crm_job_visits")
        .update({ actual_labor_cost_cents: Math.round(totalLaborCents * share) })
        .eq("id", row.id);
    }

    // Roll up to every job touched by this stop (usually one, but a stop can
    // span jobs — e.g. a recurring Mowing job plus a one-off Mulch job).
    const jobIds = [...new Set(stopRows.map((r) => r.job_id))];
    for (const jobId of jobIds) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: visitTotals } = await (supabase as any)
        .from("crm_job_visits")
        .select("actual_labor_cost_cents")
        .eq("job_id", jobId)
        .is("deleted_at", null);
      const jobLaborCents = (visitTotals ?? []).reduce(
        (sum: number, v: { actual_labor_cost_cents: number }) => sum + (v.actual_labor_cost_cents ?? 0), 0
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("crm_jobs")
        .update({ actual_labor_cost_cents: jobLaborCents })
        .eq("id", jobId);
    }
  } catch {
    // Non-fatal — labor cost rollup failure should not block clock-out response
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: finalRows } = await (supabase as any)
    .from("crm_job_visits")
    .select()
    .in("id", openIds);

  return NextResponse.json({ visitIds: openIds, visits: finalRows });
}
