"use client";

import { useState } from "react";
import { Gauge } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface Props {
  complexityBps: number;
  onSave: (complexityBps: number) => void;
}

// Drag-to-adjust range: 50%-200%, matching Aspire's complexity slider. 10000
// bps (100%) is "standard" — the midpoint isn't 100% here, so the track
// itself isn't centered, but the readout makes the direction obvious.
const MIN_PCT = 50;
const MAX_PCT = 200;

export function LineItemComplexityPopover({ complexityBps, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [draftPct, setDraftPct] = useState(complexityBps / 100);

  function handleOpen(o: boolean) {
    if (o) setDraftPct(complexityBps / 100);
    setOpen(o);
  }

  function handleApply() {
    onSave(Math.round(draftPct * 100));
    setOpen(false);
  }

  const isAdjusted = complexityBps !== 10000;

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex h-6 w-6 items-center justify-center rounded hover:bg-slate-100"
          title="Complexity adjustment"
        >
          <Gauge className="h-3.5 w-3.5 text-slate-400" />
          {isAdjusted && (
            <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-brand-500" />
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
