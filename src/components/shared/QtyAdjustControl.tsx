"use client";

import { useState } from "react";
import { Minus, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface QtyAdjustControlProps {
  value: number;
  onChange: (newQty: number) => void;
}

export function QtyAdjustControl({ value, onChange }: QtyAdjustControlProps) {
  const [inputVal, setInputVal] = useState(String(value));
  const [saved, setSaved] = useState(false);

  const parsed = parseInt(inputVal, 10);
  const isDirty = !isNaN(parsed) && parsed !== value;

  function apply(next: number) {
    const clamped = Math.max(0, next);
    setInputVal(String(clamped));
    onChange(clamped);
    flash();
  }

  function flash() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function handleSave() {
    if (!isNaN(parsed)) apply(parsed);
  }

  return (
    <div className="mt-3 flex items-center gap-2 border-t border-black/5 pt-3">
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={() => apply(value - 1)}
      >
        <Minus className="h-3 w-3" />
      </Button>

      <Input
        type="number"
        min={0}
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onBlur={() => {
          if (!isNaN(parsed) && parsed !== value) handleSave();
        }}
        className="h-7 w-16 text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />

      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={() => apply(value + 1)}
      >
        <Plus className="h-3 w-3" />
      </Button>

      <span
        className={cn(
          "ml-1 flex items-center gap-1 text-xs font-medium transition-opacity duration-300",
          saved ? "text-green-600 opacity-100" : "text-slate-400 opacity-0"
        )}
      >
        <Check className="h-3 w-3" />
        Saved
      </span>

      {isDirty && !saved && (
        <Button size="sm" className="ml-auto h-7 text-xs" onClick={handleSave}>
          Save
        </Button>
      )}
    </div>
  );
}
