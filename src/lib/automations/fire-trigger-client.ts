import type { TriggerType } from "@/types/crm-automations";

/**
 * Fires an automation trigger from a client-side mutation hook, best-effort —
 * mirrors the ticket-notify fetch pattern in src/lib/hooks/use-tickets.ts.
 * Call this from a mutation's onSuccess, after its own DB write has already
 * succeeded. Never awaited by callers; a failure here must never surface as
 * a failure of the action it's describing.
 */
export function fireAutomationTrigger(params: {
  triggerType: TriggerType;
  clientId: string;
  estimateId?: string;
  /** The ticket/invoice this event pertains to — lets ticket_category/ticket_past_due_days/invoice_* conditions check the right record, and scopes the resulting enrollment to it for later stop-condition checks. */
  ticketId?: string;
  invoiceId?: string;
  /** The value(s) this event pertains to — checked against a trigger's config.filter_values, if configured (e.g. a client's new source, a ticket's category). */
  matchValues?: string[];
  /** The visit a visit-event trigger is about — its service day scopes the run (once per client per day) and the snow merge tags read that stop. */
  visitId?: string;
  /** The job a job-event trigger (job_created, job_cancelled, package_*) is about — the run is scoped to it (once per job). */
  jobId?: string;
  /** The contract (contract_created / contract_signed) or damage case (damage_case_created)
   *  the event is about — the run is scoped to it (once per record). */
  recordId?: string;
}): void {
  fetch("/api/automations/fire-trigger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).catch(() => {});
}

/**
 * After a visit is skipped, cancelled or moved off a day: asks the server whether
 * that left the client's service day finished, which fires visit_completed /
 * service_visit_completed for the day (see /api/automations/visit-day-closed).
 * `visitDate` is the day the visit was on BEFORE the change. Best-effort, never awaited.
 */
export function checkVisitDayClosed(params: { visitId: string; visitDate: string }): void {
  fetch("/api/automations/visit-day-closed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).catch(() => {});
}
