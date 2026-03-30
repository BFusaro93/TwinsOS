"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { SearchInput } from "./SearchInput";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterConfig {
  key: string;
  placeholder: string;
  options: FilterOption[];
  /** When true, renders a checkbox dropdown allowing multiple selections */
  multi?: boolean;
}

interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  filters: FilterConfig[];
  filterValues: Record<string, string | string[]>;
  onFilterChange: (key: string, value: string | string[]) => void;
  searchPlaceholder?: string;
  className?: string;
}

// ── Multi-select checkbox dropdown ───────────────────────────────────────────

function MultiSelectFilter({
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
    // Wrapper div so the clear button can sit outside the Radix trigger
    <div className="relative flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-9 w-[160px] justify-between gap-1 font-normal",
              hasActive && "border-brand-400 text-brand-700",
              // Extra right padding so text doesn't overlap the clear button
              hasActive && "pr-8"
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

        <DropdownMenuContent align="start" className="w-52">
          {filter.options.map((opt) => {
            const checked = values.includes(opt.value);
            return (
              <DropdownMenuItem
                key={opt.value}
                // Prevent the dropdown from closing when an item is selected
                onSelect={(e) => {
                  e.preventDefault();
                  toggle(opt.value);
                }}
                className="flex cursor-pointer items-center gap-2.5"
              >
                {/* Visible square checkbox */}
                <div
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    checked
                      ? "border-brand-500 bg-brand-500"
                      : "border-slate-300 bg-white"
                  )}
                >
                  {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </div>
                <span>{opt.label}</span>
              </DropdownMenuItem>
            );
          })}

          {/* Clear all footer — only shown when at least one is selected */}
          {hasActive && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  onChange([]);
                }}
                className="cursor-pointer justify-center text-xs text-slate-500 hover:text-slate-700"
              >
                Clear all
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Clear button sits OUTSIDE the Radix trigger so it gets its own click handler */}
      {hasActive && (
        <button
          type="button"
          aria-label="Clear filter"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-brand-600 opacity-60 hover:opacity-100"
          onClick={() => onChange([])}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ── FilterBar ─────────────────────────────────────────────────────────────────

export function FilterBar({
  search,
  onSearchChange,
  filters,
  filterValues,
  onFilterChange,
  searchPlaceholder,
  className,
}: FilterBarProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <SearchInput
        value={search}
        onChange={onSearchChange}
        placeholder={searchPlaceholder}
        className="min-w-[160px] flex-1"
      />
      {filters.map((filter) => {
        if (filter.multi) {
          const vals = filterValues[filter.key];
          const arrayVals = Array.isArray(vals) ? vals : [];
          return (
            <MultiSelectFilter
              key={filter.key}
              filter={filter}
              values={arrayVals}
              onChange={(v) => onFilterChange(filter.key, v)}
            />
          );
        }

        // Single-select (legacy)
        const singleVal =
          typeof filterValues[filter.key] === "string"
            ? (filterValues[filter.key] as string)
            : "all";
        return (
          <Select
            key={filter.key}
            value={singleVal || "all"}
            onValueChange={(value) => onFilterChange(filter.key, value)}
          >
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue placeholder={filter.placeholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{filter.placeholder}</SelectItem>
              {filter.options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      })}
    </div>
  );
}
