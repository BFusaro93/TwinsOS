import { createServiceClient } from "@/lib/supabase/server";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { processEnrollmentImmediately } from "@/lib/automations/sequence-processor";
import { logger } from "@/lib/logger";
import type { TriggerType } from "@/types/crm-automations";

const log = logger.child("automations/fire-visit-triggers");

/** A visit whose status or date just changed, with what's needed to scope the trigger. */
export type ChangedVisit = {
  client_id: string | null;
  job_id: string | null;
  job_service_id: string | null;
};

/**
 * Server-side counterpart to the client hooks' fireAutomationTrigger for the
 * visit status/date triggers (visit_cancelled, visit_skipped, visit_dispatched,
 * visit_date_changed). Used by routes that change visits without going through
 * those hooks (dispatch-board bulk update, crew-app skip).
 *
 * Callers pass ONLY visits whose status/date actually changed. Visits are
 * folded per client — one trigger firing per client with the union of the
 * visits' service ids — so moving 30 stops of one client doesn't fire 30
 * times (enrollment is per client anyway). Best-effort: never throws.
 *
 * `db` must be the caller's RLS-scoped client (org-scoped reads); processing of
 * any due steps runs under the service client, scoped to the enrollment ids
 * just created for `orgId`.
 */
export async function fireVisitTriggers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  params: { orgId: string; triggerTypes: TriggerType[]; visits: ChangedVisit[] }
): Promise<void> {
  try {
    if (params.triggerTypes.length === 0 || params.visits.length === 0) return;

    // Service ids per visit (a specific job_service_id, else every service on the job).
    const byClient = new Map<string, Set<string>>();
    const jobServiceCache = new Map<string, string[]>();
    for (const v of params.visits) {
      if (!v.client_id) continue;
      const set = byClient.get(v.client_id) ?? new Set<string>();
      byClient.set(v.client_id, set);
      let ids: string[] = [];
      if (v.job_service_id) {
        const key = `js:${v.job_service_id}`;
        if (!jobServiceCache.has(key)) {
          const { data } = await db.from("crm_job_services").select("service_id").eq("id", v.job_service_id).maybeSingle();
          jobServiceCache.set(key, data?.service_id ? [data.service_id as string] : []);
        }
        ids = jobServiceCache.get(key) ?? [];
      } else if (v.job_id) {
        const key = `job:${v.job_id}`;
        if (!jobServiceCache.has(key)) {
          const { data } = await db.from("crm_job_services").select("service_id").eq("job_id", v.job_id);
          jobServiceCache.set(
            key,
            ((data ?? []) as { service_id: string | null }[]).map((s) => s.service_id).filter((x): x is string => !!x)
          );
        }
        ids = jobServiceCache.get(key) ?? [];
      }
      for (const id of ids) set.add(id);
    }

    const enrollmentIds: string[] = [];
    for (const [clientId, serviceIds] of byClient) {
      for (const triggerType of params.triggerTypes) {
        try {
          enrollmentIds.push(
            ...(await fireSimpleTrigger(db, {
              orgId: params.orgId,
              clientId,
              triggerType,
              matchValues: serviceIds.size > 0 ? [...serviceIds] : undefined,
            }))
          );
        } catch (err) {
          log.error("fire failed", { triggerType, clientId, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    if (enrollmentIds.length > 0) {
      const admin = createServiceClient();
      for (const enrollmentId of enrollmentIds) {
        try {
          await processEnrollmentImmediately(admin, enrollmentId);
        } catch (err) {
          log.error("immediate processing failed", { enrollmentId, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }
  } catch (err) {
    log.error("visit trigger firing failed", { error: err instanceof Error ? err.message : String(err) });
  }
}
