import { resolveBroadcastRecipients } from "@/lib/notify-shared";
import { logger } from "@/lib/logger";
import { isEstimatePastValidUntil } from "@/lib/estimates/validity";
import { isChangedSinceSent } from "@/lib/estimates/proposal-content";

const log = logger.child("estimate deposit excess");

/**
 * Flags (in-app, staff only) an estimate whose collected deposit is larger
 * than its accepted total. This happens when a client pays the deposit against
 * the full proposal and then accepts only part of it. The money is left as
 * unapplied account credit (never auto-refunded); this just makes sure a human
 * decides whether to refund or apply it.
 *
 * Safe to call from any path and any number of times: it re-reads the
 * estimate, does nothing unless the proposal is accepted and the deposit
 * really exceeds the total, and skips when an identical notification (same
 * estimate, same excess) already exists. The actor is the public customer,
 * who is not a user, so every staff recipient is notified.
 */
export async function notifyStaffOfDepositExcess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  estimateId: string
): Promise<void> {
  try {
    const { data: estimate } = await supabase
      .from("estimates")
      .select("id, estimate_number, total_cents, deposit_collected_cents, sales_rep_id")
      .eq("id", estimateId)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!estimate) return;
    const collected = (estimate.deposit_collected_cents as number | null) ?? 0;
    const total = (estimate.total_cents as number | null) ?? 0;
    const excess = collected - total;
    if (collected <= 0 || excess <= 0) return;

    const { data: acceptedToken } = await supabase
      .from("estimate_share_tokens")
      .select("id")
      .eq("estimate_id", estimateId)
      .eq("org_id", orgId)
      .not("accepted_at", "is", null)
      .limit(1)
      .maybeSingle();
    if (!acceptedToken) return;

    const amount = (excess / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
    const label = estimate.estimate_number ? `#${estimate.estimate_number}` : "this estimate";
    const message = `Deposit exceeds accepted total by ${amount} on Estimate ${label} — refund or apply it.`;

    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("org_id", orgId)
      .eq("type", "estimate_deposit_excess")
      .eq("entity_id", estimateId)
      .eq("message", message)
      .limit(1)
      .maybeSingle();
    if (existing) return;

    let recipients = await resolveBroadcastRecipients(supabase, orgId, "estimateDecisionRecipientIds");
    if (estimate.sales_rep_id) {
      const { data: employee } = await supabase
        .from("crm_employees")
        .select("user_id")
        .eq("id", estimate.sales_rep_id)
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .maybeSingle();
      const repUserId = employee?.user_id ?? null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (repUserId && !recipients.some((p: any) => p.id === repUserId)) {
        const { data: rep } = await supabase
          .from("profiles")
          .select("id, email, name, notification_prefs")
          .eq("id", repUserId)
          .neq("status", "inactive")
          .maybeSingle();
        if (rep) recipients = [...recipients, rep];
      }
    }
    if (!recipients.length) return;

    await supabase.from("notifications").insert(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recipients.map((p: any) => ({
        org_id: orgId,
        user_id: p.id,
        type: "estimate_deposit_excess",
        title: `Deposit exceeds total — ${label}`,
        message,
        entity_id: estimateId,
        entity_type: "estimate",
      }))
    );
  } catch (err) {
    // Advisory only: never fail the acceptance or the webhook over it.
    log.error("failed to notify staff of deposit excess", { error: err instanceof Error ? err.message : err, estimateId });
  }
}

/**
 * Flags (in-app, staff only) a proposal deposit that was paid — or is
 * clearing by bank transfer — on an estimate that is NOT accepted and can no
 * longer be accepted from its link: the proposal expired, staff edited it
 * after sending, or it moved off 'sent', in the moments between the client
 * paying and their acceptance being submitted. The charge is confirmed before
 * the acceptance on purpose (proposal/[token]/page.tsx), so the money lands as
 * account credit either way; this makes sure someone follows up instead of the
 * client believing they're booked.
 *
 * Called from both sides of that race, so it fires whichever finishes last:
 * the Connect webhook after recording the deposit, and the accept route when
 * it refuses. It does nothing while the estimate is still acceptable (the
 * client's accept may simply not have arrived yet), once it is accepted, or
 * when no deposit is recorded/pending; and it skips an identical notification
 * that already exists.
 */
export async function notifyStaffOfUnacceptedDeposit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  estimateId: string
): Promise<void> {
  try {
    const { data: estimate } = await supabase
      .from("estimates")
      .select("id, estimate_number, stage, valid_until_date, portal_accepted_at, deposit_collected_cents, deposit_pending_cents, sales_rep_id")
      .eq("id", estimateId)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .maybeSingle();
    // Accepted some other way (portal, or by the office): nothing is stranded.
    if (!estimate || estimate.portal_accepted_at || ["accepted", "won", "invoiced"].includes(estimate.stage as string)) return;
    const depositCents =
      ((estimate.deposit_collected_cents as number | null) ?? 0) || ((estimate.deposit_pending_cents as number | null) ?? 0);
    if (depositCents <= 0) return;

    const { data: acceptedToken } = await supabase
      .from("estimate_share_tokens")
      .select("id")
      .eq("estimate_id", estimateId)
      .eq("org_id", orgId)
      .not("accepted_at", "is", null)
      .limit(1)
      .maybeSingle();
    if (acceptedToken) return;

    // Still acceptable from the link: the acceptance may just be in flight.
    let reason: string | null = null;
    if (estimate.stage !== "sent") {
      reason = "the estimate is no longer open for acceptance";
    } else if (await isEstimatePastValidUntil(supabase, orgId, estimate.valid_until_date as string | null)) {
      reason = "the proposal had expired";
    } else if (await isChangedSinceSent(supabase, estimateId)) {
      reason = "the estimate was edited after it was sent";
    }
    if (!reason) return;

    const amount = (depositCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
    const label = estimate.estimate_number ? `#${estimate.estimate_number}` : "this estimate";
    const message = `A ${amount} deposit was paid on Estimate ${label}, but the proposal wasn't accepted because ${reason}. It's on the client's account as credit — follow up to re-send or refund.`;

    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("org_id", orgId)
      .eq("type", "estimate_deposit_unaccepted")
      .eq("entity_id", estimateId)
      .eq("message", message)
      .limit(1)
      .maybeSingle();
    if (existing) return;

    const recipients = await depositRecipients(supabase, orgId, estimate.sales_rep_id as string | null);
    if (!recipients.length) return;

    await supabase.from("notifications").insert(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recipients.map((p: any) => ({
        org_id: orgId,
        user_id: p.id,
        type: "estimate_deposit_unaccepted",
        title: `Deposit paid, not accepted — ${label}`,
        message,
        entity_id: estimateId,
        entity_type: "estimate",
      }))
    );
  } catch (err) {
    // Advisory only: never fail the acceptance or the webhook over it.
    log.error("failed to notify staff of an unaccepted deposit", { error: err instanceof Error ? err.message : err, estimateId });
  }
}

/** estimateDecisionRecipientIds plus the estimate's sales rep (a
 *  crm_employees.id, resolved through user_id). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function depositRecipients(supabase: any, orgId: string, salesRepId: string | null): Promise<any[]> {
  let recipients = await resolveBroadcastRecipients(supabase, orgId, "estimateDecisionRecipientIds");
  if (salesRepId) {
    const { data: employee } = await supabase
      .from("crm_employees")
      .select("user_id")
      .eq("id", salesRepId)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .maybeSingle();
    const repUserId = employee?.user_id ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (repUserId && !recipients.some((p: any) => p.id === repUserId)) {
      const { data: rep } = await supabase
        .from("profiles")
        .select("id, email, name, notification_prefs")
        .eq("id", repUserId)
        .neq("status", "inactive")
        .maybeSingle();
      if (rep) recipients = [...recipients, rep];
    }
  }
  return recipients;
}
