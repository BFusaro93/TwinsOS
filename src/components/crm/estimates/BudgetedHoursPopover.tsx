"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { bpsToPercent, centsToDisplay, complexityFactor, lineVisits } from "@/lib/estimate-calc";

export interface BudgetedHoursPatch {
  budgetedHours: number;
  /** Set to 0 when the cost should follow hours × a labor rate (see below). */
  costCents?: number;
  /** "Adjust Cost" / "Adjust B.Hrs" cost the line at exactly the man-hour rate
   *  typed here: the line keeps that rate (labor_cost_rate_cents) and its cost
   *  is hours × rate. It used to be squeezed into a whole-cent per-UNIT cost,
   *  which on a 12,000 sq ft line rounded $134.28 down to $120.00. */
  laborCostRateCents?: number | null;
}

interface Props {
  /** Current per-occurrence budgeted hours (row.budgetedHours). */
  budgetedHours: number;
  visits: number;
  /** The line's complexity adjustment (10000 = 100%). `budgetedHours` above is
   *  the UNSCALED base (estimate-calc.ts keeps the stored value pure), but
   *  `totalCostCents` below is already scaled by it — so the two have to be put
   *  back on the same footing before any $/man-hour arithmetic here is honest. */
  complexityBps: number;
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

function occurrenceCostCents(totalCostCents: number, visits: number): number {
  // Mirrors computeLineItem: a line's cost covers all of its visits for both
  // calc types (a multi-visit fixed line is the same work repeated), so one
  // occurrence is the total ÷ visits.
  return totalCostCents / lineVisits(visits);
}

export function BudgetedHoursPopover({
  budgetedHours,
  visits,
  complexityBps,
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

  const factor = complexityFactor(complexityBps);
  const isComplexityAdjusted = factor !== 1;
  // Everything in this popover works in BASE terms — base hours (what the
  // B.Hrs box holds and what actually gets stored) against base cost. The
  // row's totalCostCents has already been scaled by complexity, so it's
  // divided back out here; the alternative, dividing a scaled cost by unscaled
  // hours, reported a $/man-hour inflated by exactly the complexity factor and
  // made "adjust to $69.25/man-hr" land at $66.67 on a 115% line.
  //
  // Both sides carry the same factor, so it cancels: base cost ÷ base hours is
  // the same $/man-hour as scaled cost ÷ scaled hours. Anything written back
  // out is therefore already in the base units the row stores.
  const occCostCents = occurrenceCostCents(totalCostCents, visits) / factor;
  const currentRateCentsPerHr = hoursDraft > 0 ? occCostCents / hoursDraft : 0;
  const targetRateCents = Math.round((parseFloat(targetRate) || 0) * 100);
  // Each link needs something to work from; with nothing to solve for they
  // used to do nothing at all when clicked (B.Hrs 0, or a $0 cost), which read
  // as broken. Disable them instead and say what's missing.
  const canAdjustCost = hoursDraft > 0 && targetRateCents > 0;
  const canAdjustHours = targetRateCents > 0 && occCostCents > 0;
  const adjustHint =
    targetRateCents <= 0
      ? "Enter a man-hour rate to use these."
      : !canAdjustCost && !canAdjustHours
        ? "Enter Men × Hrs to set the cost from this rate, or give the line a cost to work out its hours."
        : !canAdjustCost
          ? "Enter Men × Hrs to set the cost from this rate."
          : !canAdjustHours
            ? "Adjust B.Hrs needs the line to have a cost."
            : null;

  // Cost = hours × the typed rate, kept exactly: the line stores the RATE
  // (labor_cost_rate_cents) with cost_cents 0, and computeLineItem costs it as
  // complexity-scaled hours × rate × visits. Setting a per-unit cost instead
  // rounds to whole cents per unit (1¢/sq ft on 12,000 sq ft = $120 for a
  // $134.28 target). qty / calcType no longer matter here for that reason.
  function handleAdjustCost() {
    if (hoursDraft <= 0 || targetRateCents <= 0) return;
    onApply({ budgetedHours: hoursDraft, costCents: 0, laborCostRateCents: targetRateCents });
    setOpen(false);
  }

  function handleAdjustHours() {
    if (targetRateCents <= 0) return;
    const newHours = occCostCents / targetRateCents;
    if (newHours <= 0) return;
    const patch: BudgetedHoursPatch = { budgetedHours: newHours };
    // If cost is still auto-derived (hours × the break-even or line rate),
    // changing the hours alone would re-derive cost from the SAME rate and
    // land back at the old ratio. Pin the line's rate to the target instead:
    // newHours × target = the current cost, so the cost holds and the target
    // man-hour rate is exactly what the line now shows.
    if (isAutoCost) {
      patch.costCents = 0;
      patch.laborCostRateCents = targetRateCents;
    }
    onApply(patch);
    setOpen(false);
  }

  function handleApplyHoursOnly() {
    // Zero hours zeroes the line's modelled cost, which reads as GM 100% — a
    // number nobody would bid on purpose. It was reachable by accident: the
    // Men box empties to "" while you retype it, Number("") is 0, and
    // hoursDraft followed it to 0 with nothing stopping Apply. The button is
    // disabled in that state too; this guard is the backstop.
    if (hoursDraft <= 0) return;
    onApply({ budgetedHours: hoursDraft });
    setOpen(false);
  }

  if (disabled) return null;

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-5 w-5 items-center justify-center rounded text-slate-300 dark:text-neutral-500 hover:bg-muted hover:text-muted-foreground"
          title="Man-hour rate calculator"
        >
          <Calculator className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-3" side="bottom" align="start">
        <div className="mb-3 grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-end gap-1 text-xs">
          <div>
            <label className="mb-1 block text-[10px] text-muted-foreground">Men</label>
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
            <label className="mb-1 block text-[10px] text-muted-foreground">Hrs</label>
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
            <label className="mb-1 block text-[10px] text-muted-foreground">Min</label>
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
            <label className="mb-1 block text-[10px] text-muted-foreground">B.Hrs</label>
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

        <div className="mb-3 rounded bg-slate-50 dark:bg-muted/40 px-2 py-1.5 text-[11px] text-slate-600 dark:text-neutral-400">
          Cost ({centsToDisplay(occCostCents)}) ÷ B.Hrs ({hoursDraft.toFixed(2)}) ={" "}
          <span className="font-medium text-slate-800 dark:text-neutral-100">{centsToDisplay(currentRateCentsPerHr)}/man-hr</span>
          {isComplexityAdjusted && (
            <span className="mt-1 block text-[10px] text-slate-400 dark:text-neutral-500">
              Before this line&apos;s {bpsToPercent(complexityBps)} complexity — it scales hours and cost
              together, so the rate per man-hour is unchanged.
            </span>
          )}
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-[10px] text-muted-foreground">To achieve a man-hr rate of</label>
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-400 dark:text-neutral-500">$</span>
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
            <button
              type="button"
              onClick={handleAdjustCost}
              disabled={!canAdjustCost}
              title="Set this line's cost to B.Hrs × the rate above, and save it"
              className="text-brand-600 dark:text-brand-400 underline hover:text-brand-700 dark:hover:text-brand-400 disabled:cursor-not-allowed disabled:text-slate-400 dark:disabled:text-neutral-500 disabled:no-underline"
            >
              Adjust Cost
            </button>
            <button
              type="button"
              onClick={handleAdjustHours}
              disabled={!canAdjustHours}
              title="Set this line's B.Hrs to its cost ÷ the rate above, and save it"
              className="text-brand-600 dark:text-brand-400 underline hover:text-brand-700 dark:hover:text-brand-400 disabled:cursor-not-allowed disabled:text-slate-400 dark:disabled:text-neutral-500 disabled:no-underline"
            >
              Adjust B.Hrs
            </button>
          </div>
          {adjustHint && <p className="mt-1 text-[10px] text-slate-400 dark:text-neutral-500">{adjustHint}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t pt-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={handleApplyHoursOnly} disabled={hoursDraft <= 0}>Apply</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
