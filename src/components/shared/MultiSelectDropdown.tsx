"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface Props {
  options: MultiSelectOption[];
  /** Selected values. Empty array means "all" — matches the trigger/condition semantics of "no filter configured". */
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Checkbox multi-select combobox: filter search + check-all/uncheck-all +
 * scrollable checkbox list, trigger button showing "All" / "N selected".
 * Used anywhere a trigger or condition needs to filter against a subset of
 * an enumerable list (services, sources, categories, tags) instead of a
 * single value.
 */
export function MultiSelectDropdown({ options, selected, onChange, placeholder = "All", className }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const filtered = filter.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(filter.trim().toLowerCase()))
    : options;

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  function checkAll() {
    onChange(Array.from(new Set([...selected, ...filtered.map((o) => o.value)])));
  }

  function uncheckAll() {
    const filteredValues = new Set(filtered.map((o) => o.value));
    onChange(selected.filter((v) => !filteredValues.has(v)));
  }

  const label = selected.length === 0 ? placeholder : `${selected.length} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={className ?? "h-9 w-44 shrink-0 justify-between text-sm font-normal"}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter…"
              className="h-8 flex-1 text-xs"
            />
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <button type="button" className="font-medium text-primary hover:underline" onClick={checkAll}>
              Check all
            </button>
            <button type="button" className="font-medium text-primary hover:underline" onClick={uncheckAll}>
              Uncheck all
            </button>
          </div>
          <ScrollArea className="h-48">
            <div className="flex flex-col gap-1 pr-2">
              {filtered.length === 0 && (
                <p className="py-2 text-center text-xs text-slate-400 italic">No matches</p>
              )}
              {filtered.map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-100"
                >
                  <Checkbox checked={selected.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
                  <span className="truncate">{o.label}</span>
                </label>
              ))}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}
