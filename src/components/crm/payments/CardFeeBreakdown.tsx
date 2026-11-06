import { formatCurrency } from "@/lib/utils";

/**
 * "$150.00 + $4.79 card fee = $154.79 charged" for a card payment that carried a
 * processing fee. The fee is what the customer paid on top of the invoice amount
 * (company revenue) — it is not what Stripe charged the business. Renders nothing
 * when there was no fee.
 */
export function cardChargeTotalCents(payment: { amountCents: number; processingFeeCents: number }): number {
  return payment.amountCents + (payment.processingFeeCents ?? 0);
}

export function CardFeeLine({
  payment,
  className,
}: {
  payment: { amountCents: number; processingFeeCents: number };
  className?: string;
}) {
  if (!payment.processingFeeCents || payment.processingFeeCents <= 0) return null;
  return (
    <span className={className ?? "block text-[11px] font-normal text-slate-400 dark:text-neutral-500"}>
      + {formatCurrency(payment.processingFeeCents)} card fee = {formatCurrency(cardChargeTotalCents(payment))} charged
    </span>
  );
}
