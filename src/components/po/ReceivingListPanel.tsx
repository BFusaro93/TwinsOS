"use client";

import { cn, formatDate, getInitials, getAvatarColor } from "@/lib/utils";
import type { GoodsReceipt } from "@/types";

interface ReceivingListPanelProps {
  receipts: GoodsReceipt[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ReceivingListPanel({ receipts, selectedId, onSelect }: ReceivingListPanelProps) {
  return (
    <div className="flex flex-col overflow-y-auto">
      {receipts.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-slate-400">No receipts found</p>
      )}
      {receipts.map((receipt) => {
        const isSelected = receipt.id === selectedId;
        const hasBackorder = receipt.lines.some((l) => l.quantityRemaining > 0);

        return (
          <button
            key={receipt.id}
            onClick={() => onSelect(receipt.id)}
            className={cn(
              "flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-slate-50",
              isSelected && "border-l-2 border-l-brand-500 bg-brand-50 hover:bg-brand-50"
            )}
          >
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
                getAvatarColor(receipt.vendorName)
              )}
            >
              {getInitials(receipt.vendorName)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-slate-900">
                  {receipt.receiptNumber}
                </span>
                {hasBackorder && (
                  <span className="shrink-0 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700">
                    Partial
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-slate-500">
                  {receipt.vendorName} · {receipt.poNumber}
                </span>
                <span className="shrink-0 text-xs text-slate-400">
                  {formatDate(receipt.receivedAt)}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
