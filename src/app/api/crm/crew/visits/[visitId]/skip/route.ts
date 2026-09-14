import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";
import { createServiceClient } from "@/lib/supabase/server";
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
  const body = await request.json();
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from("crm_job_visits")
    .select("org_id, crew_id, client_id, job_id, scheduled_date, status")
    .eq("id", visitId)
    .is("deleted_at", null)
    .single();
  if (!existing) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  if (!(await assertCallerOwnsVisit(supabase, user.id, existing.org_id, existing.crew_id))) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
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
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Same client-timeline row the dispatch board writes for a skip — wording
  // mirrors visitOutcomeActivitySubject() in use-crm-jobs.ts ("Visit skipped
  // 9/9 — Weather"); that module is "use client" so it isn't imported here.
  // Only on the actual transition so a retried request doesn't duplicate it. Crew accounts can't insert into
  // client_activity under RLS, so this uses the service client pinned to the
  // visit's org (ownership already verified above). Best-effort.
  if (existing.client_id && existing.status !== "skipped") {
    try {
      const admin = createServiceClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: actErr } = await (admin as any).from("client_activity").insert({
        org_id: existing.org_id,
        client_id: existing.client_id,
        activity_type: "job",
        subject: `Visit skipped ${formatMonthDay(existing.scheduled_date)} — ${parsed.data.reason.trim()}`,
        ref_id: existing.job_id,
        ref_table: "crm_jobs",
        created_by: user.id,
      });
      if (actErr) log.error("activity insert failed", { visitId, error: actErr.message });
    } catch (err) {
      log.error("activity insert threw", { visitId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json(data);
}
