import { selectAllRows } from "@/lib/visits/generate";
import { PAUSE_PRUNE_STATUSES, findUntouchedFutureVisits, pruneVisits } from "@/lib/visits/prune";

/**
 * Removing a service from a job (Job Detail → Services → trash).
 *
 * crm_job_visits.job_service_id is a plain FK (no SET NULL since
 * 20261229000200): deleting a service used to unlink ALL of its visits, which
 * turned completed ones into whole-job visits (re-completing billed every
 * service) and made retired ones hold their date for every other service, so
 * the job's other services stopped regenerating after a hold/resume.
 *
 *   1. The service's untouched upcoming visits — scheduled/dispatched, never
 *      clocked in, on/after the org's today, not invoiced (multi-crew stops
 *      all-or-nothing) — are retired: soft-deleted with occurrence_date
 *      cleared, the same release a hold/cancel prune does.
 *   2. If the service still has history — any other live visit (completed,
 *      skipped, in progress, or a past one nobody closed) or any job product
 *      row — it is STOPPED, not deleted: included = false, which the
 *      generator, the job's rate / total / budgeted-hours rollups, and the
 *      chemical and materials reports already skip. Its visits keep their
 *      link, so they keep billing only that service.
 *   3. Otherwise its soft-deleted visits are unlinked (and released), and the
 *      row is deleted.
 *
 * Works with any Supabase client; every read/write is RLS-scoped.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export interface JobServiceRemovalResult {
  /** "deleted" — the row is gone; "stopped" — kept (included = false) for its history. */
  outcome: "deleted" | "stopped";
  /** Upcoming visits retired. */
  retired: number;
  /** Live visits kept on the service (its history). */
  keptVisits: number;
}

export async function removeJobService(
  supabase: AnyClient,
  args: { serviceId: string; today: string }
): Promise<JobServiceRemovalResult> {
  const { data: svc, error: svcErr } = await supabase
    .from("crm_job_services")
    .select("id, job_id, included")
    .eq("id", args.serviceId)
    .maybeSingle();
  if (svcErr) throw svcErr;
  if (!svc) throw new Error("Service not found");
  const jobId = (svc as { job_id: string }).job_id;

  // Every live visit of the service; the untouched upcoming ones get retired.
  const { rows: live, error: liveErr } = await selectAllRows<{ id: string }>(() => supabase
    .from("crm_job_visits")
    .select("id")
    .eq("job_service_id", args.serviceId)
    .is("deleted_at", null));
  if (liveErr) throw new Error(liveErr);
  const liveIds = new Set(live.map((v) => v.id));
  const untouched = (await findUntouchedFutureVisits(supabase, jobId, { fromDate: args.today, statuses: PAUSE_PRUNE_STATUSES }))
    .filter((id) => liveIds.has(id));
  const untouchedSet = new Set(untouched);
  const keptVisits = live.filter((v) => !untouchedSet.has(v.id)).length;

  const { count: productCount, error: prodErr } = await supabase
    .from("crm_job_products")
    .select("id", { count: "exact", head: true })
    .eq("job_service_id", args.serviceId);
  if (prodErr) throw prodErr;

  if (keptVisits > 0 || (productCount ?? 0) > 0) {
    // Stop it first: on an invoiced job this needs invoice permission
    // (enforce_crm_job_service_billing_write), and failing here leaves
    // everything untouched.
    if ((svc as { included: boolean | null }).included !== false) {
      const { error: stopErr } = await supabase
        .from("crm_job_services")
        .update({ included: false })
        .eq("id", args.serviceId);
      if (stopErr) throw stopErr;
    }
    const retired = untouched.length > 0 ? await pruneVisits(supabase, untouched, PAUSE_PRUNE_STATUSES) : 0;
    return { outcome: "stopped", retired, keptVisits };
  }

  const retired = untouched.length > 0 ? await pruneVisits(supabase, untouched, PAUSE_PRUNE_STATUSES) : 0;
  // Retired / deleted rows still point at the service; unlink them, releasing
  // any occurrence they hold (an unlinked occurrence would hold its date for
  // every other service on the job).
  const { error: unlinkErr } = await supabase
    .from("crm_job_visits")
    .update({ job_service_id: null, occurrence_date: null, updated_at: new Date().toISOString() })
    .eq("job_service_id", args.serviceId)
    .not("deleted_at", "is", null);
  if (unlinkErr) throw unlinkErr;
  const { error: delErr } = await supabase.from("crm_job_services").delete().eq("id", args.serviceId);
  if (delErr) throw delErr;
  return { outcome: "deleted", retired, keptVisits: 0 };
}
