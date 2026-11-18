import type Stripe from "stripe";
import { fireServerTrigger } from "@/lib/automations/fire-server-trigger";

// The service client's generated types don't cover every column written here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Stores a confirmed SetupIntent's payment method on the client (office and portal
 * "save card / bank account") and fires credit_card_updated when the method on
 * file actually changed. That trigger used to fire only from the Connect
 * webhook's payment_method.updated, which saving a card never causes — so the
 * "card updated" automation never ran for a card a client or staff member saved.
 *
 * Once per change: the update that swaps in a NEW payment method id is the only
 * one that fires; a repeated PUT for the same SetupIntent finds the id already
 * stored and just re-applies the autopay flag. `serviceDb` is the service-role
 * client; `orgId` / `clientId` must already be verified by the caller.
 */
export async function saveClientPaymentMethod(
  serviceDb: Db,
  args: {
    orgId: string;
    clientId: string;
    pm: Stripe.PaymentMethod;
    summary: string | null;
    enableAutopay: boolean;
  }
): Promise<{ error: { message: string } | null }> {
  const { orgId, clientId, pm, summary, enableAutopay } = args;
  const patch = {
    saved_payment_method_id: pm.id,
    saved_payment_method_type: pm.type,
    saved_payment_method_summary: summary,
    autopay_enabled: enableAutopay,
  };
  const { data: changed, error } = await serviceDb
    .from("clients")
    .update(patch)
    .eq("id", clientId)
    .eq("org_id", orgId)
    .or(`saved_payment_method_id.is.null,saved_payment_method_id.neq.${pm.id}`)
    .select("id");
  if (error) return { error };

  if ((changed ?? []).length === 0) {
    // Same payment method already on file (a retried save): keep the autopay choice, no trigger.
    const { error: sameErr } = await serviceDb
      .from("clients")
      .update(patch)
      .eq("id", clientId)
      .eq("org_id", orgId);
    return { error: sameErr ?? null };
  }

  // A card or a bank account — the trigger is the "payment method on file was updated" event.
  await fireServerTrigger(serviceDb, { orgId, clientId, triggerType: "credit_card_updated" });
  return { error: null };
}
