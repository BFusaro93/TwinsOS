"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FilterOptionRow } from "@/components/shared/FilterOptionRow";
import { cn } from "@/lib/utils";

export interface FilterTabOption {
  value: string;
  label: string;
}

/**
 * A "Select a Filter" tab that opens a checklist: pick several values at once
 * (OR within the filter, AND with every other filter). Shows "· N" on the tab
 * when active, a search box once the list is long, and a "Clear filter" row.
 */
export function MultiSelectFilterTab({
  label,
  title,
  options,
  selected,
  onChange,
  className,
}: {
  label: string;
  /** Heading inside the popover; defaults to the label. */
  title?: string;
  options: FilterTabOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <Popover onOpenChange={(o) => { if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "rounded px-2 py-0.5 text-xs transition-colors whitespace-nowrap",
            selected.length > 0
              ? "bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-400 font-medium"
              : "hover:bg-muted text-slate-600 dark:text-neutral-400",
            className
          )}
        >
          {label}{selected.length > 0 && ` · ${selected.length}`}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start">
        <p className="px-2 py-1 text-[10px] font-semibold uppercase text-slate-400 dark:text-neutral-500 tracking-wide">{title ?? label}</p>
        {options.length > 8 && (
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="mx-1 mb-1 h-7 w-[calc(100%-0.5rem)] text-xs"
          />
        )}
        {shown.length === 0 && (
          <p className="px-2 py-2 text-xs text-slate-400 dark:text-neutral-500 italic">None found</p>
        )}
        <div className="max-h-[min(24rem,var(--radix-popover-content-available-height,24rem))] overflow-y-auto overscroll-contain">
          {shown.map((o) => (
            <FilterOptionRow
              key={o.value}
              checked={selected.includes(o.value)}
              onToggle={() => toggle(o.value)}
              className={selected.includes(o.value) ? "bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 font-medium" : undefined}
            >
              {o.label}
            </FilterOptionRow>
          ))}
        </div>
        {selected.length > 0 && (
          <div className="border-t mt-1 pt-1">
            <button
              className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-slate-400 dark:text-neutral-500 hover:bg-muted"
              onClick={() => onChange([])}
            >
              <X className="h-3 w-3" /> Clear filter
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
