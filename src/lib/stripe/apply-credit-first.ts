import { logger } from "@/lib/logger";

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
  invoice: { id: string; client_id: string; balance_cents: number }
): Promise<number> {
  let balance = invoice.balance_cents;
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
    balance -= typeof data === "number" ? data : 0;
  }
  return Math.max(0, balance);
}
