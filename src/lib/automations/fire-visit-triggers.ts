import { createServiceClient } from "@/lib/supabase/server";
import { fetchOrgTriggers, fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { isZapierTriggerType } from "@/lib/integrations/zapier";
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
  params: {
    orgId: string;
    triggerTypes: TriggerType[];
    visits: ChangedVisit[];
    /** Stop sending due steps right away after this long (ms): a large batch must not run
     *  the request out of time. Enrollments not processed here stay due and the
     *  automations cron sends them on its next sweep. Unlimited when omitted. */
    processBudgetMs?: number;
  }
): Promise<void> {
  const startedAt = Date.now();
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

    // Service ids per visit, loaded in batches: a specific job_service_id names that
    // line's service; a whole-job visit covers every service the job INCLUDES (a line
    // marked not included isn't performed, so it must not match a service filter).
    const serviceIdByLine = new Map<string, string>();
    const serviceIdsByJob = new Map<string, string[]>();
    const lineIds = [...new Set(params.visits.map((v) => v.job_service_id).filter((x): x is string => !!x))];
    const wholeJobIds = [...new Set(params.visits.filter((v) => !v.job_service_id && v.job_id).map((v) => v.job_id as string))];
    for (let i = 0; i < lineIds.length; i += 100) {
      const { data } = await db.from("crm_job_services").select("id, service_id").in("id", lineIds.slice(i, i + 100));
      for (const r of (data ?? []) as { id: string; service_id: string | null }[]) {
        if (r.service_id) serviceIdByLine.set(r.id, r.service_id);
      }
    }
    for (let i = 0; i < wholeJobIds.length; i += 100) {
      const { data } = await db
        .from("crm_job_services")
        .select("job_id, service_id")
        .in("job_id", wholeJobIds.slice(i, i + 100))
        .not("included", "is", false);
      for (const r of (data ?? []) as { job_id: string; service_id: string | null }[]) {
        if (!r.service_id) continue;
        serviceIdsByJob.set(r.job_id, [...(serviceIdsByJob.get(r.job_id) ?? []), r.service_id]);
      }
    }

    // One firing per (client, service day) with the union of the day's service ids and
    // its first visit id; visits without an id/date fold per client.
    const firings = new Map<string, { clientId: string; visitId: string | null; visitDate: string | null; serviceIds: Set<string> }>();
    for (const v of params.visits) {
      if (!v.client_id) continue;
      const visitDate = v.id ? dateById.get(v.id) ?? null : null;
      const firingKey = visitDate ? `day:${v.client_id}:${visitDate}` : `client:${v.client_id}`;
      const firing = firings.get(firingKey) ?? { clientId: v.client_id, visitId: v.id ?? null, visitDate, serviceIds: new Set<string>() };
      firings.set(firingKey, firing);
      const ids = v.job_service_id
        ? (serviceIdByLine.has(v.job_service_id) ? [serviceIdByLine.get(v.job_service_id) as string] : [])
        : v.job_id ? serviceIdsByJob.get(v.job_id) ?? [] : [];
      for (const id of ids) firing.serviceIds.add(id);
    }

    // The org's triggers of each type, loaded ONCE for the whole batch instead of once
    // per client (a 500-visit bulk action re-ran the paged trigger lookup per client).
    const triggersByType = new Map<TriggerType, unknown[]>();
    for (const triggerType of params.triggerTypes) {
      triggersByType.set(triggerType, await fetchOrgTriggers(db, params.orgId, triggerType));
    }

    const enrollmentIds: string[] = [];
    for (const { clientId, visitId, visitDate, serviceIds } of firings.values()) {
      for (const triggerType of params.triggerTypes) {
        const triggers = triggersByType.get(triggerType) ?? [];
        // Nothing configured and no Zapier hook to notify: skip the per-client work.
        if (triggers.length === 0 && !isZapierTriggerType(triggerType)) continue;
        // One client's failure never stops the rest of the batch.
        try {
          enrollmentIds.push(
            ...(await fireSimpleTrigger(
              db,
              {
                orgId: params.orgId,
                clientId,
                triggerType,
                matchValues: serviceIds.size > 0 ? [...serviceIds] : undefined,
                visitId,
                visitDate,
                // The visit the event is about — Zapier's visit_dispatched hook sends that
                // record, not the client's newest dispatched visit.
                recordId: visitId,
              },
              triggers
            ))
          );
        } catch (err) {
          log.error("fire failed", { triggerType, clientId, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    if (enrollmentIds.length > 0) {
      const admin = createServiceClient();
      for (let i = 0; i < enrollmentIds.length; i++) {
        if (params.processBudgetMs !== undefined && Date.now() - startedAt > params.processBudgetMs) {
          log.info("immediate processing deferred to the automations cron", { deferred: enrollmentIds.length - i });
          break;
        }
        const enrollmentId = enrollmentIds[i];
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
