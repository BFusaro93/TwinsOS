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

interface QtyAdjustControlProps {
  value: number;
  onChange: (newQty: number, reason: string) => Promise<void>;
}

export function QtyAdjustControl({ value, onChange }: QtyAdjustControlProps) {
  const [inputVal, setInputVal] = useState(String(value));
  const [saved, setSaved] = useState(false);
  const [pendingQty, setPendingQty] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const parsed = parseInt(inputVal, 10);
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
      await onChange(pendingQty, reason.trim());
      setInputVal(String(pendingQty));
      setPendingQty(null);
      setReason("");
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
  }

  return (
    <div className="mt-3 flex items-center gap-2 border-t border-black/5 pt-3">
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={() => {
          const next = Math.max(0, value - 1);
          setInputVal(String(next));
          openReasonPrompt(next);
        }}
      >
        <Minus className="h-3 w-3" />
      </Button>

      <Input
        type="number"
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
          const next = value + 1;
          setInputVal(String(next));
          openReasonPrompt(next);
        }}
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

          <div className="space-y-1.5 py-2">
            <Label htmlFor="qty-adjust-reason">Reason <span className="text-red-500">*</span></Label>
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
