import { NextResponse } from "next/server";
import { z } from "zod";
import { recalcNextPackageVisitDate } from "@/lib/package-visit-recalc";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";

const Body = z.object({
  notes: z.string().optional(),
  // HH:mm in the crew member's local time — the server (Vercel) runs in UTC,
  // so the actual local time-of-day must come from the client's browser clock.
  localTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  // Accepts either the web app's cookie session or crew-app's bearer token —
  // see getRouteAuth().
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  const notes = parsed.success ? parsed.data.notes : undefined;
  const localTime = parsed.success ? parsed.data.localTime : undefined;
  const now = new Date().toISOString();

  // Idempotent/double-tap safe, matching clock-in's guard — a retried request
  // (e.g. the crew-app offline queue retrying after a flaky partial-success,
  // or a genuine double tap) must not silently overwrite an already-recorded
  // clock-out with a later timestamp/different notes. If a supervisor already
  // clocked this visit out from the web app while the phone was offline, this
  // also surfaces as the same conflict rather than clobbering their data.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from("crm_job_visits")
    .select("clocked_out_at, org_id, crew_id")
    .eq("id", visitId)
    .is("deleted_at", null)
    .single();
  if (!existing) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  if (!(await assertCallerOwnsVisit(supabase, user.id, existing.org_id, existing.crew_id))) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
  }
  if (existing?.clocked_out_at) {
    return NextResponse.json({ error: "Already clocked out" }, { status: 409 });
  }

  // actual_hours is intentionally not written here — it derives from
  // start_time/end_time (or clocked_in_at/out) x men_count via the
  // crm_recompute_job_actual_hours trigger, so it's correctly multiplied
  // by crew size instead of reflecting only the raw clock duration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_job_visits")
    .update({
      clocked_out_at:   now,
      end_time:         localTime ? `${localTime}:00` : undefined,
      completed_at:     now,
      status:           "completed",
      completion_notes: notes ?? null,
      updated_at:       now,
    })
    .eq("id", visitId)
    .is("clocked_out_at", null)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Push the next package-sequenced visit's date out if this one completed later
  // than its static schedule assumed. Non-fatal — a failure here shouldn't block
  // the clock-out response.
  try {
    await recalcNextPackageVisitDate(supabase, data?.job_service_id as string | null, now.slice(0, 10));
  } catch (err) {
    console.error("[crew/clock-out] package min_days recalc failed:", err);
  }

  // Compute actual labor cost from crew member times × individual burden rates
  const jobId = data?.job_id as string | undefined;
  if (jobId) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: memberTimes } = await (supabase as any)
        .from("crm_crew_member_times")
        .select("crew_member_id, clocked_in_at, clocked_out_at, break_minutes, lunch_minutes")
        .eq("visit_id", visitId)
        .not("clocked_out_at", "is", null);

      let visitLaborCents = 0;
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
        visitLaborCents += Math.round(hours * burdenRate);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("crm_job_visits")
        .update({ actual_labor_cost_cents: visitLaborCents })
        .eq("id", visitId);

      // Rollup to job
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
    } catch {
      // Non-fatal — labor cost rollup failure should not block clock-out response
    }
  }

  return NextResponse.json(data);
}
