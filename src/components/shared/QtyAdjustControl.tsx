"use client";

import { useState } from "react";
import { Minus, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** See PartAdjustmentKind (use-parts.ts): a shelf count settles work-order shortfalls. */
export type QtyAdjustKind = "count" | "correction";

const KIND_OPTIONS: { value: QtyAdjustKind; label: string; hint: string }[] = [
  {
    value: "count",
    label: "Shelf count",
    hint: "You counted what's on the shelf. Parts used on work orders while this was out of stock are treated as already taken, so the next delivery won't deduct them again.",
  },
  {
    value: "correction",
    label: "Found / correction",
    hint: "Found extra stock or fixing a mistake. Parts still owed to work orders are deducted when the next delivery is received.",
  },
];

interface QtyAdjustControlProps {
  value: number;
  onChange: (newQty: number, reason: string, kind: QtyAdjustKind) => Promise<void>;
  /** Ask whether the change is a shelf count or a correction (parts only). */
  askKind?: boolean;
}

export function QtyAdjustControl({ value, onChange, askKind = false }: QtyAdjustControlProps) {
  const [inputVal, setInputVal] = useState(String(value));
  // The control is reused across records without remounting (the part detail
  // sheet keeps it mounted between opens), so re-seed the box whenever the
  // incoming value changes instead of leaving the previous record's number in it.
  const [lastValue, setLastValue] = useState(value);
  const [saved, setSaved] = useState(false);
  const [pendingQty, setPendingQty] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState<QtyAdjustKind>("count");
  const [submitting, setSubmitting] = useState(false);

  if (value !== lastValue) {
    setLastValue(value);
    setInputVal(String(value));
  }

  // parseFloat (to 2 decimals, the precision of product_items.quantity_on_hand):
  // parseInt turned a fractional product stock like 12.5 into 12, so merely
  // tabbing out of the box offered "12.5 → 12" and a typed 7.5 saved as 7.
  // Parts are whole-unit; their adjust hook rejects a fraction with a message.
  const parsedFloat = parseFloat(inputVal);
  const parsed = Number.isFinite(parsedFloat) ? Math.round(parsedFloat * 100) / 100 : NaN;
  const isDirty = !isNaN(parsed) && parsed !== value;

  function flash() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function openReasonPrompt(next: number) {
    setPendingQty(Math.max(0, next));
  }

  async function handleConfirm() {
    if (pendingQty === null || !reason.trim()) return;
    setSubmitting(true);
    try {
      await onChange(pendingQty, reason.trim(), askKind ? kind : "correction");
      setInputVal(String(pendingQty));
      setPendingQty(null);
      setReason("");
      setKind("count");
      flash();
    } catch (err) {
      toast.error("Failed to adjust quantity", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    setInputVal(String(value));
    setPendingQty(null);
    setReason("");
    setKind("count");
  }

  return (
    <div className="mt-3 flex items-center gap-2 border-t border-black/5 pt-3">
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={() => {
          const next = Math.max(0, Math.round((value - 1) * 100) / 100);
          setInputVal(String(next));
          openReasonPrompt(next);
        }}
      >
        <Minus className="h-3 w-3" />
      </Button>

      <Input
        type="number"
        step="any"
        min={0}
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onBlur={() => {
          if (!isNaN(parsed) && parsed !== value) openReasonPrompt(parsed);
        }}
        className="h-7 w-16 text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />

      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={() => {
          const next = Math.round((value + 1) * 100) / 100;
          setInputVal(String(next));
          openReasonPrompt(next);
        }}
      >
        <Plus className="h-3 w-3" />
      </Button>

      <span
        className={cn(
          "ml-1 flex items-center gap-1 text-xs font-medium transition-opacity duration-300",
          saved ? "text-green-600 dark:text-green-400 opacity-100" : "text-slate-400 dark:text-neutral-500 opacity-0"
        )}
      >
        <Check className="h-3 w-3" />
        Saved
      </span>

      {isDirty && !saved && pendingQty === null && (
        <Button size="sm" className="ml-auto h-7 text-xs" onClick={() => openReasonPrompt(parsed)}>
          Save
        </Button>
      )}

      <Dialog open={pendingQty !== null} onOpenChange={(o) => { if (!o) handleCancel(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust quantity: {value} → {pendingQty}</DialogTitle>
          </DialogHeader>

          {askKind && (
            <fieldset className="space-y-1.5 pt-2">
              <legend className="mb-1.5 text-sm font-medium">What kind of change is this?</legend>
              {KIND_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm",
                    kind === opt.value ? "border-brand-300 bg-brand-50 dark:border-brand-700 dark:bg-brand-900/30" : "border-border"
                  )}
                >
                  <input
                    type="radio"
                    name="qty-adjust-kind"
                    value={opt.value}
                    checked={kind === opt.value}
                    onChange={() => setKind(opt.value)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">{opt.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{opt.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          <div className="space-y-1.5 py-2">
            <Label htmlFor="qty-adjust-reason">Reason <span className="text-red-500 dark:text-red-400">*</span></Label>
            <Textarea
              id="qty-adjust-reason"
              placeholder="Why is this quantity changing? (e.g. physical count correction, damaged/scrapped, found extra stock)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCancel} disabled={submitting}>Cancel</Button>
            <Button disabled={!reason.trim() || submitting} onClick={handleConfirm}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
