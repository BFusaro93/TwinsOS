import { recalcNextPackageVisitDate } from "@/lib/package-visit-recalc";
import { applyVisitCompletionSideEffects } from "@/lib/visits/complete-visit-side-effects";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { logger } from "@/lib/logger";
import { findInvoicedLockedVisits } from "@/lib/visits/invoiced-guard";

const log = logger.child("visits/complete");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export type CompleteVisitResult =
  | {
      ok: true;
      jobId: string | null;
      clientId: string | null;
      alreadyCompleted?: boolean;
      invoiced?: boolean;
      invoiceSkipReason?: string | null;
    }
  | { ok: false; status: number; error: string };

/**
 * Marks one visit completed and runs every side effect (package recalc,
 * invoicing, activity timeline, automations) — shared by the single-visit
 * office route and the bulk "Mark Completed" dispatch-board action, so N
 * selected visits cost N calls to THIS function instead of N HTTP round
 * trips from the browser (the N+1 pattern the bulk route replaces).
 */
export async function completeVisit(
  supabase: AnyClient,
  userId: string,
  visitId: string
): Promise<CompleteVisitResult> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .single();
  const orgId: string | null = (profile as { org_id: string | null } | null)?.org_id ?? null;

  const { data: visit, error: visitErr } = await supabase
    .from("crm_job_visits")
    .select("job_id, client_id, invoice_description, scheduled_date, status, completed_at, job_service_id, org_id")
    .eq("id", visitId)
    .single();

  if (visitErr || !visit) {
    return { ok: false, status: 404, error: "Visit not found" };
  }

  const v = visit as {
    job_id: string;
    client_id: string | null;
    status: string;
    completed_at: string | null;
    job_service_id: string | null;
    org_id: string | null;
  };
  const priorStatus = v.status;
  const priorCompletedAt = v.completed_at;

  // A visit already marked completed re-runs the side effects rather than
  // short-circuiting — see the single-visit route for why (repairs a visit
  // whose first completion attempt died part-way through). Only once that
  // completion is clearly no longer in flight, though: a double click / a
  // second tab / bulk + single overlapping would otherwise run a "repair"
  // concurrently with the first call's own side effects.
  const REPAIR_MIN_AGE_MS = 2 * 60 * 1000;
  if (priorStatus === "completed") {
    const completedAgo = priorCompletedAt ? Date.now() - new Date(priorCompletedAt).getTime() : Number.POSITIVE_INFINITY;
    if (!orgId || completedAgo < REPAIR_MIN_AGE_MS) {
      return { ok: true, jobId: v.job_id, clientId: v.client_id, alreadyCompleted: true };
    }
    const repair = await applyVisitCompletionSideEffects({
      supabase,
      orgId,
      visitId,
      userId,
      dedupeActivity: true,
      fireAutomations: false,
    });
    return {
      ok: true,
      jobId: repair.jobId ?? v.job_id,
      clientId: repair.clientId ?? v.client_id,
      alreadyCompleted: true,
      invoiced: repair.invoiced,
      invoiceSkipReason: repair.invoiceSkipReason,
    };
  }

  // Conditional flip: only the call that actually moves the row out of a
  // non-completed status runs the side effects. Two concurrent completions
  // both read a non-completed status above; exactly one of them wins here.
  const { data: flipped, error: vErr } = await supabase
    .from("crm_job_visits")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", visitId)
    .neq("status", "completed")
    .select("id");

  if (vErr) return { ok: false, status: 500, error: vErr.message };
  if (!flipped || (flipped as unknown[]).length === 0) {
    return { ok: true, jobId: v.job_id, clientId: v.client_id, alreadyCompleted: true };
  }

  // Non-fatal — a failure here shouldn't block the rest of completion.
  try {
    await recalcNextPackageVisitDate(
      supabase,
      v.job_service_id,
      todayInZone(await getOrgTimeZone(supabase, v.org_id))
    );
  } catch (err) {
    log.error("package min_days recalc failed", { visitId, error: err instanceof Error ? err.message : String(err) });
  }

  if (!orgId) {
    return { ok: true, jobId: v.job_id, clientId: v.client_id };
  }
  const sideEffects = await applyVisitCompletionSideEffects({ supabase, orgId, visitId, userId });
  if (!sideEffects.ok && sideEffects.error) {
    // Completion and its side effects are not one transaction — restore the
    // prior status so a hard failure leaves the visit genuinely retryable.
    // EXCEPT when the failure came after the invoice line was written: the
    // invoiced-visit guard (trg_crm_job_visits_guard_invoiced) forbids
    // un-completing a visit on a live invoice, and it is right to — the
    // invoice bills it. Leave it completed; a later completion call re-runs
    // the side effects as a repair (dedupeActivity) once REPAIR_MIN_AGE_MS
    // has passed.
    let invoiced = false;
    try {
      const locked = await findInvoicedLockedVisits(
        supabase,
        [{ id: visitId, status: "completed", scheduled_date: null }],
        { status: priorStatus }
      );
      invoiced = locked.has(visitId);
    } catch (err) {
      log.error("invoiced check before completion rollback failed", { visitId, error: err instanceof Error ? err.message : String(err) });
      invoiced = true; // don't fight the guard blind
    }
    if (invoiced) {
      log.error("visit completion side effects failed after invoicing; visit left completed", { visitId, error: sideEffects.error });
      return {
        ok: false,
        status: 500,
        error: `${sideEffects.error} — the visit is invoiced, so it stays completed; completing it again later retries the rest.`,
      };
    }
    const { error: rollbackErr } = await supabase
      .from("crm_job_visits")
      .update({ status: priorStatus, completed_at: priorCompletedAt })
      .eq("id", visitId)
      .eq("status", "completed");
    if (rollbackErr) {
      log.error("visit completion rollback failed", { visitId, error: rollbackErr.message });
    }
    return { ok: false, status: 500, error: sideEffects.error };
  }

  return {
    ok: true,
    jobId: sideEffects.jobId,
    clientId: sideEffects.clientId,
    invoiced: sideEffects.invoiced,
    invoiceSkipReason: sideEffects.invoiceSkipReason,
  };
}
