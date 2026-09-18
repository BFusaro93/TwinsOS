import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";
import { formatMonthDay } from "@/lib/utils";
import { logger } from "@/lib/logger";

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
    .select("org_id, crew_id, client_id, job_id, scheduled_date, status")
    .eq("id", visitId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  if (!(await assertCallerOwnsVisit(supabase, user.id, existing.org_id, existing.crew_id))) {
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
