"use client";

import { cn, formatCurrency, getInitials, getAvatarColor } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { APPROVAL_STATUS_LABELS } from "@/lib/constants";
import type { Requisition } from "@/types";

interface RequisitionListPanelProps {
  requisitions: Requisition[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function RequisitionListPanel({
  requisitions,
  selectedId,
  onSelect,
}: RequisitionListPanelProps) {
  return (
    <div className="flex flex-col overflow-y-auto">
      {requisitions.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-slate-400">
          No requisitions found
        </p>
      )}
      {requisitions.map((req) => {
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
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
                avatarColor
              )}
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-slate-900">
                  {req.requisitionNumber}
                </span>
                <span className="shrink-0 text-sm font-medium text-slate-700">
                  {formatCurrency(req.subtotal)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="truncate text-xs text-slate-500">{req.title}</span>
                <StatusBadge
                  variant={req.status}
                  label={APPROVAL_STATUS_LABELS[req.status]}
                  className="shrink-0 whitespace-nowrap"
                />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
