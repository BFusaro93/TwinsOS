"use client";

import { Input } from "@/components/ui/input";
import { encodeDateRange, parseDateRange } from "@/lib/utils/column-filters";

interface DateRangeFilterProps {
  /** Encoded by encodeDateRange — see lib/utils/column-filters. */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  autoFocus?: boolean;
}

export function DateRangeFilter({ value, onChange, label = "Date", autoFocus = true }: DateRangeFilterProps) {
  const { from, to } = parseDateRange(value);
  return (
    <div className="ml-2 flex items-center gap-1 text-xs text-muted-foreground">
      <Input
        autoFocus={autoFocus}
        type="date"
        value={from}
        max={to || undefined}
        onChange={(e) => onChange(encodeDateRange(e.target.value, to))}
        aria-label={`${label} from`}
        className="h-6 w-36 text-xs"
      />
      <span>to</span>
      <Input
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => onChange(encodeDateRange(from, e.target.value))}
        aria-label={`${label} to`}
        className="h-6 w-36 text-xs"
      />
    </div>
  );
}
