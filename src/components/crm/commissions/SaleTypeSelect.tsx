"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type SaleTypeValue = "new" | "renewal" | null;

const UNSET = "unset";

/**
 * New vs renewal, set by the office: only they know that a one-time job for an
 * existing customer is still paid as a new sale. Unset reads as "new", and an
 * invoice falls back to its job, contract, then estimate before that.
 */
export function SaleTypeSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: SaleTypeValue;
  onChange: (v: SaleTypeValue) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select
      value={value ?? UNSET}
      onValueChange={(v) => onChange(v === UNSET ? null : (v as "new" | "renewal"))}
      disabled={disabled}
    >
      <SelectTrigger className={className ?? "h-8"}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={UNSET}>Default (new sale)</SelectItem>
        <SelectItem value="new">New sale</SelectItem>
        <SelectItem value="renewal">Renewal / existing account</SelectItem>
      </SelectContent>
    </Select>
  );
}
