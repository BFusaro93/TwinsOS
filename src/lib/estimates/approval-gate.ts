import { logger } from "@/lib/logger";

const log = logger.child("estimate approval gate");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** What the client sees when they try to accept an estimate that still needs
 *  internal approval (it was edited past what was approved, or the approval
 *  was withdrawn after it was sent). */
export const AWAITING_APPROVAL_CLIENT_MESSAGE =
  "This proposal is being reviewed by our team. We'll send you the final version shortly.";

/**
 * Whether the estimate still needs internal approval (pending, rejected,
 * grown past the approved amount, or never submitted while the org's flow
 * requires it) — _estimate_approval_block_reason, the rule the database
 * enforces when the estimate moves to Accepted. A client can never approve,
 * so the proposal and portal accept routes refuse with a friendly message
 * before claiming the signature. Service-role client only.
 */
export async function estimateAwaitingApproval(db: Db, estimateId: string): Promise<boolean> {
  const { data, error } = await db.rpc("_estimate_approval_block_reason", { p_estimate_id: estimateId });
  if (error) {
    // Fail open here: the database trigger still refuses the accept itself.
    log.error("approval gate check failed", { error: error.message, estimateId });
    return false;
  }
  return typeof data === "string" && data.length > 0;
}
