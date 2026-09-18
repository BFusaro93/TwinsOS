"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { centsToDisplay } from "@/lib/estimate-calc";

export interface BudgetedHoursPatch {
  budgetedHours: number;
  /** Only set when the user chose "Adjust Cost" (or the cost had to be
   *  pinned to keep "Adjust B.Hrs" honest — see handleAdjustHours below). */
  costCents?: number;
}

interface Props {
  /** Current per-occurrence budgeted hours (row.budgetedHours). */
  budgetedHours: number;
  /** Qty and calc type, needed to translate an occurrence dollar cost back
   *  into the per-unit costCents the row actually stores (see estimate-calc.ts). */
  qty: number;
  visits: number;
  calcType: 0 | 1;
  /** Current totalCostCents (already reflects auto-fill-from-breakeven when active). */
  totalCostCents: number;
  /** True while Cost is auto-derived from budgetedHours × the org breakeven
   *  rate (costCents === 0) — see EstimateLineItemsGrid's isAutoCost. */
  isAutoCost: boolean;
  /** Org's configured breakeven labor rate, cents/hr — prefills the target. */
  breakevenRateCents?: number;
  /** Disabled when budgetedHours is itself auto-derived from a production
   *  rate (isAutoHrs) — there's nothing here to solve for in that case. */
  disabled?: boolean;
  onApply: (patch: BudgetedHoursPatch) => void;
}

function occurrenceCostCents(totalCostCents: number, visits: number, calcType: 0 | 1): number {
  // Mirrors computeLineItem: calcType 0 ("$" fixed) never multiplies by
  // visits, so totalCostCents IS the occurrence cost already.
  return calcType === 1 ? totalCostCents / (visits || 1) : totalCostCents;
}

function costCentsFromOccurrence(occurrenceCents: number, qty: number, calcType: 0 | 1): number {
  return calcType === 1 ? occurrenceCents / (qty || 1) : occurrenceCents;
}

export function BudgetedHoursPopover({
  budgetedHours,
  qty,
  visits,
  calcType,
  totalCostCents,
  isAutoCost,
  breakevenRateCents,
  disabled,
  onApply,
}: Props) {
  const [open, setOpen] = useState(false);
  const [men, setMen] = useState(1);
  const [hrs, setHrs] = useState(Math.floor(budgetedHours));
  const [min, setMin] = useState(Math.round((budgetedHours % 1) * 60));
  const [hoursDraft, setHoursDraft] = useState(budgetedHours);
  const [targetRate, setTargetRate] = useState(
    breakevenRateCents ? (breakevenRateCents / 100).toFixed(2) : ""
  );

  function handleOpen(o: boolean) {
    if (o) {
      setMen(1);
      setHrs(Math.floor(budgetedHours));
      setMin(Math.round((budgetedHours % 1) * 60));
      setHoursDraft(budgetedHours);
      setTargetRate(breakevenRateCents ? (breakevenRateCents / 100).toFixed(2) : "");
    }
    setOpen(o);
  }

  function recalcFromMenHours(nextMen: number, nextHrs: number, nextMin: number) {
    setMen(nextMen);
    setHrs(nextHrs);
    setMin(nextMin);
    setHoursDraft(nextMen * (nextHrs + nextMin / 60));
  }

  const occCostCents = occurrenceCostCents(totalCostCents, visits, calcType);
  const currentRateCentsPerHr = hoursDraft > 0 ? occCostCents / hoursDraft : 0;
  const targetRateCents = Math.round((parseFloat(targetRate) || 0) * 100);

  function handleAdjustCost() {
    if (hoursDraft <= 0) return;
    const newOccCostCents = Math.round(targetRateCents * hoursDraft);
    const newCostCents = Math.round(costCentsFromOccurrence(newOccCostCents, qty, calcType));
    onApply({ budgetedHours: hoursDraft, costCents: newCostCents });
    setOpen(false);
  }

  function handleAdjustHours() {
    if (targetRateCents <= 0) return;
    const newHours = occCostCents / targetRateCents;
    const patch: BudgetedHoursPatch = { budgetedHours: newHours };
    // If cost is still auto-derived from budgetedHours × breakeven, changing
    // budgetedHours alone would just re-derive cost from the SAME breakeven
    // rate and land back at the old ratio, not the target typed above — pin
    // cost to its current occurrence value first so the target actually holds.
    if (isAutoCost) {
      patch.costCents = Math.round(costCentsFromOccurrence(occCostCents, qty, calcType));
    }
    onApply(patch);
    setOpen(false);
  }

  function handleApplyHoursOnly() {
    onApply({ budgetedHours: hoursDraft });
    setOpen(false);
  }

  if (disabled) return null;

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-5 w-5 items-center justify-center rounded text-slate-300 hover:bg-slate-100 hover:text-slate-500"
          title="Man-hour rate calculator"
        >
          <Calculator className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-3" side="bottom" align="start">
        <div className="mb-3 grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-end gap-1 text-xs">
          <div>
            <label className="mb-1 block text-[10px] text-slate-500">Men</label>
            <Input
              type="number"
              min={0}
              value={men}
              onChange={(e) => recalcFromMenHours(Number(e.target.value), hrs, min)}
              className="h-7 text-xs"
            />
          </div>
          <span className="pb-1.5">×</span>
          <div>
            <label className="mb-1 block text-[10px] text-slate-500">Hrs</label>
            <Input
              type="number"
              min={0}
              value={hrs}
              onChange={(e) => recalcFromMenHours(men, Number(e.target.value), min)}
              className="h-7 text-xs"
            />
          </div>
          <span className="pb-1.5">:</span>
          <div>
            <label className="mb-1 block text-[10px] text-slate-500">Min</label>
            <Input
              type="number"
              min={0}
              max={59}
              value={min}
              onChange={(e) => recalcFromMenHours(men, hrs, Number(e.target.value))}
              className="h-7 text-xs"
            />
          </div>
          <span className="pb-1.5">=</span>
          <div>
            <label className="mb-1 block text-[10px] text-slate-500">B.Hrs</label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={hoursDraft.toFixed(2)}
              onChange={(e) => setHoursDraft(Number(e.target.value))}
              className="h-7 text-xs font-medium"
            />
          </div>
        </div>

        <div className="mb-3 rounded bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
          Cost ({centsToDisplay(occCostCents)}) ÷ B.Hrs ({hoursDraft.toFixed(2)}) ={" "}
          <span className="font-medium text-slate-800">{centsToDisplay(currentRateCentsPerHr)}/man-hr</span>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-[10px] text-slate-500">To achieve a man-hr rate of</label>
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-400">$</span>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={targetRate}
              onChange={(e) => setTargetRate(e.target.value)}
              className="h-7 text-xs"
            />
          </div>
          <div className="mt-1.5 flex gap-3 text-[11px]">
            <button type="button" onClick={handleAdjustCost} className="text-brand-600 underline hover:text-brand-700">
              Adjust Cost
            </button>
            <button type="button" onClick={handleAdjustHours} className="text-brand-600 underline hover:text-brand-700">
              Adjust B.Hrs
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t pt-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={handleApplyHoursOnly}>Apply</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
