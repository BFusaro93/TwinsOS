import { logger } from "@/lib/logger";
import { fireServerTrigger } from "@/lib/automations/fire-server-trigger";

const log = logger.child("stripe apply credit first");

// Minimal structural type so both the browser/server client and the service
// client satisfy it without importing the generated Database type here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Unapplied money (proposal deposit, prepayment, overpayment) the client
 * holds, oldest first. A card/ACH charge that ignores this bills the client
 * twice for the same work: the deposit is left floating as credit while the
 * invoice is paid again from the card.
 *
 * A proposal deposit is RESERVED for its estimate (crm_payments.estimate_id):
 * when `invoiceId` is given, a reserved deposit is only returned if that
 * invoice belongs to the estimate (its job / project / contract — see the
 * estimate_owns_invoice SQL function, which the allocation trigger also
 * enforces). Without the filter a deposit for a spring install was silently
 * spent on the client's next mowing invoice. */
export async function getClientUnappliedPayments(
  db: Db,
  clientId: string,
  invoiceId?: string
): Promise<{ id: string; unusedCents: number; estimateId: string | null }[]> {
  const { data, error } = await db
    .from("crm_payments")
    .select("id, unused_amount_cents, estimate_id")
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .gt("unused_amount_cents", 0)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as { id: string; unused_amount_cents: number; estimate_id: string | null }[];
  const owns = new Map<string, boolean>();
  const out: { id: string; unusedCents: number; estimateId: string | null }[] = [];
  for (const p of rows) {
    if (p.estimate_id) {
      if (!invoiceId) continue;
      if (!owns.has(p.estimate_id)) {
        const { data: ok, error: ownsErr } = await db.rpc("estimate_owns_invoice", {
          p_estimate_id: p.estimate_id,
          p_invoice_id: invoiceId,
        });
        if (ownsErr) throw ownsErr;
        owns.set(p.estimate_id, ok === true);
      }
      if (!owns.get(p.estimate_id)) continue;
    }
    out.push({ id: p.id, unusedCents: p.unused_amount_cents, estimateId: p.estimate_id });
  }
  // Spend the estimate's own deposit first: it can't go anywhere else, while
  // general credit can still pay the client's other invoices.
  return out.sort((a, b) => Number(!!b.estimateId) - Number(!!a.estimateId));
}

/** Applies the client's unapplied credit to the invoice (oldest money first)
 * before a charge, and returns the invoice's remaining balance.
 *
 * Must be called with the signed-in staff user's client, not the service
 * role: `apply_payment_to_invoice` authorizes against my_org_id(), which is
 * null under the service role. */
export async function applyCreditBeforeCharge(
  userDb: Db,
  invoice: { id: string; client_id: string; balance_cents: number },
  /** Fire invoice_paid when this call's credit pays the invoice off — the route
   *  then returns without a charge, so record-charge (which fires it for card/ACH
   *  payments) never runs and the "thanks for your payment" automation was lost.
   *  `serviceDb` must be the service-role client; `orgId` the org the route has
   *  already verified the invoice belongs to. */
  paidOff?: { serviceDb: Db; orgId: string }
): Promise<number> {
  const startBalance = invoice.balance_cents;
  let balance = startBalance;
  let applied = 0;
  const payments = await getClientUnappliedPayments(userDb, invoice.client_id, invoice.id);
  for (const p of payments) {
    if (balance <= 0) break;
    const { data, error } = await userDb.rpc("crm_apply_credit_to_invoice", {
      p_payment_id: p.id,
      p_invoice_id: invoice.id,
      p_amount_cents: Math.min(p.unusedCents, balance),
    });
    if (error) {
      // Charging anyway would double-bill; surface the failure instead.
      log.error("credit apply failed", { invoiceId: invoice.id, paymentId: p.id, error });
      throw error;
    }
    const got = typeof data === "number" ? data : 0;
    applied += got;
    balance -= got;
  }
  // Only the call whose own applies took the balance to zero fires: the RPC caps
  // each apply at the open balance, so two concurrent calls can't both get here.
  if (paidOff && startBalance > 0 && applied > 0 && balance <= 0) {
    await fireInvoicePaidFromCredit(paidOff.serviceDb, paidOff.orgId, invoice.id);
  }
  return Math.max(0, balance);
}

/** invoice_paid for an invoice credit just paid off. Re-reads the invoice in the
 *  verified org (it must really be paid now) and enrolls the client that owns it.
 *  Best-effort: never throws, so a trigger failure can't fail the payment flow. */
async function fireInvoicePaidFromCredit(serviceDb: Db, orgId: string, invoiceId: string): Promise<void> {
  try {
    const { data: inv } = await serviceDb
      .from("crm_invoices")
      .select("client_id, status")
      .eq("id", invoiceId)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!inv?.client_id || inv.status !== "paid") return;
    await fireServerTrigger(serviceDb, { orgId, clientId: inv.client_id, invoiceId, triggerType: "invoice_paid" });
  } catch (err) {
    log.error("invoice_paid after credit apply failed", { invoiceId, error: err instanceof Error ? err.message : String(err) });
  }
}
