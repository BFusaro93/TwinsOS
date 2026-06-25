"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  selectedCount: number;
  open: boolean;
  onApply: (amount: number, isPercent: boolean) => void;
  onCancel: () => void;
}

function parseInput(raw: string): { amount: number; isPercent: boolean } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const isPercent = trimmed.endsWith("%");
  const numStr = isPercent ? trimmed.slice(0, -1) : trimmed.replace(/^\$/, "");
  const amount = parseFloat(numStr);
  if (isNaN(amount)) return null;
  return { amount, isPercent };
}

export function RateIncreaseDialog({ selectedCount, open, onApply, onCancel }: Props) {
  const [value, setValue] = useState("");
  const parsed = parseInput(value);

  function handleApply() {
    if (!parsed) return;
    onApply(parsed.amount, parsed.isPercent);
    setValue("");
  }

  function handleCancel() {
    setValue("");
    onCancel();
  }

  const preview = parsed
    ? `${parsed.amount > 0 ? "+" : ""}${parsed.amount}${parsed.isPercent ? "%" : " ($/visit)"} to ${selectedCount} line item${selectedCount !== 1 ? "s" : ""}`
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rate Increase / Decrease</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="rate-input">Amount</Label>
            <Input
              id="rate-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 10%  or  $5  or  -5%"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleApply(); }}
            />
            <p className="text-xs text-slate-500">
              End with <code className="font-mono">%</code> for percentage, or enter a dollar amount (positive or negative).
            </p>
          </div>
          {preview && (
            <p className="rounded bg-slate-50 px-3 py-1.5 text-sm text-slate-700">
              Applying: <strong>{preview}</strong>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button disabled={!parsed} onClick={handleApply}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
