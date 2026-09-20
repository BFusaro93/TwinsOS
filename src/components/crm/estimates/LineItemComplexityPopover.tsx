"use client";

import { useState } from "react";
import { Gauge } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { COMPLEXITY_BPS_DEFAULT, COMPLEXITY_BPS_MAX, COMPLEXITY_BPS_MIN, clampComplexityBps } from "@/lib/estimate-calc";

interface Props {
  complexityBps: number;
  onSave: (complexityBps: number) => void;
}

// Drag-to-adjust range: 50%-200%, matching Aspire's complexity slider. 10000
// bps (100%) is "standard" — the midpoint isn't 100% here, so the track
// itself isn't centered, but the readout makes the direction obvious. The
// bounds come from estimate-calc.ts so the slider, the app-side clamp on
// write and the clamp the pricing engine applies on read can't drift apart.
const MIN_PCT = COMPLEXITY_BPS_MIN / 100;
const MAX_PCT = COMPLEXITY_BPS_MAX / 100;

export function LineItemComplexityPopover({ complexityBps, onSave }: Props) {
  const [open, setOpen] = useState(false);
  // Seed from the CLAMPED stored value. Nothing in the database bounds
  // complexity_bps, so a row written by an API caller or an older build could
  // hold 0 or a negative — and the popover used to load that straight into the
  // slider and write it back out untouched on the next Apply, laundering an
  // out-of-range value through the UI as if it were legitimate.
  const [draftPct, setDraftPct] = useState(clampComplexityBps(complexityBps) / 100);

  function handleOpen(o: boolean) {
    if (o) setDraftPct(clampComplexityBps(complexityBps) / 100);
    setOpen(o);
  }

  function handleApply() {
    // Clamp on the way out too — the range input is the only thing keeping
    // draftPct in bounds, and a clamped value is never 0 or negative, so a
    // line can't be made free (or revenue-negative) from here.
    onSave(clampComplexityBps(Math.round(draftPct * 100)));
    setOpen(false);
  }

  const isAdjusted = clampComplexityBps(complexityBps) !== COMPLEXITY_BPS_DEFAULT;

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          // Visible at rest whenever the line is actually scaled. The whole
          // control used to sit inside the row's `opacity-0
          // group-hover:opacity-100` action group, so a 125% line looked
          // identical to a standard one until you hovered it — and hover
          // doesn't exist on the tablets this board is used on. Unadjusted
          // lines still fade in on hover, so the row is no busier than before.
          className={cn(
            "relative flex h-6 items-center justify-center gap-0.5 rounded px-0.5 transition-opacity hover:bg-slate-100",
            isAdjusted
              ? "text-brand-600"
              : "w-6 text-slate-400 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
          )}
          title={isAdjusted ? `Complexity ${(complexityBps / 100).toFixed(0)}% — scales this line's price and cost` : "Complexity adjustment"}
        >
          <Gauge className="h-3.5 w-3.5" />
          {isAdjusted && (
            <span className="text-[10px] font-medium tabular-nums">{(clampComplexityBps(complexityBps) / 100).toFixed(0)}%</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" side="bottom" align="end">
        <p className="mb-2 text-xs text-slate-500">
          Scales this line&apos;s price and cost together — margin % stays the same.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={MIN_PCT}
            max={MAX_PCT}
            step={5}
            value={draftPct}
            onChange={(e) => setDraftPct(Number(e.target.value))}
            className="flex-1 accent-brand-500"
          />
          <span className="w-12 text-right text-sm font-medium tabular-nums">{draftPct}%</span>
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-slate-400">
          <span>Easier</span>
          <span>Standard</span>
          <span>Harder</span>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={handleApply}>Apply</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
