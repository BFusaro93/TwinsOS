"use client";

import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function toLocalDateString(date: Date): string {
  // YYYY-MM-DD in local time (not UTC)
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayLocalString(): string {
  return toLocalDateString(new Date());
}

interface Props {
  selectedDate: string; // YYYY-MM-DD
  onDateChange: (date: string) => void;
}

export function WeekStrip({ selectedDate, onDateChange }: Props) {
  const selected = new Date(selectedDate + "T12:00:00"); // noon avoids DST edge
  const weekStart = startOfWeek(selected);
  const today = todayLocalString();

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  function shiftWeek(delta: number) {
    const d = new Date(selected);
    d.setDate(d.getDate() + delta * 7);
    onDateChange(toLocalDateString(d));
  }

  function formatHeaderDate(date: string): string {
    const d = new Date(date + "T12:00:00");
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
  }

  return (
    <div className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-3 py-2 shadow-sm">
      {/* Prev / days / next stay on one line; on a phone the day buttons
          shrink to fit instead of pushing the strip wider than the screen. */}
      <div className="flex min-w-0 max-w-full items-center gap-3 max-sm:gap-1">
      {/* Prev week */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={() => shiftWeek(-1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {/* Day buttons */}
      <div className="flex min-w-0 gap-1 max-sm:gap-0.5">
        {days.map((day, i) => {
          const ds = toLocalDateString(day);
          const isSelected = ds === selectedDate;
          const isToday = ds === today;
          return (
            <button
              key={i}
              onClick={() => onDateChange(ds)}
              className={cn(
                "flex h-10 w-10 min-w-0 shrink flex-col items-center justify-center rounded-md text-xs font-medium transition-colors",
                isSelected
                  ? "bg-brand-500 text-white"
                  : isToday
                  ? "border border-brand-300 dark:border-brand-700 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/30"
                  : "text-slate-600 dark:text-neutral-400 hover:bg-muted"
              )}
            >
              <span className="text-[10px] font-semibold uppercase">{DAY_LETTERS[i]}</span>
              <span className="text-sm leading-tight">{day.getDate()}</span>
            </button>
          );
        })}
      </div>

      {/* Next week */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={() => shiftWeek(1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      </div>

      {/* Date display */}
      <div className="ml-2 flex items-center gap-2 border-l pl-3 max-sm:ml-0 max-sm:border-l-0 max-sm:pl-0">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => e.target.value && onDateChange(e.target.value)}
          className="rounded border border-border bg-slate-50 dark:bg-muted/40 px-2 py-1 text-xs text-slate-700 dark:text-neutral-300 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </div>

      {/* Today shortcut */}
      {selectedDate !== today && (
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-7 text-xs"
          onClick={() => onDateChange(today)}
        >
          Today
        </Button>
      )}
    </div>
  );
}
