"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useWorkOrders } from "@/lib/hooks/use-work-orders";
import { WorkOrderDetailPanel } from "@/components/cmms/WorkOrderDetailPanel";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate } from "@/lib/utils";
import { WO_STATUS_LABELS, WO_PRIORITY_LABELS } from "@/lib/constants";
import { OverlayLevelContext, overlayZ, useOverlayLevel } from "@/lib/overlay-level";
import type { WorkOrder } from "@/types";

interface WOHistoryTabProps {
  assetId: string;
  recordLabel?: string;
}

export function WOHistoryTab({ assetId, recordLabel = "asset" }: WOHistoryTabProps) {
  const { data: workOrders, isLoading } = useWorkOrders();
  const [selectedWO, setSelectedWO] = useState<WorkOrder | null>(null);
  const woPortalRef = useRef<HTMLDivElement>(null);
  const level = useOverlayLevel();
  const { backdrop: backdropZ, panel: panelZ } = overlayZ(level);

  // Close on Escape key
  useEffect(() => {
    if (!selectedWO) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedWO(null);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedWO]);

  // Native wheel/touch listeners to prevent react-remove-scroll from blocking
  // scroll inside this WO detail portal.
  useEffect(() => {
    if (!selectedWO) return;
    const el = woPortalRef.current;
    if (!el) return;
    const stopProp = (e: Event) => e.stopPropagation();
    el.addEventListener("wheel", stopProp);
    el.addEventListener("touchmove", stopProp);
    return () => {
      el.removeEventListener("wheel", stopProp);
      el.removeEventListener("touchmove", stopProp);
    };
  }, [selectedWO]);

  const assetWOs = (workOrders ?? [])
    .filter((wo) => wo.assetId === assetId && wo.deletedAt === null)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (assetWOs.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <p className="text-sm text-slate-400">No work orders found for this {recordLabel}.</p>
      </div>
    );
  }

  return (
    <>
      <div className="p-6">
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">WO #</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Title</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Priority</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Date</th>
              </tr>
            </thead>
            <tbody>
              {assetWOs.map((wo) => (
                <tr key={wo.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <button
                      className="font-mono text-xs font-semibold text-brand-600 hover:underline"
                      onClick={() => setSelectedWO(wo)}
                    >
                      {wo.workOrderNumber}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-slate-800">{wo.title}</td>
                  <td className="px-3 py-2">
                    <StatusBadge
                      variant={wo.status}
                      label={WO_STATUS_LABELS[wo.status] ?? wo.status}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge
                      variant={wo.priority}
                      label={WO_PRIORITY_LABELS[wo.priority] ?? wo.priority}
                    />
                  </td>
                  <td className="px-3 py-2 text-slate-500">{formatDate(wo.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* WO detail — rendered via portal to avoid Radix scroll-lock nesting issues */}
      {selectedWO &&
        createPortal(
          <OverlayLevelContext.Provider value={level + 1}>
            <div
              className="fixed inset-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
              style={{
                zIndex: backdropZ,
                backgroundColor: level === 0 ? "rgba(0,0,0,0.8)" : "transparent",
              }}
              data-state="open"
              onClick={() => setSelectedWO(null)}
            />
            <div
              ref={woPortalRef}
              role="dialog"
              aria-modal="true"
              aria-label={selectedWO.title}
              className="pointer-events-auto fixed inset-y-0 right-0 flex w-full flex-col overflow-hidden border-l bg-background shadow-xl md:w-[580px]"
              style={{ zIndex: panelZ }}
            >
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSelectedWO(null)}
                className="absolute right-4 top-4 z-10 rounded-sm p-0.5 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <X className="h-4 w-4" />
              </button>
              <WorkOrderDetailPanel workOrder={selectedWO} />
            </div>
          </OverlayLevelContext.Provider>,
          document.body
        )}
    </>
  );
}
