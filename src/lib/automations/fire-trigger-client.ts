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
}): void {
  fetch("/api/automations/fire-trigger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).catch(() => {});
}
