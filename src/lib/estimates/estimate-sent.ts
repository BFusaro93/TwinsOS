import { createServiceClient } from "@/lib/supabase/server";
import { fireServerTrigger } from "@/lib/automations/fire-server-trigger";
import { logger } from "@/lib/logger";

const log = logger.child("estimate-sent");

/**
 * The FIRST move of an estimate into Sent, by any path — emailed (send-email), proposal
 * link handed out (share-link), or a manual stage change (Detail, kanban drag, bulk; via
 * /api/crm/estimates/[id]/mark-sent). Stamps sent_at and fires "Estimate was sent"
 * exactly once per estimate.
 *
 * sent_at is the once-marker: the stamp is a single conditional UPDATE (stage really is
 * 'sent' now AND sent_at is still empty), so of two racing paths only one gets the row
 * back, and a later re-send, a re-copied link, or Sent → Draft → Sent never re-fires.
 *
 * `userDb` is the caller's own RLS session (it must be allowed to update the estimate —
 * every caller has just changed its stage with it); the trigger is fired with the service
 * client against the org/client read from the claimed row. Best-effort: never throws.
 * Returns whether this call made the first move.
 */
export async function markEstimateFirstSent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userDb: any,
  estimateId: string,
  expectedOrgId?: string | null
): Promise<boolean> {
  try {
    const { data: claimed, error } = await userDb
      .from("estimates")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", estimateId)
      .eq("stage", "sent")
      .is("sent_at", null)
      .is("deleted_at", null)
      .select("id, org_id, client_id, sales_rep_id")
      .maybeSingle();
    if (error) {
      log.error("failed to stamp sent_at", { estimateId, error: error.message });
      return false;
    }
    const row = claimed as { org_id: string; client_id: string | null; sales_rep_id: string | null } | null;
    if (!row) return false; // not in Sent, or already sent before
    if (expectedOrgId && row.org_id !== expectedOrgId) return true; // stamped, but never fire across orgs
    if (row.client_id) {
      await fireServerTrigger(createServiceClient(), {
        orgId: row.org_id,
        clientId: row.client_id,
        estimateId,
        triggerType: "estimate_sent",
        matchValues: row.sales_rep_id ? [row.sales_rep_id] : undefined,
      });
    }
    return true;
  } catch (err) {
    log.error("first-send handling failed", { estimateId, error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
