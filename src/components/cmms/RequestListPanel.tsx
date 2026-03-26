"use client";

import { cn, relativeTime, getInitials, getAvatarColor } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { REQUEST_STATUS_LABELS, WO_PRIORITY_LABELS } from "@/lib/constants";
import type { MaintenanceRequest } from "@/types";

interface RequestListPanelProps {
  requests: MaintenanceRequest[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function RequestListPanel({ requests, selectedId, onSelect }: RequestListPanelProps) {
  return (
    <div className="flex flex-col overflow-y-auto">
      {requests.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-slate-400">
          No requests found
        </p>
      )}
      {requests.map((req) => {
        const isSelected = req.id === selectedId;
        const initials = getInitials(req.requestedByName);
        const avatarColor = getAvatarColor(req.requestedByName);

        return (
          <button
            key={req.id}
            onClick={() => onSelect(req.id)}
            className={cn(
              "flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-slate-50",
              isSelected && "border-l-2 border-l-brand-500 bg-brand-50 hover:bg-brand-50"
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
                <span className="truncate text-sm font-semibold text-slate-900">
                  {req.requestNumber}
                </span>
                <span className="shrink-0 text-xs text-slate-400">
                  {relativeTime(req.createdAt)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-600">{req.title}</p>
              <div className="mt-1 flex items-center gap-1.5">
                <StatusBadge
                  variant={req.status}
                  label={REQUEST_STATUS_LABELS[req.status]}
                />
                <StatusBadge
                  variant={req.priority}
                  label={WO_PRIORITY_LABELS[req.priority]}
                />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
