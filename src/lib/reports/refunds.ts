import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import { AR_WRITE_OFF_METHOD } from "@/lib/reports/helpers";

/**
 * Cash refunds dated by the day they were issued (crm_payment_refunds).
 *
 * Cash-basis reports count a payment on its payment date at its full amount
 * and subtract each refund on the refund's OWN date — a March refund of a
 * January payment lands in March, and January's numbers never change after
 * the fact. A dispute that was won comes back as a negative refund on the day
 * it was reinstated. `feeCents` is the refunded share of the card processing
 * fee (a payment's fee net of refunds = fee − round(fee × refunded / amount)).
 *
 * Same cash-only rule as the payment side: account credits and AR write-offs
 * are excluded, as are refunds on deleted payments.
 */
export interface DatedRefund {
  refundDate: string;
  amountCents: number;
  feeCents: number;
  paymentId: string;
  paymentDate: string | null;
  method: string | null;
  clientName: string | null;
}

interface RefundRow {
  refund_date: string;
  amount_cents: number | null;
  fee_cents: number | null;
  payment_id: string;
  crm_payments: {
    payment_date: string | null;
    method: string | null;
    clients: { display_name: string | null } | null;
  } | null;
}

export async function fetchCashRefunds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  from: string | null,
  to: string | null,
  opts: { cardFeesOnly?: boolean } = {}
): Promise<DatedRefund[]> {
  // crm_payment_refunds isn't in the generated API types yet.
  const db = supabase as unknown as SupabaseClient;
  const rows = await fetchAllRows<RefundRow>(() => {
    let q = db
      .from("crm_payment_refunds")
      .select(
        "refund_date, amount_cents, fee_cents, payment_id, crm_payments!inner(payment_date, method, is_credit, deleted_at, clients:client_id(display_name))"
      )
      .is("deleted_at", null)
      .is("crm_payments.deleted_at", null)
      .eq("crm_payments.is_credit", false)
      .neq("crm_payments.method", AR_WRITE_OFF_METHOD);
    if (opts.cardFeesOnly) q = q.neq("fee_cents", 0);
    if (from) q = q.gte("refund_date", from);
    if (to) q = q.lte("refund_date", to);
    return q;
  });
  return rows.map((r) => ({
    refundDate: r.refund_date,
    amountCents: r.amount_cents ?? 0,
    feeCents: r.fee_cents ?? 0,
    paymentId: r.payment_id,
    paymentDate: r.crm_payments?.payment_date ?? null,
    method: r.crm_payments?.method ?? null,
    clientName: r.crm_payments?.clients?.display_name ?? null,
  }));
}

export const sumRefundCents = (refunds: DatedRefund[]): number =>
  refunds.reduce((s, r) => s + r.amountCents, 0);

export const sumRefundFeeCents = (refunds: DatedRefund[]): number =>
  refunds.reduce((s, r) => s + r.feeCents, 0);

/** Cash-basis note shared by the reports that use fetchCashRefunds. */
export const REFUNDS_OWN_DATE_NOTE =
  "Refunds are subtracted on the day they were issued (a refund of an earlier month's payment shows in the month it was refunded).";
