"use client";

import { cn } from "@/lib/utils";

interface SegmentedControlProps<T extends string | number> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
}

/** A small single-choice button group (period pickers, entry-mode toggles). */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
}: SegmentedControlProps<T>) {
  return (
    <div className="inline-flex w-fit max-w-full flex-wrap rounded-md border border-border bg-slate-50 dark:bg-muted/40 p-0.5" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded font-medium transition-colors",
            size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
            value === o.value ? "bg-card text-slate-900 dark:text-neutral-100 shadow-sm" : "text-muted-foreground hover:text-slate-700 dark:hover:text-neutral-300"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
