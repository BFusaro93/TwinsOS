"use client";

import { useState } from "react";
import { DollarSign } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, formatCurrency } from "@/lib/utils";
import type { CRMDiscount, DiscountType } from "@/types/crm-discounts";

/** A discount to put on every visit of a package. `null` clears the visits' discounts. */
export interface PackageDiscountInput {
  type: DiscountType;
  /** percent: basis points (10% = 1000). flat: cents taken off EACH visit. */
  value: number;
  appliedDiscountId: string | null;
}

/**
 * Bulk discount for a package's visits: one entry (a percent, a flat amount per visit, or a
 * saved discount) that is applied to every visit line, instead of editing each line's
 * discount. A percent is taken off each visit's own total.
 */
export function PackageDiscountPopover({
  discounts,
  visitCount,
  onApply,
}: {
  discounts: CRMDiscount[];
  visitCount: number;
  onApply: (input: PackageDiscountInput | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DiscountType>("percent");
  const [value, setValue] = useState("");

  function apply() {
    const num = parseFloat(value) || 0;
    if (num <= 0) return;
    onApply({ type: mode, value: mode === "percent" ? Math.round(num * 100) : Math.round(num * 100), appliedDiscountId: null });
    setOpen(false);
  }

  function applyPreset(id: string) {
    const d = discounts.find((x) => x.id === id);
    if (!d) return;
    onApply({
      type: d.discountType,
      value: d.discountType === "percent" ? (d.percentBps ?? 0) : (d.flatCents ?? 0),
      appliedDiscountId: d.id,
    });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-neutral-600 px-1.5 py-0.5 hover:border-brand-400 hover:text-foreground"
          title="Put the same discount on every visit of this package"
        >
          <DollarSign className="h-3 w-3" /> Discount all visits
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-3" side="bottom" align="start">
        <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-neutral-400">
          Discount all {visitCount} visit{visitCount === 1 ? "" : "s"}
        </p>
        <div className="mb-2 flex gap-1">
          {([["percent", "% Percent"], ["flat", "$ Per visit"]] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "flex-1 rounded border px-2 py-1 text-xs font-medium transition-colors",
                mode === m
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400"
                  : "border-border text-muted-foreground hover:border-slate-300 dark:hover:border-neutral-700",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mb-2 flex items-center gap-1.5">
          <span className="text-xs text-slate-400 dark:text-neutral-500">{mode === "flat" ? "$" : "%"}</span>
          <input
            autoFocus
            type="number"
            min="0"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
            className="w-full rounded border border-border px-1.5 py-1 text-right text-xs focus:border-brand-400 focus:outline-none"
          />
        </div>
        {discounts.length > 0 && (
          <Select onValueChange={applyPreset}>
            <SelectTrigger className="mb-2 h-7 text-xs">
              <SelectValue placeholder="Apply a saved discount…" />
            </SelectTrigger>
            <SelectContent>
              {discounts.map((d) => (
                <SelectItem key={d.id} value={d.id} className="text-xs">
                  {d.name} — {d.discountType === "percent" ? `${((d.percentBps ?? 0) / 100).toFixed(2)}%` : formatCurrency(d.flatCents ?? 0)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="mb-2 text-[10px] text-slate-400 dark:text-neutral-500">
          Replaces any discount already on these visits. Visits already on a job are skipped.
        </p>
        <div className="flex justify-end gap-1.5">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { onApply(null); setOpen(false); }}>
            Clear all
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={apply} disabled={!(parseFloat(value) > 0)}>Apply</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
