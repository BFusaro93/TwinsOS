import { createClient } from "@supabase/supabase-js";
import { fireServiceVisitCompletedTriggers, fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { processEnrollmentImmediately } from "@/lib/automations/sequence-processor";
import { logger } from "@/lib/logger";

const log = logger.child("automations/visit-day-completed");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/** Visit statuses that still have work ahead of them. */
const OPEN_VISIT_STATUSES = new Set(["scheduled", "dispatched", "in_progress"]);

/**
 * Fires "Visit was completed" (visit_completed) and "Service visit completed"
 * (service_visit_completed) once a client's SERVICE DAY is finished — i.e. that
 * client has no open (scheduled / dispatched / in progress) visit left on that
 * date and at least one visit that day was completed.
 *
 * A stop is often several visits (one per service, one per crew): firing on the
 * first one sent "your service is complete" while the crew was still working the
 * rest. So every event that can close a day calls this — the completion that
 * finishes the last open visit, and skipping, cancelling or moving the last open
 * one off the day. Until the day is finished it does nothing.
 *
 * Service filters match the union of the services of that day's COMPLETED visits
 * (a whole-job visit covers the job's included services). The run is scoped to the
 * client's day (crm_sequence_enrollments.visit_date), so the several events that
 * can close a day still start one run per sequence (the per-day dedupe in
 * isEligibleForEnrollment / the active-run unique index).
 *
 * `db` reads the day's visits — the caller's RLS-scoped client or a service-role
 * client; `orgId`/`clientId` must already be verified by the caller. Due steps are
 * sent right away with a service-role client. Best-effort: never throws. Returns the
 * enrollments created.
 */
export async function fireVisitDayCompletedTriggers(
  db: AnyClient,
  params: { orgId: string; clientId: string; visitDate: string | null | undefined; processImmediately?: boolean }
): Promise<string[]> {
  if (!params.visitDate) return [];
  try {
    const { data: dayRows, error } = await db
      .from("crm_job_visits")
      .select("id, job_id, job_service_id, status, created_at")
      .eq("org_id", params.orgId)
      .eq("client_id", params.clientId)
      .eq("scheduled_date", params.visitDate)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) {
      log.error("day lookup failed", { clientId: params.clientId, visitDate: params.visitDate, error: error.message });
      return [];
    }
    const day = (dayRows ?? []) as { id: string; job_id: string | null; job_service_id: string | null; status: string | null }[];
    if (day.some((v) => OPEN_VISIT_STATUSES.has(v.status ?? ""))) return []; // the day isn't finished yet
    const completed = day.filter((v) => v.status === "completed");
    if (completed.length === 0) return []; // nothing was done that day (all skipped / cancelled)

    // Union of the completed visits' services.
    const serviceIds = new Set<string>();
    const lineIds = [...new Set(completed.map((v) => v.job_service_id).filter((x): x is string => !!x))];
    const wholeJobIds = [...new Set(completed.filter((v) => !v.job_service_id && v.job_id).map((v) => v.job_id as string))];
    if (lineIds.length > 0) {
      const { data } = await db.from("crm_job_services").select("service_id").in("id", lineIds);
      for (const r of (data ?? []) as { service_id: string | null }[]) if (r.service_id) serviceIds.add(r.service_id);
    }
    if (wholeJobIds.length > 0) {
      const { data } = await db
        .from("crm_job_services")
        .select("service_id")
        .in("job_id", wholeJobIds)
        .not("included", "is", false);
      for (const r of (data ?? []) as { service_id: string | null }[]) if (r.service_id) serviceIds.add(r.service_id);
    }

    // The day's first completed visit is the run's visit (snow merge tags read it).
    const visitId = completed[0].id;
    const ids = [...serviceIds];
    const enrollmentIds: string[] = [];
    if (ids.length > 0) {
      enrollmentIds.push(
        ...(await fireServiceVisitCompletedTriggers(db, {
          orgId: params.orgId, clientId: params.clientId, serviceIds: ids, visitId, visitDate: params.visitDate,
        }))
      );
    }
    enrollmentIds.push(
      ...(await fireSimpleTrigger(db, {
        orgId: params.orgId, clientId: params.clientId, triggerType: "visit_completed",
        matchValues: ids, visitId, visitDate: params.visitDate,
      }))
    );

    // Send any step due right now instead of waiting for the automations cron. Service
    // role: the processor writes tables an RLS session doesn't cover; only the ids just
    // created (for the verified org) are processed.
    if (params.processImmediately !== false && enrollmentIds.length > 0) {
      const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      for (const enrollmentId of enrollmentIds) {
        try {
          await processEnrollmentImmediately(admin, enrollmentId);
        } catch (err) {
          log.error("immediate processing failed", { enrollmentId, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }
    return enrollmentIds;
  } catch (err) {
    log.error("day-completed trigger failed", {
      clientId: params.clientId, visitDate: params.visitDate, error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/** Distinct (client, day) pairs from visit rows — the days a batch of status/date changes may have closed. */
export function visitDaysOf(rows: { client_id: string | null; scheduled_date: string | null }[]): { clientId: string; visitDate: string }[] {
  const seen = new Map<string, { clientId: string; visitDate: string }>();
  for (const r of rows) {
    if (!r.client_id || !r.scheduled_date) continue;
    seen.set(`${r.client_id}:${r.scheduled_date}`, { clientId: r.client_id, visitDate: r.scheduled_date });
  }
  return [...seen.values()];
}
