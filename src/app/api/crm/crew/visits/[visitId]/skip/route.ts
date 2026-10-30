import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";
import { formatMonthDay } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { applyVisitCompletionSideEffects } from "@/lib/visits/complete-visit-side-effects";
import { closeStopPunches } from "@/lib/crew/stop-punches";
import { createServiceClient } from "@/lib/supabase/server";

const log = logger.child("crew/skip");

const Body = z.object({ reason: z.string().min(1, "Reason is required") });

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
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from("crm_job_visits")
    .select("org_id, crew_group_id, crew_id, crew_unassigned, client_id, job_id, scheduled_date, status, clocked_in_at, crm_jobs(crew_id)")
    .eq("id", visitId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  if (!(await assertCallerOwnsVisit(supabase, user.id, existing.org_id, existing))) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
  }

  // Status guard. A skip queued offline can reach the server long after the
  // crew clocked the stop out (or a supervisor cancelled it) — without this,
  // the offline queue's Retry flipped an already-`completed` visit to
  // `skipped` while it kept its clocked_out_at, actual_hours and billing side
  // effects, producing a visit that is skipped and billed at the same time.
  // Re-skipping an already-skipped visit stays a no-op success so a genuine
  // retry of a request that did land isn't surfaced to the crew as an error.
  if (existing.status === "skipped") {
    return NextResponse.json({ id: visitId, status: "skipped", alreadySkipped: true });
  }
  if (existing.status === "completed" || existing.status === "cancelled") {
    return NextResponse.json(
      { error: `This service was already marked ${existing.status} — it can no longer be skipped.` },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_job_visits")
    .update({
      status:      "skipped",
      skip_reason: parsed.data.reason,
      updated_at:  now,
    })
    .eq("id", visitId)
    // Race-safe with the check above: a concurrent clock-out that won the
    // race leaves this matching 0 rows rather than overwriting its result.
    .in("status", ["scheduled", "dispatched", "in_progress"])
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { error: "This service was closed out while the skip was being sent — refresh to see its current state." },
      { status: 409 }
    );
  }

  // Skipping a stop the crew had already started (Start Job punched the whole
  // crew in) must stop their clocks too. Nothing else closes those punches —
  // Stop Job is never reached for a skipped visit — so they stayed open forever,
  // hiding the crew's hours from Job Costing and the Timesheet. Only when no
  // other visit of the stop is still running (same client/day/clock-in): the
  // punches hang off the stop's anchor visit, which may be a sibling.
  if (existing.clocked_in_at) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: stopMates } = await (supabase as any)
        .from("crm_job_visits")
        .select("id, status")
        .eq("client_id", existing.client_id)
        .eq("scheduled_date", existing.scheduled_date)
        .eq("clocked_in_at", existing.clocked_in_at)
        .is("deleted_at", null);
      const mates = ((stopMates ?? []) as { id: string; status: string }[]);
      const stillRunning = mates.some((m) => m.id !== visitId && !["completed", "cancelled", "skipped"].includes(m.status));
      if (!stillRunning) {
        for (const id of new Set([visitId, ...mates.map((m) => m.id)])) {
          await closeStopPunches(supabase, id, now);
        }
      }
    } catch (err) {
      log.error("closing punches on skip failed", { visitId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Multi-crew stop: skipping the lead makes the DB hand the lead role (and the
  // billing) to a live sibling. If that sibling already completed, its
  // auto-invoice step was skipped as a secondary — run it now (idempotent).
  if (existing.crew_group_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newLead } = await (supabase as any)
      .from("crm_job_visits")
      .select("id")
      .eq("crew_group_id", existing.crew_group_id)
      .eq("crew_group_secondary", false)
      .eq("status", "completed")
      .is("deleted_at", null)
      .neq("id", visitId)
      .maybeSingle();
    if (newLead?.id) {
      const r = await applyVisitCompletionSideEffects({
        // Crew accounts have no RLS access to invoice tables (see stops/clock-out),
        // so billing runs under the service client; ownership was proven above.
        supabase: createServiceClient(), orgId: existing.org_id, visitId: newLead.id, userId: user.id, dedupeActivity: true,
      });
      if (!r.ok) log.error("promoted lead billing failed", { visitId: newLead.id, error: r.error });
    }
  }

  // Same client-timeline row the dispatch board writes for a skip — wording
  // mirrors visitOutcomeActivitySubject() in use-crm-jobs.ts ("Visit skipped
  // 9/9 — Weather"); that module is "use client" so it isn't imported here.
  // Only reachable on the actual transition (the guard above returns early
  // otherwise), so a retried request doesn't duplicate it. Written with the
  // caller's own session: client_activity's INSERT policy is org_id +
  // has_crm_access(), and has_crm_access() is true for role 'crew', so the
  // service-role client this used to reach for was never needed.
  // Best-effort.
  if (existing.client_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: actErr } = await (supabase as any).from("client_activity").insert({
      org_id: existing.org_id,
      client_id: existing.client_id,
      activity_type: "job",
      subject: `Visit skipped ${formatMonthDay(existing.scheduled_date)} — ${parsed.data.reason.trim()}`,
      ref_id: existing.job_id,
      ref_table: "crm_jobs",
      created_by: user.id,
      occurred_at: now,
    });
    if (actErr) log.error("activity insert failed", { visitId, error: actErr.message });
  }

  return NextResponse.json(data);
}
