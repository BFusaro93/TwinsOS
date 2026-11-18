import type { TriggerType } from "@/types/crm-automations";

/** The client columns CLIENT_STATE_TRIGGERS reads. */
export type ClientStateRow = { status: string | null; ok_to_email: boolean | null; sms_opt_in: boolean | null; do_not_market: boolean | null };

/**
 * Client-level triggers whose premise is the client's own current state. These carry no
 * record id, so they can't be verified from a record — but without a check any org member
 * could send an active customer the "sorry to see you go" sequence. Checked when the event
 * is fired from the browser (/api/automations/fire-trigger) AND again when a queued bulk
 * event is finally fired (trigger-queue.ts): a client re-activated between the bulk cancel
 * and the drain must not get the cancellation sequence.
 */
export const CLIENT_STATE_TRIGGERS: Partial<Record<TriggerType, { isTrue: (c: ClientStateRow) => boolean; label: string }>> = {
  client_cancelled: { isTrue: (c) => c.status === "cancelled", label: "the client is not cancelled" },
  // A lead is cancelled from the Clients list (status cancelled) or closed as lost from the Leads page.
  lead_cancelled: { isTrue: (c) => c.status === "cancelled" || c.status === "lost", label: "the lead is not cancelled or lost" },
  lead_converted_to_client: { isTrue: (c) => c.status === "active", label: "the client is not active" },
  client_reactivated: { isTrue: (c) => c.status === "active", label: "the client is not active" },
  // "Re-subscribed to emails" (key kept as has_opted_in_emails): fires when do_not_market
  // goes true → false, so the client must be subscribed to marketing mail now.
  has_opted_in_emails: { isTrue: (c) => c.do_not_market === false, label: "the client is not subscribed to marketing emails" },
  has_opted_in_sms: { isTrue: (c) => c.sms_opt_in === true, label: "the client has not opted in to texts" },
};
