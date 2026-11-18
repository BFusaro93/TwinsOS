import { createServiceClient } from "@/lib/supabase/server";
import { fireServerTrigger } from "@/lib/automations/fire-server-trigger";
import { logger } from "@/lib/logger";

const log = logger.child("automations/invoice-events");

/** Per-invoice automation events that fire exactly once per invoice (20270109000700). */
export type ClaimedInvoiceTrigger = "invoice_created" | "invoice_sent";

/**
 * Fires invoice_created / invoice_sent now from a server route, once per invoice.
 * The crm_invoices trigger queues each event when it happens (number assigned /
 * first move to sent or printed) and the automations run drains the queue;
 * claim_invoice_automation_event() hands the event to exactly one caller, so a
 * route that claims it here fires it immediately and the drain never repeats it.
 * A resend or a second call claims nothing.
 *
 * `orgId` / `clientId` must already be verified by the caller (the invoice's own
 * org and client). Best-effort: never throws.
 */
export async function fireClaimedInvoiceEvents(
  orgId: string,
  clientId: string,
  invoiceId: string,
  triggerTypes: ClaimedInvoiceTrigger[]
): Promise<void> {
  // The claim RPC is service-role only and isn't in the generated types yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createServiceClient() as unknown as any;
  for (const triggerType of triggerTypes) {
    try {
      const { data: won, error } = await admin.rpc("claim_invoice_automation_event", {
        p_invoice_id: invoiceId,
        p_trigger_type: triggerType,
      });
      if (error) {
        log.error("claim failed", { invoiceId, triggerType, error: error.message });
        continue;
      }
      if (won !== true) continue;
      await fireServerTrigger(admin, { orgId, clientId, invoiceId, triggerType });
    } catch (err) {
      log.error("fire failed", { invoiceId, triggerType, error: err instanceof Error ? err.message : String(err) });
    }
  }
}
