"use client";

import { Check, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { FilterConfig } from "./FilterBar";

// ── Internal multi-select dropdown ───────────────────────────────────────────

function FilterDropdown({
  filter,
  values,
  onChange,
}: {
  filter: FilterConfig;
  values: string[];
  onChange: (vals: string[]) => void;
}) {
  function toggle(val: string) {
    onChange(
      values.includes(val) ? values.filter((v) => v !== val) : [...values, val]
    );
  }

  const hasActive = values.length > 0;
  const activeLabel =
    values.length === 0
      ? null
      : values.length === 1
      ? (filter.options.find((o) => o.value === values[0])?.label ?? "1 selected")
      : `${values.length} selected`;

  return (
    <div className="relative flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-9 w-full justify-between gap-1 font-normal",
              hasActive && "border-brand-400 text-brand-700 pr-8"
            )}
          >
            <span className="truncate text-sm">
              {activeLabel ?? filter.placeholder}
            </span>
            {!hasActive && (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {filter.options.map((opt) => {
            const checked = values.includes(opt.value);
            return (
              <DropdownMenuItem
                key={opt.value}
                onSelect={(e) => { e.preventDefault(); toggle(opt.value); }}
                className="flex cursor-pointer items-center gap-2.5"
              >
                <div className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                  checked ? "border-brand-500 bg-brand-500" : "border-slate-300 bg-white"
                )}>
                  {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </div>
                <span>{opt.label}</span>
              </DropdownMenuItem>
            );
          })}
          {hasActive && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => { e.preventDefault(); onChange([]); }}
                className="cursor-pointer justify-center text-xs text-slate-500 hover:text-slate-700"
              >
                Clear
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {hasActive && (
        <button
          type="button"
          aria-label="Clear filter"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-brand-600 opacity-70 hover:opacity-100"
          onClick={() => onChange([])}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ── AdvancedSearchDialog ──────────────────────────────────────────────────────

interface AdvancedSearchDialogProps {
  /** Filter configurations — options are derived from live data in the parent */
  filters: FilterConfig[];
  filterValues: Record<string, string | string[]>;
  onFilterChange: (key: string, value: string[]) => void;
  /** Total count of active filter groups (for the badge) */
  activeCount: number;
}

export function AdvancedSearchDialog({
  filters,
  filterValues,
  onFilterChange,
  activeCount,
}: AdvancedSearchDialogProps) {
  function clearAll() {
    filters.forEach((f) => onFilterChange(f.key, []));
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-1.5 shrink-0",
            activeCount > 0 && "border-brand-400 text-brand-700"
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {activeCount > 0 && (
            <span className="ml-0.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-xs font-medium leading-none text-brand-700">
              {activeCount}
            </span>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-slate-400" />
            Search Filters
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2 flex flex-col gap-4">
          {/* Filter grid — 2 columns */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {filters.map((filter) => {
              const vals = filterValues[filter.key];
              const arrayVals = Array.isArray(vals) ? vals : [];
              return (
                <div key={filter.key} className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">
                    {filter.placeholder.replace(/^All /, "")}
                  </label>
                  <FilterDropdown
                    filter={filter}
                    values={arrayVals}
                    onChange={(v) => onFilterChange(filter.key, v)}
                  />
                </div>
              );
            })}
          </div>

          {/* Active filter summary */}
          {activeCount > 0 && (
            <div className="flex items-center justify-between rounded-md border border-brand-100 bg-brand-50 px-3 py-2">
              <p className="text-xs text-brand-700">
                {activeCount} filter group{activeCount !== 1 ? "s" : ""} active — results are narrowed
              </p>
              <button
                type="button"
                onClick={clearAll}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
