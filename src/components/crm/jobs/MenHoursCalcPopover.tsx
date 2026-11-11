"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  /** Current TOTAL budgeted hours (whole crew, per visit). */
  totalHours: number;
  /** Current crew size — prefills Men. */
  men: number;
  onApply: (patch: { totalHours: number; men: number }) => void;
}

/**
 * Men × Hrs:Min = total helper, the same calculator the estimate B.Hrs box has (minus the cost
 * half). Applying sets the job line's total budget AND its crew size, so "2 men × 1:30" lands as
 * 3.00 total hrs with a crew of 2.
 */
export function MenHoursCalcPopover({ totalHours, men: currentMen, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [men, setMen] = useState(Math.max(1, currentMen));
  const [hrs, setHrs] = useState(0);
  const [min, setMin] = useState(0);

  const total = men * (hrs + min / 60);

  function handleOpen(o: boolean) {
    if (o) {
      const m = Math.max(1, currentMen);
      const each = totalHours / m;
      setMen(m);
      setHrs(Math.floor(each));
      setMin(Math.round((each % 1) * 60));
    }
    setOpen(o);
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-300 dark:text-neutral-500 hover:bg-muted hover:text-muted-foreground"
          title="Crew hours calculator"
        >
          <Calculator className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-3" side="bottom" align="start">
        <div className="mb-3 grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-end gap-1 text-xs">
          <div>
            <label className="mb-1 block text-[10px] text-muted-foreground">Men</label>
            <Input type="number" min={1} step={1} value={men} onChange={(e) => setMen(Math.max(0, Math.floor(Number(e.target.value))))} className="h-7 text-xs" />
          </div>
          <span className="pb-1.5">×</span>
          <div>
            <label className="mb-1 block text-[10px] text-muted-foreground">Hrs</label>
            <Input type="number" min={0} value={hrs} onChange={(e) => setHrs(Number(e.target.value))} className="h-7 text-xs" />
          </div>
          <span className="pb-1.5">:</span>
          <div>
            <label className="mb-1 block text-[10px] text-muted-foreground">Min</label>
            <Input type="number" min={0} max={59} value={min} onChange={(e) => setMin(Number(e.target.value))} className="h-7 text-xs" />
          </div>
          <span className="pb-1.5">=</span>
          <div>
            <label className="mb-1 block text-[10px] text-muted-foreground">B.Hrs</label>
            <div className="flex h-7 items-center rounded-md border bg-muted/40 px-2 text-xs font-medium">{total.toFixed(2)}</div>
          </div>
        </div>
        <p className="mb-3 text-[11px] text-slate-500 dark:text-neutral-400">
          Each person works Hrs:Min; B.Hrs is the whole crew&apos;s total for one visit.
        </p>
        <div className="flex justify-end gap-2 border-t pt-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            size="sm"
            disabled={men < 1 || total <= 0}
            onClick={() => { onApply({ totalHours: total, men }); setOpen(false); }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
