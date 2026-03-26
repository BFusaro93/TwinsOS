"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAddMeterReading } from "@/lib/hooks/use-meter-readings";
import type { Meter } from "@/types";

interface AddReadingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meter: Meter;
}

function todayISODate(): string {
  return new Date().toISOString().split("T")[0];
}

export function AddReadingDialog({ open, onOpenChange, meter }: AddReadingDialogProps) {
  const [readingValue, setReadingValue] = useState("");
  const [readingDate, setReadingDate] = useState(todayISODate());
  const [notes, setNotes] = useState("");
  const addReading = useAddMeterReading();

  const parsedValue = readingValue !== "" ? Number(readingValue) : null;
  const isValid =
    parsedValue !== null &&
    !isNaN(parsedValue) &&
    parsedValue >= meter.currentValue &&
    readingDate !== "";

  function handleClose() {
    onOpenChange(false);
    setReadingValue("");
    setReadingDate(todayISODate());
    setNotes("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || parsedValue === null) return;
    addReading.mutate(
      {
        meterId: meter.id,
        value: parsedValue,
        readingAt: readingDate,
        source: meter.source,
        recordedByName: null,
      },
      { onSuccess: () => handleClose() }
    );
  }
  const saving = addReading.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Add Reading</DialogTitle>
          <DialogDescription>
            Log a new reading for{" "}
            <span className="font-medium text-slate-700">{meter.assetName}</span> —{" "}
            {meter.name}
          </DialogDescription>
        </DialogHeader>

        {/* Current value context */}
        <div className="rounded-md border bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Current Reading
          </p>
          <p className="mt-0.5 text-lg font-bold text-slate-900">
            {meter.currentValue.toLocaleString()}{" "}
            <span className="text-sm font-normal text-slate-400">{meter.unit}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            {/* Reading Value */}
            <div className="grid gap-1.5">
              <Label htmlFor="reading-value">
                Reading Value <span className="text-red-500">*</span>
              </Label>
              <Input
                id="reading-value"
                type="number"
                min={meter.currentValue}
                placeholder={meter.currentValue.toString()}
                value={readingValue}
                onChange={(e) => setReadingValue(e.target.value)}
              />
              <p className="text-xs text-slate-500">
                Must be ≥ current reading ({meter.currentValue.toLocaleString()} {meter.unit})
              </p>
            </div>

            {/* Reading Date */}
            <div className="grid gap-1.5">
              <Label htmlFor="reading-date">
                Reading Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="reading-date"
                type="date"
                value={readingDate}
                onChange={(e) => setReadingDate(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div className="grid gap-1.5">
              <Label htmlFor="reading-notes">Notes (optional)</Label>
              <Textarea
                id="reading-notes"
                rows={3}
                placeholder="Any relevant context about this reading…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || saving}>
              {saving ? "Saving..." : "Log Reading"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
