"use client";

import { cn, formatDate, getInitials, getAvatarColor } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { PM_FREQUENCY_LABELS } from "@/lib/constants";
import { usePausedPMSchedules } from "@/lib/hooks/use-pm-schedule-pauses";
import type { PMSchedule } from "@/types";

interface PMScheduleListPanelProps {
  schedules: PMSchedule[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function PMScheduleListPanel({
  schedules,
  selectedId,
  onSelect,
}: PMScheduleListPanelProps) {
  const { data: paused } = usePausedPMSchedules();
  return (
    <div className="flex flex-col overflow-y-auto">
      {schedules.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-slate-400 dark:text-neutral-500">
          No PM schedules found
        </p>
      )}
      {schedules.map((schedule) => {
        const isSelected = schedule.id === selectedId;
        const initials = getInitials(schedule.assetName);
        const avatarColor = getAvatarColor(schedule.assetName);

        return (
          <button
            key={schedule.id}
            onClick={() => onSelect(schedule.id)}
            className={cn(
              "flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-muted/40",
              isSelected && "border-l-2 border-l-brand-500 bg-brand-50 dark:bg-brand-900/30 hover:bg-brand-50 dark:hover:bg-brand-900/30"
            )}
          >
            {/* Avatar */}
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
                avatarColor
              )}
            >
              {initials}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-slate-900 dark:text-neutral-100">
                  {schedule.title}
                </span>
                {paused?.has(schedule.id) ? (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
                  >
                    Paused
                  </Badge>
                ) : !schedule.isActive && (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-border bg-muted text-muted-foreground"
                  >
                    Inactive
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{schedule.assetName}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-400 dark:text-neutral-500">
                <span>{PM_FREQUENCY_LABELS[schedule.frequency] ?? schedule.frequency}</span>
                <span>·</span>
                <span>Next: {formatDate(schedule.nextDueDate)}</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
