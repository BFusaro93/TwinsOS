import { logger } from "@/lib/logger";

const log = logger.child("estimate deposit due");

/* eslint-disable @typescript-eslint/no-explicit-any -- the new RPC isn't in the generated Supabase types */
type Db = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Stages that mean the proposal has been accepted (by any route). */
export const ACCEPTED_ESTIMATE_STAGES = ["accepted", "won", "invoiced"] as const;

/** Accepted through a proposal link, in the client portal, or by the office
 *  (marking it accepted / converting it). The one test every deposit path uses. */
export function isEstimateAccepted(p: {
  tokenAcceptedAt?: string | null;
  portalAcceptedAt?: string | null;
  stage: string | null | undefined;
}): boolean {
  return (
    !!p.tokenAcceptedAt ||
    !!p.portalAcceptedAt ||
    (ACCEPTED_ESTIMATE_STAGES as readonly string[]).includes(p.stage ?? "")
  );
}

export interface DepositDueInput {
  accepted: boolean;
  stage: string | null | undefined;
  requiredCents: number | null | undefined;
  collectedCents: number | null | undefined;
  pendingCents: number | null | undefined;
  /** The accepted total — a deposit is a down payment, never more than this. */
  totalCents: number | null | undefined;
  /** Staff waived the deposit on the estimate. */
  waivedAt: string | null | undefined;
  /** The estimate's own invoices are issued and fully paid
   *  (estimateDepositSettledByInvoices). */
  settledByInvoices: boolean;
}

/**
 * The deposit still owed on an ACCEPTED estimate, in cents (0 = nothing due).
 *
 * Deposits are optional at acceptance, so a skipped one stays due — shown on
 * the proposal page and in the portal, and payable through the proposal link —
 * until one of these is true:
 *  - a deposit has been collected, or one is still clearing (ACH);
 *  - staff waived it on the estimate;
 *  - the estimate's invoices are issued and paid in full (there is nothing
 *    left to put a deposit down on);
 *  - the estimate was lost/declined.
 * Shared by the proposal GET, deposit-intent and the portal estimates page so
 * the three can never disagree about whether a deposit is due.
 */
export function estimateDepositDueCents(p: DepositDueInput): number {
  const required = p.requiredCents ?? 0;
  if (!p.accepted || required <= 0) return 0;
  if (p.stage === "lost" || p.stage === "declined") return 0;
  if ((p.collectedCents ?? 0) > 0 || (p.pendingCents ?? 0) > 0) return 0;
  if (p.waivedAt) return 0;
  if (p.settledByInvoices) return 0;
  const total = p.totalCents ?? 0;
  return total > 0 ? Math.min(required, total) : required;
}

/**
 * Which of these estimates have their own invoices issued and paid in full
 * (estimate_deposit_invoices_settled). On error, reports none as settled —
 * the deposit then stays visible as due, which is the old behaviour, rather
 * than silently disappearing.
 */
export async function estimatesSettledByInvoices(db: Db, estimateIds: string[]): Promise<Set<string>> {
  if (estimateIds.length === 0) return new Set();
  const { data, error } = await db.rpc("estimate_deposit_invoices_settled", { p_estimate_ids: estimateIds });
  if (error) {
    log.error("failed to check whether estimate invoices are paid", { error, count: estimateIds.length });
    return new Set();
  }
  // A SETOF uuid comes back as an array of bare ids (or objects keyed by the function name).
  return new Set(
    ((data ?? []) as unknown[]).map((row) =>
      typeof row === "string" ? row : String((row as Record<string, unknown>).estimate_deposit_invoices_settled ?? "")
    )
  );
}

export async function estimateSettledByInvoices(db: Db, estimateId: string): Promise<boolean> {
  return (await estimatesSettledByInvoices(db, [estimateId])).has(estimateId);
}
