"use client";

import { useState } from "react";
import { DollarSign } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatCurrency } from "@/lib/utils";
import type { CRMDiscount, DiscountType } from "@/types/crm-discounts";

export interface LineItemDiscountPatch {
  discountCents: number;
  discountType: DiscountType | null;
  discountValue: number | null;
  appliedDiscountId: string | null;
}

interface Props {
  /** Currently saved discount, in cents. */
  discountCents: number;
  discountType: DiscountType | null;
  discountValue: number | null;
  appliedDiscountId: string | null;
  /** This line's gross total (qty × rate), in cents — used to resolve a percent entry to cents. */
  lineTotalCents: number;
  /** Active saved discount presets, for reporting-consistent type tracking. */
  discounts: CRMDiscount[];
  onSave: (patch: LineItemDiscountPatch) => void;
}

export function LineItemDiscountPopover({
  discountCents, discountType, discountValue, appliedDiscountId, lineTotalCents, discounts, onSave,
}: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DiscountType>("flat");
  const [value, setValue] = useState("");

  function handleOpen(o: boolean) {
    if (o) {
      // Redisplay the draft from whatever mode/value produced the saved amount —
      // falls back to flat-dollar display for legacy rows with no stored type.
      const resolvedType = discountType ?? "flat";
      setMode(resolvedType);
      setValue(
        discountCents > 0
          ? resolvedType === "percent"
            ? ((discountValue ?? 0) / 100).toFixed(2)
            : (discountCents / 100).toFixed(2)
          : ""
      );
    }
    setOpen(o);
  }

  function handleApply() {
    const num = parseFloat(value) || 0;
    const cents = mode === "percent"
      ? Math.round(lineTotalCents * (num / 100))
      : Math.round(num * 100);
    const clamped = Math.max(0, Math.min(cents, lineTotalCents));
    onSave({
      discountCents: clamped,
      discountType: mode,
      discountValue: mode === "percent" ? Math.round(num * 100) : clamped,
      appliedDiscountId: null,
    });
    setOpen(false);
  }

  function handleApplyPreset(discountId: string) {
    const d = discounts.find((item) => item.id === discountId);
    if (!d) return;
    const cents = d.discountType === "percent"
      ? Math.round(lineTotalCents * ((d.percentBps ?? 0) / 10000))
      : (d.flatCents ?? 0);
    const clamped = Math.max(0, Math.min(cents, lineTotalCents));
    onSave({
      discountCents: clamped,
      discountType: d.discountType,
      discountValue: d.discountType === "percent" ? (d.percentBps ?? 0) : (d.flatCents ?? 0),
      appliedDiscountId: d.id,
    });
    setOpen(false);
  }

  function handleClear() {
    onSave({ discountCents: 0, discountType: null, discountValue: null, appliedDiscountId: null });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex h-6 w-6 items-center justify-center rounded hover:bg-slate-100"
          title={discountCents > 0 ? `Discount applied: $${(discountCents / 100).toFixed(2)}` : "Add a discount to this line"}
        >
          <DollarSign className={cn("h-3.5 w-3.5", discountCents > 0 ? "text-green-600" : "text-slate-400")} />
          {discountCents > 0 && (
            <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-green-500" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" side="bottom" align="end">
        <p className="mb-2 text-xs font-semibold text-slate-600">Line item discount</p>
        <div className="flex gap-1 mb-2">
          <button
            type="button"
            onClick={() => setMode("flat")}
            className={cn(
              "flex-1 rounded px-2 py-1 text-xs font-medium border transition-colors",
              mode === "flat" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-500 hover:border-slate-300"
            )}
          >
            $ Flat
          </button>
          <button
            type="button"
            onClick={() => setMode("percent")}
            className={cn(
              "flex-1 rounded px-2 py-1 text-xs font-medium border transition-colors",
              mode === "percent" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-500 hover:border-slate-300"
            )}
          >
            % Percent
          </button>
        </div>
        <div className="flex items-center gap-1.5 mb-1">
          <Label className="sr-only">Discount value</Label>
          <span className="text-xs text-slate-400">{mode === "flat" ? "$" : "%"}</span>
          <input
            autoFocus
            type="number"
            min="0"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleApply(); }}
            className="w-full rounded border border-slate-200 px-1.5 py-1 text-right text-xs focus:border-brand-400 focus:outline-none"
          />
        </div>
        <p className="mb-2 text-[10px] text-slate-400">
          on this line&rsquo;s ${(lineTotalCents / 100).toFixed(2)}
        </p>
        {discounts.length > 0 && (
          <Select value={appliedDiscountId ?? undefined} onValueChange={handleApplyPreset}>
            <SelectTrigger className="mb-2 h-7 text-xs">
              <SelectValue placeholder="Apply a saved discount…" />
            </SelectTrigger>
            <SelectContent>
              {discounts.map((d) => (
                <SelectItem key={d.id} value={d.id} className="text-xs">
                  {d.name} — {d.discountType === "percent"
                    ? `${((d.percentBps ?? 0) / 100).toFixed(2)}%`
                    : formatCurrency(d.flatCents ?? 0)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex justify-end gap-1.5">
          {discountCents > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleClear}>Clear</Button>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" className="h-7 text-xs" onClick={handleApply}>Apply</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
