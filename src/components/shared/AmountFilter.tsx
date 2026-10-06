"use client";

import { Input } from "@/components/ui/input";
import { encodeAmountFilter, parseAmountFilter, type AmountOp } from "@/lib/utils/column-filters";

interface AmountFilterProps {
  /** Encoded by encodeAmountFilter — see lib/utils/column-filters. */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  autoFocus?: boolean;
}

export function AmountFilter({ value, onChange, label = "Amount", autoFocus = true }: AmountFilterProps) {
  const { op, dollars } = parseAmountFilter(value);
  return (
    <div className="ml-2 flex items-center gap-1 text-xs text-muted-foreground">
      <select
        value={op}
        onChange={(e) => onChange(encodeAmountFilter(e.target.value as AmountOp, dollars))}
        aria-label={`${label} comparison`}
        className="h-6 rounded-md border border-input bg-background px-1 text-xs"
      >
        <option value=">=">At least</option>
        <option value="<=">At most</option>
        <option value="=">Exactly</option>
      </select>
      <span>$</span>
      <Input
        autoFocus={autoFocus}
        type="number"
        min="0"
        step="0.01"
        value={dollars}
        onChange={(e) => onChange(encodeAmountFilter(op, e.target.value))}
        aria-label={`${label} amount`}
        className="h-6 w-28 text-xs"
      />
    </div>
  );
}
