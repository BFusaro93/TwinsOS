import { useMemo } from "react";
import { useOrgList } from "@/lib/hooks/use-org-lists";

/**
 * Built-in payment methods. These are fixed: crm_payments.method is CHECK-constrained to them, Stripe
 * writes the card variants, and reports key off them. They show in settings read-only. "Account Credit"
 * is set automatically when issuing a credit and is not listed here.
 */
export const BUILT_IN_PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "Check", label: "Check" },
  { value: "Cash", label: "Cash" },
  { value: "Credit Card- Visa", label: "Credit Card (Visa)" },
  { value: "Credit Card- MasterCard", label: "Credit Card (MC)" },
  { value: "Credit Card- AmEx", label: "Credit Card (AmEx)" },
  { value: "Credit Card- Discover", label: "Credit Card (Discover)" },
  { value: "Debit Card- Visa", label: "Debit Card (Visa)" },
  { value: "Debit Card- MasterCard", label: "Debit Card (MC)" },
  { value: "Debit Card- Discover", label: "Debit Card (Discover)" },
  { value: "ACH/E-Check", label: "ACH / E-Check" },
  { value: "AutoPay", label: "AutoPay" },
  { value: "Other", label: "Other" },
  { value: "AR Write-off", label: "AR Write-off (non-cash)" },
];

const RESERVED = new Set([...BUILT_IN_PAYMENT_METHODS.map((m) => m.value.toLowerCase()), "account credit"]);

/** True when `name` collides with a built-in method (case-insensitive), so it can't be a custom one. */
export function isReservedPaymentMethodName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return RESERVED.has(n) || BUILT_IN_PAYMENT_METHODS.some((m) => m.label.toLowerCase() === n);
}

export const CUSTOM_METHOD_LABEL_MAX = 60;

/**
 * Splits what the picker holds into what crm_payments stores. A built-in value is stored as-is;
 * anything else is one of the org's custom methods, stored as "Other" with the name as the label.
 */
export function toStoredPaymentMethod(selected: string): { method: string; methodLabel: string | null } {
  if (BUILT_IN_PAYMENT_METHODS.some((m) => m.value === selected) || selected === "Account Credit") {
    return { method: selected, methodLabel: null };
  }
  return { method: "Other", methodLabel: selected };
}

/** Inverse of toStoredPaymentMethod: the picker value for a saved payment. */
export function selectedPaymentMethod(method: string, methodLabel: string | null | undefined): string {
  return method === "Other" && methodLabel ? methodLabel : method;
}

/** What to show for a saved payment: the custom name when there is one, else the method. */
export function paymentMethodDisplay(method: string, methodLabel: string | null | undefined): string {
  return method === "Other" && methodLabel ? methodLabel : method;
}

/** The org's custom payment methods (names), A–Z. */
export function useCustomPaymentMethods(): string[] {
  const { data } = useOrgList("payment_methods");
  return useMemo(
    () =>
      (data ?? [])
        .map((o) => o.value)
        .filter((v) => !isReservedPaymentMethodName(v))
        .sort((a, b) => a.localeCompare(b)),
    [data],
  );
}
