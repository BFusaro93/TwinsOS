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
import { useAddMeterReading, levelReadingError } from "@/lib/hooks/use-meter-readings";
import type { Meter } from "@/types";

interface AddReadingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meter: Meter;
}

function todayISODate(): string {
  // Use local date components (not UTC) so the default date matches the user's
  // calendar day — new Date().toISOString() returns UTC which rolls to the next
  // day in US timezones after ~7–8pm ET.
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function AddReadingDialog({ open, onOpenChange, meter }: AddReadingDialogProps) {
  const [readingValue, setReadingValue] = useState("");
  const [readingDate, setReadingDate] = useState(todayISODate());
  const [notes, setNotes] = useState("");
  const addReading = useAddMeterReading();

  const parsedValue = readingValue !== "" ? Number(readingValue) : null;
  const isLevel = meter.kind === "level";
  const levelError =
    isLevel && parsedValue !== null && !isNaN(parsedValue)
      ? levelReadingError(parsedValue, meter.capacity, meter.unit)
      : null;
  // A past-dated reading on a cumulative meter is checked against its neighbours
  // (previous/next readings) when saved, not against today's value — a missed
  // reading from last week is legitimately lower than the current one.
  const isBackdated = readingDate !== "" && readingDate < todayISODate();
  const isValid =
    parsedValue !== null &&
    !isNaN(parsedValue) &&
    (isLevel ? levelError === null : isBackdated ? parsedValue >= 0 : parsedValue >= meter.currentValue) &&
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
    // A reading for today is stamped with the real time: noon would sort BEFORE a
    // reading logged earlier today at a later hour (e.g. a meter's starting reading
    // created that evening), so the newer reading would never become current and a
    // same-day higher reading would be rejected as "higher than a later reading".
    // Past dates use T12:00:00 so Postgres stores noon local-ish time — a bare
    // YYYY-MM-DD string is parsed as UTC midnight which shifts back a day in
    // US timezones when displayed.
    const readingAtISO =
      readingDate === todayISODate() ? new Date().toISOString() : readingDate + "T12:00:00";
    addReading.mutate(
      {
        meterId: meter.id,
        value: parsedValue,
        readingAt: readingAtISO,
        source: meter.source,
        recordedByName: null,
        notes: notes.trim() || null,
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
            <span className="font-medium text-slate-700 dark:text-neutral-300">{meter.assetName}</span> —{" "}
            {meter.name}
          </DialogDescription>
        </DialogHeader>

        {/* Current value context */}
        <div className="rounded-md border bg-slate-50 dark:bg-muted/40 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-neutral-500">
            Current Reading
          </p>
          <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-neutral-100">
            {meter.currentValue.toLocaleString()}{" "}
            <span className="text-sm font-normal text-slate-400 dark:text-neutral-500">{meter.unit}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            {/* Reading Value */}
            <div className="grid gap-1.5">
              <Label htmlFor="reading-value">
                Reading Value <span className="text-red-500 dark:text-red-400">*</span>
              </Label>
              <Input
                id="reading-value"
                type="number"
                min={isLevel || isBackdated ? 0 : meter.currentValue}
                max={isLevel && meter.capacity != null ? meter.capacity : undefined}
                placeholder={meter.currentValue.toString()}
                value={readingValue}
                onChange={(e) => setReadingValue(e.target.value)}
              />
              {levelError ? (
                <p className="text-xs text-destructive">{levelError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {isLevel
                    ? `Current level; can go up or down${meter.capacity != null ? ` (0 to ${meter.capacity.toLocaleString()} ${meter.unit})` : ""}`
                    : isBackdated
                      ? "Must fit between the readings before and after this date"
                      : `Must be ≥ current reading (${meter.currentValue.toLocaleString()} ${meter.unit})`}
                </p>
              )}
            </div>

            {/* Reading Date */}
            <div className="grid gap-1.5">
              <Label htmlFor="reading-date">
                Reading Date <span className="text-red-500 dark:text-red-400">*</span>
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

          {addReading.error && (
            <p className="mt-4 text-sm text-destructive">{addReading.error.message}</p>
          )}

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
