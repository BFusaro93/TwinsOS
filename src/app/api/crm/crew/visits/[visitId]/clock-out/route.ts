import { NextResponse } from "next/server";
import { z } from "zod";
import { recalcNextPackageVisitDate } from "@/lib/package-visit-recalc";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { applyVisitCompletionSideEffects } from "@/lib/visits/complete-visit-side-effects";
import { sumPunchLaborCents } from "@/lib/crew/visit-labor";
import { logger } from "@/lib/logger";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { isoInZone } from "@/lib/time/zone";

const log = logger.child("crew/clock-out");

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
    .select("clocked_out_at, org_id, crew_id, crew_unassigned, status, paused_at, break_minutes, crm_jobs(crew_id)")
    .eq("id", visitId)
    .is("deleted_at", null)
    .single();
  if (!existing) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  if (!(await assertCallerOwnsVisit(supabase, user.id, existing.org_id, existing))) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
  }
  if (existing?.clocked_out_at) {
    return NextResponse.json({ error: "Already clocked out" }, { status: 409 });
  }
  // A cancelled / skipped visit must never be flipped to completed (and
  // billed) by a stale or replayed crew request.
  if (existing.status === "cancelled" || existing.status === "skipped") {
    return NextResponse.json(
      { error: `This visit is ${existing.status} — ask the office to reopen it first.`, code: "visit_terminal" },
      { status: 409 }
    );
  }

  // Clocking out straight from a break (no Resume tap) must still net the
  // in-progress pause off the visit's hours, and must not leave paused_at
  // dangling on a completed visit — the stop clock-out does the same.
  const finalBreakMinutes = (existing.break_minutes ?? 0) + (existing.paused_at
    ? Math.max(0, Math.round((new Date(now).getTime() - new Date(existing.paused_at as string).getTime()) / 60_000))
    : 0);

  // actual_hours is intentionally not written here — it derives from
  // start_time/end_time (or clocked_in_at/out) x men_count via the
  // crm_recompute_job_actual_hours trigger, so it's correctly multiplied
  // by crew size instead of reflecting only the raw clock duration.
  // One guarded update for the clock-out AND the completion flip — two
  // separate writes (with the second's error ignored) left a visit
  // clocked-out-but-not-completed whenever the second one failed, and the
  // retry then 409'd on "Already clocked out". The clocked_out_at IS NULL
  // guard keeps a racing retry from overwriting; a visit the office already
  // completed keeps its own completed_at and does not re-run side effects.
  const alreadyCompleted = existing.status === "completed";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: clockedOut, error } = await (supabase as any)
    .from("crm_job_visits")
    .update({
      clocked_out_at:   now,
      end_time:         localTime ? `${localTime}:00` : undefined,
      completion_notes: notes ?? null,
      paused_at:        null,
      break_minutes:    finalBreakMinutes,
      ...(alreadyCompleted ? {} : { status: "completed", completed_at: now }),
      updated_at:       now,
    })
    .eq("id", visitId)
    .is("clocked_out_at", null)
    .not("status", "in", "(cancelled,skipped)")
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!clockedOut) return NextResponse.json({ error: "Already clocked out" }, { status: 409 });

  const transitioned = !alreadyCompleted;
  const data = clockedOut;

  // Push the next package-sequenced visit's date out if this one completed later
  // than its static schedule assumed. Non-fatal — a failure here shouldn't block
  // the clock-out response.
  if (transitioned) {
    try {
      await recalcNextPackageVisitDate(supabase, data?.job_service_id as string | null,
        isoInZone(new Date(now), await getOrgTimeZone(supabase, existing.org_id as string)));
    } catch (err) {
      log.error("package min_days recalc failed", { visitId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Compute actual labor cost from crew member times × individual burden rates
  const jobId = data?.job_id as string | undefined;
  if (jobId) {
    try {
      const visitLaborCents = await sumPunchLaborCents(supabase, visitId);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("crm_job_visits")
        .update({ actual_labor_cost_cents: visitLaborCents })
        .eq("id", visitId);

      // Rollup to job
      const jobAdmin = createServiceClient();
      // Job-level totals go through the service client: the job's visits
      // span every crew (crew RLS only returns the caller's own crew's
      // visits, which undercounted the job), and crew accounts can't UPDATE
      // crm_jobs at all — the rollup below was silently a no-op for them.
      // jobId comes from a visit whose ownership was already proven above.
      const { data: visitTotals } = await jobAdmin
        .from("crm_job_visits")
        .select("actual_labor_cost_cents")
        .eq("job_id", jobId)
        .is("deleted_at", null);
      const jobLaborCents = (visitTotals ?? []).reduce(
        (sum: number, v: { actual_labor_cost_cents: number | null }) => sum + (v.actual_labor_cost_cents ?? 0), 0
      );
      await jobAdmin
        .from("crm_jobs")
        .update({ actual_labor_cost_cents: jobLaborCents })
        .eq("id", jobId);
    } catch {
      // Non-fatal — labor cost rollup failure should not block clock-out response
    }
  }

  // Billing + timeline + automations — the same side effects the office
  // "Mark Complete" route applies, so a visit finished from the field is
  // invoiced instead of silently dropping off the books. Crew accounts have
  // no RLS access to invoice tables, so this runs under the service-role
  // client, pinned to the visit's org; ownership of the visit was already
  // proven by assertCallerOwnsVisit above. Non-fatal — the clock-out itself
  // has already been recorded.
  if (transitioned) {
    try {
      const sideEffects = await applyVisitCompletionSideEffects({
        supabase: createServiceClient(),
        orgId: existing.org_id as string,
        visitId,
        userId: user.id,
      });
      if (!sideEffects.ok) {
        log.error("completion side effects failed", { visitId, error: sideEffects.error });
      }
    } catch (err) {
      log.error("completion side effects threw", { visitId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json(data);
}
