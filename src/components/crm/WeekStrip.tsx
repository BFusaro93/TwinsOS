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
    <div className="flex items-center gap-3 rounded-lg border bg-white px-3 py-2 shadow-sm">
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
      <div className="flex gap-1">
        {days.map((day, i) => {
          const ds = toLocalDateString(day);
          const isSelected = ds === selectedDate;
          const isToday = ds === today;
          return (
            <button
              key={i}
              onClick={() => onDateChange(ds)}
              className={cn(
                "flex h-10 w-10 flex-col items-center justify-center rounded-md text-xs font-medium transition-colors",
                isSelected
                  ? "bg-brand-500 text-white"
                  : isToday
                  ? "border border-brand-300 text-brand-600 hover:bg-brand-50"
                  : "text-slate-600 hover:bg-slate-100"
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

      {/* Date display */}
      <div className="ml-2 flex items-center gap-2 border-l pl-3">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => e.target.value && onDateChange(e.target.value)}
          className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-400"
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
