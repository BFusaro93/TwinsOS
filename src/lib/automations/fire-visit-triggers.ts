import { createServiceClient } from "@/lib/supabase/server";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { processEnrollmentImmediately } from "@/lib/automations/sequence-processor";
import { logger } from "@/lib/logger";
import type { TriggerType } from "@/types/crm-automations";

const log = logger.child("automations/fire-visit-triggers");

/** A visit whose status or date just changed, with what's needed to scope the trigger. */
export type ChangedVisit = {
  /** The visit — its service day scopes the run (once per client per day), and the
   *  day's first visit is stored on the enrollment so snow merge tags read that stop. */
  id?: string | null;
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
 * Callers pass ONLY visits whose status/date actually changed. These triggers
 * run ONCE PER CLIENT PER SERVICE DAY (see enrollment-scope.ts), so the batch is
 * folded per (client, day) — the visit's scheduled_date read AFTER the caller's
 * write, i.e. the NEW date for a date change — with the union of the day's
 * service ids and the day's first visit id. A stop's sibling visits (one per
 * service, one per crew) dispatched together fire once; a visit on another day
 * fires its own. (Visits without an id or date fold into one client-level firing.)
 * Best-effort: never throws.
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

    // Each visit's CURRENT service day (after the caller's write: the new date for a move).
    const dateById = new Map<string, string>();
    const visitIds = params.visits.map((v) => v.id).filter((id): id is string => !!id);
    for (let i = 0; i < visitIds.length; i += 100) {
      const { data } = await db.from("crm_job_visits").select("id, scheduled_date").in("id", visitIds.slice(i, i + 100));
      for (const r of (data ?? []) as { id: string; scheduled_date: string | null }[]) {
        if (r.scheduled_date) dateById.set(r.id, r.scheduled_date);
      }
    }

    // One firing per (client, service day) with the union of the day's service ids and
    // its first visit id; visits without an id/date fold per client. Service ids per
    // visit: a specific job_service_id, else every service on the job.
    const firings = new Map<string, { clientId: string; visitId: string | null; visitDate: string | null; serviceIds: Set<string> }>();
    const jobServiceCache = new Map<string, string[]>();
    for (const v of params.visits) {
      if (!v.client_id) continue;
      const visitDate = v.id ? dateById.get(v.id) ?? null : null;
      const firingKey = visitDate ? `day:${v.client_id}:${visitDate}` : `client:${v.client_id}`;
      const firing = firings.get(firingKey) ?? { clientId: v.client_id, visitId: v.id ?? null, visitDate, serviceIds: new Set<string>() };
      firings.set(firingKey, firing);
      const set = firing.serviceIds;
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
    for (const { clientId, visitId, visitDate, serviceIds } of firings.values()) {
      for (const triggerType of params.triggerTypes) {
        try {
          enrollmentIds.push(
            ...(await fireSimpleTrigger(db, {
              orgId: params.orgId,
              clientId,
              triggerType,
              matchValues: serviceIds.size > 0 ? [...serviceIds] : undefined,
              visitId,
              visitDate,
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
