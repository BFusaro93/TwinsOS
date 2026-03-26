"use client";

import { cn, formatCurrency, getInitials, getAvatarColor } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PO_STATUS_LABELS } from "@/lib/constants";
import type { PurchaseOrder } from "@/types";

interface POListPanelProps {
  orders: PurchaseOrder[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function POListPanel({ orders, selectedId, onSelect }: POListPanelProps) {
  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto">
      {orders.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-slate-400">
          No purchase orders found
        </p>
      )}
      {orders.map((po) => {
        const isSelected = po.id === selectedId;
        const initials = getInitials(po.vendorName);
        const avatarColor = getAvatarColor(po.vendorName);

        return (
          <button
            key={po.id}
            onClick={() => onSelect(po.id)}
            className={cn(
              "flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-slate-50",
              isSelected && "border-l-2 border-l-brand-500 bg-brand-50 hover:bg-brand-50"
            )}
          >
            {/* Vendor avatar */}
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
                  {po.poNumber}
                </span>
                <span className="shrink-0 text-sm font-medium text-slate-700">
                  {formatCurrency(po.grandTotal)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="truncate text-xs text-slate-500">
                  {po.vendorName} · {po.lineItems.length}{" "}
                  {po.lineItems.length === 1 ? "item" : "items"}
                </span>
                <StatusBadge variant={po.status} label={PO_STATUS_LABELS[po.status]} className="shrink-0 whitespace-nowrap" />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
