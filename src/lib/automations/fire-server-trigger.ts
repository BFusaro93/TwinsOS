import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { processEnrollmentImmediately } from "@/lib/automations/sequence-processor";
import { logger } from "@/lib/logger";

const log = logger.child("automations/fire-server-trigger");

/**
 * Server-side fire + immediate processing for routes that change a record
 * without going through a client hook (public proposal accept, portal
 * decisions, form submissions). Same as /api/automations/fire-trigger after
 * its checks: enroll, then send any step that's due now (an email with no wait
 * in front of it) instead of leaving it for the next cron sweep.
 *
 * `db` must be a service-role client — the processor writes tables an RLS
 * session doesn't cover, and these callers (anonymous proposal links, portal
 * customers) have no staff session. Callers must only pass an orgId/clientId
 * they have already verified. Best-effort: never throws.
 */
export async function fireServerTrigger(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  params: Parameters<typeof fireSimpleTrigger>[1]
): Promise<void> {
  try {
    const enrollmentIds = await fireSimpleTrigger(db, params);
    for (const enrollmentId of enrollmentIds) {
      try {
        await processEnrollmentImmediately(db, enrollmentId);
      } catch (err) {
        log.error("immediate processing failed", {
          enrollmentId,
          triggerType: params.triggerType,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    log.error("trigger failed", {
      triggerType: params.triggerType,
      orgId: params.orgId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
