import type { PaymentIntent } from "@stripe/stripe-js";

/**
 * What a customer-confirmed PaymentIntent means for the person who just paid.
 * A card settles in seconds; a bank debit sits in `processing` for days; and a
 * bank account Stripe couldn't verify instantly waits in `requires_action` until
 * the customer confirms two microdeposits — that one is NOT a failure, and
 * telling them it was invites a second payment by card on top of the debit.
 */
export type PayOutcome = "paid" | "bank_processing" | "verify_microdeposits";

export function payOutcome(intent: PaymentIntent | undefined): PayOutcome | null {
  if (!intent) return null;
  if (intent.status === "succeeded" || intent.status === "requires_capture") return "paid";
  if (intent.status === "processing") {
    return intent.payment_method_types?.includes("us_bank_account") && !intent.payment_method_types.includes("card")
      ? "bank_processing"
      : "paid";
  }
  if (intent.status === "requires_action" && intent.next_action?.type === "verify_with_microdeposits") {
    return "verify_microdeposits";
  }
  return null;
}

export function payOutcomeTitle(outcome: PayOutcome): string {
  return outcome === "verify_microdeposits" ? "Verify your bank account" : "Payment submitted";
}

export function payOutcomeMessage(outcome: PayOutcome, opts: { prepayment?: boolean } = {}): string {
  if (outcome === "verify_microdeposits") {
    return "Your bank couldn't be verified instantly. Stripe will send two small deposits to the account in 1–2 business days, with an email explaining how to confirm them. The payment goes through once you do — please don't pay again another way in the meantime.";
  }
  if (outcome === "bank_processing") {
    return opts.prepayment
      ? "Bank transfers take 3–5 business days to clear. Your prepayment will show on your account once it does, held as credit for your next invoice."
      : "Bank transfers take 3–5 business days to clear. Your balance will update once the payment settles — there's no need to pay again.";
  }
  return opts.prepayment
    ? "Your prepayment will appear on your account in a few seconds. It is held as credit and is applied to your next invoice — it doesn't change any invoice you already have."
    : "Your balance will update in a few seconds.";
}
