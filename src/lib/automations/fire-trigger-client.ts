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
}): void {
  fetch("/api/automations/fire-trigger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).catch(() => {});
}

/**
 * The same event for many clients (a bulk tag / cancel / activate / edit).
 * One request per 50 clients, sent one after another, instead of a request
 * per client: a 4,000-client selection used to fire 4,000 parallel fetches.
 * Best-effort and never awaited by callers, like fireAutomationTrigger.
 */
export function fireAutomationTriggerForClients(params: {
  triggerType: TriggerType;
  clientIds: string[];
  matchValues?: string[];
}): void {
  const { clientIds, ...rest } = params;
  if (clientIds.length === 0) return;
  void (async () => {
    for (let i = 0; i < clientIds.length; i += 50) {
      await fetch("/api/automations/fire-trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rest, clientIds: clientIds.slice(i, i + 50) }),
      }).catch(() => {});
    }
  })();
}
