import { resolveBroadcastRecipients } from "@/lib/notify-shared";
import { logger } from "@/lib/logger";

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
