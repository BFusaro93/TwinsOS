import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";

/**
 * POST /api/crm/visits/[visitId]/return-to-waiting-list
 *
 * For a waiting-list job's visit that was dispatched to a specific day but
 * never actually performed — soft-deletes the visit and clears the parent
 * job's stale scheduled_date/crew_id so it reappears on the Waiting List
 * (src/lib/hooks/use-crm-jobs.ts's useWaitingListJobs only hides a
 * waiting_list job while it has a non-deleted visit; it doesn't otherwise
 * care about job_type/scheduled_date). Logs a client_activity entry so the
 * dispatch attempt isn't silently erased, and fires the (previously dormant)
 * 'visit_moved_to_waiting_list' automation trigger.
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

  const { visitId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as any;

  const { data: visit, error: visitErr } = await db
    .from("crm_job_visits")
    .select("id, job_id, client_id, scheduled_date")
    .eq("id", visitId)
    .is("deleted_at", null)
    .single();
  if (visitErr || !visit) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  const { data: job, error: jobErr } = await db
    .from("crm_jobs")
    .select("id, org_id, job_type")
    .eq("id", visit.job_id)
    .single();
  if (jobErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.job_type !== "waiting_list") {
    return NextResponse.json({ error: "Only waiting-list jobs can be returned to the waiting list" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();

  const { error: deleteErr } = await db
    .from("crm_job_visits")
    .update({ deleted_at: nowIso })
    .eq("id", visitId);
  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

  const { error: jobUpdateErr } = await db
    .from("crm_jobs")
    .update({ scheduled_date: null, crew_id: null })
    .eq("id", job.id);
  if (jobUpdateErr) return NextResponse.json({ error: jobUpdateErr.message }, { status: 500 });

  if (visit.client_id) {
    await db.from("client_activity").insert({
      org_id: job.org_id,
      client_id: visit.client_id,
      activity_type: "job",
      subject: `Visit returned to waiting list${visit.scheduled_date ? ` (was scheduled ${visit.scheduled_date})` : ""}`,
      ref_id: job.id,
      ref_table: "crm_jobs",
      created_by: user.id,
    });

    await fireSimpleTrigger(db, {
      orgId: job.org_id,
      clientId: visit.client_id,
      triggerType: "visit_moved_to_waiting_list",
    });
  }

  return NextResponse.json({ ok: true, clientId: visit.client_id });
}
