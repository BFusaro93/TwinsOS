import { rejectWithoutSchedulingPermission } from "@/lib/auth/scheduling-permission";
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
 *
 * A package step (e.g. a rained-out fert application) goes back differently:
 * its visit is the step's placeholder, so it is kept and returned to the
 * placeholder state ('scheduled', not dispatched) — that is what lists the
 * step on the Waiting List again. Deleting it would leave the step with no
 * visit at all. Later steps are re-spaced when this one is completed
 * (recalcNextPackageVisitDate).
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
  const denied = await rejectWithoutSchedulingPermission(supabase);
  if (denied) return denied;

  const { visitId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as any;

  // The whole return is one transaction (crm_return_visit_to_waiting_list, security
  // invoker so RLS and the schedule write guard apply). A multi-crew stop goes back
  // as ONE stop: every crew's visit on it is returned together, and it's refused if
  // any crew on it has clocked in. Returning only the clicked crew's visit used to
  // leave the job half-scheduled (hidden from the Waiting List) or another crew's
  // package-step visit still dispatched.
  const { data: result, error: rpcErr } = await db.rpc("crm_return_visit_to_waiting_list", { p_visit_id: visitId });
  if (rpcErr) {
    const hinted = Number((rpcErr as { hint?: string | null }).hint);
    const status = hinted === 400 || hinted === 404 || hinted === 409 ? hinted : 500;
    return NextResponse.json({ error: rpcErr.message ?? "Failed to return visit to waiting list" }, { status });
  }
  const r = (result ?? {}) as {
    returned_visit_ids?: string[];
    client_id?: string | null;
    job_id?: string;
    org_id?: string;
    scheduled_date?: string | null;
  };
  const returnedVisitIds = r.returned_visit_ids ?? [visitId];

  if (r.client_id && r.job_id && r.org_id) {
    const crews = returnedVisitIds.length > 1 ? ` — all ${returnedVisitIds.length} crews on the stop` : "";
    await db.from("client_activity").insert({
      org_id: r.org_id,
      client_id: r.client_id,
      activity_type: "job",
      subject: `Visit returned to waiting list${r.scheduled_date ? ` (was scheduled ${r.scheduled_date})` : ""}${crews}`,
      ref_id: r.job_id,
      ref_table: "crm_jobs",
      created_by: user.id,
    });

    // One stop, one firing (visit triggers run once per client per service day). The
    // day is passed explicitly: the visit may now be soft-deleted.
    await fireSimpleTrigger(db, {
      orgId: r.org_id,
      clientId: r.client_id,
      triggerType: "visit_moved_to_waiting_list",
      visitId,
      visitDate: r.scheduled_date ?? null,
    });
  }

  return NextResponse.json({ ok: true, clientId: r.client_id ?? null, returnedVisitIds });
}
