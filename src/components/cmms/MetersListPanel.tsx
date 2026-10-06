"use client";

import { cn, relativeTime, formatDate, getInitials, getAvatarColor } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Meter } from "@/types/cmms";

interface MetersListPanelProps {
  meters: Meter[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function MetersListPanel({ meters, selectedId, onSelect }: MetersListPanelProps) {
  return (
    <div className="flex flex-col overflow-y-auto">
      {meters.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-slate-400 dark:text-neutral-500">No meters found</p>
      )}
      {meters.map((meter) => {
        const isSelected = meter.id === selectedId;
        const initials = getInitials(meter.assetName);
        const avatarColor = getAvatarColor(meter.assetName);

        return (
          <button
            key={meter.id}
            onClick={() => onSelect(meter.id)}
            className={cn(
              "flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-muted/40",
              isSelected && "border-l-2 border-l-brand-500 bg-brand-50 dark:bg-brand-900/30 hover:bg-brand-50 dark:hover:bg-brand-900/30"
            )}
          >
            {/* Asset avatar */}
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
                  {meter.name}
                </span>
                <Badge
                  variant="outline"
                  className={
                    meter.source === "samsara"
                      ? "shrink-0 border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400"
                      : "shrink-0 border-border bg-muted text-muted-foreground"
                  }
                >
                  {meter.source === "samsara" ? "Samsara" : "Manual"}
                </Badge>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{meter.assetName}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-400 dark:text-neutral-500">
                <span className="font-mono font-medium text-slate-700 dark:text-neutral-300">
                  {meter.currentValue.toLocaleString()}{" "}
                  <span className="font-normal text-slate-400 dark:text-neutral-500">{meter.unit}</span>
                </span>
                <span>·</span>
                <span title={formatDate(meter.lastReadingAt)}>
                  Updated {relativeTime(meter.lastReadingAt)}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
