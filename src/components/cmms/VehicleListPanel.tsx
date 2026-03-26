"use client";

import { cn, getInitials, getAvatarColor } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ASSET_STATUS_LABELS } from "@/lib/constants";
import type { Vehicle } from "@/types";

interface VehicleListPanelProps {
  vehicles: Vehicle[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function VehicleListPanel({ vehicles, selectedId, onSelect }: VehicleListPanelProps) {
  return (
    <div className="flex flex-col overflow-y-auto">
      {vehicles.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-slate-400">
          No vehicles found
        </p>
      )}
      {vehicles.map((vehicle) => {
        const isSelected = vehicle.id === selectedId;
        const initials = getInitials(vehicle.name);
        const avatarColor = getAvatarColor(vehicle.name);

        return (
          <button
            key={vehicle.id}
            onClick={() => onSelect(vehicle.id)}
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
                  {vehicle.name}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {vehicle.equipmentNumber && (
                    <span className="font-mono text-xs font-medium text-slate-600">
                      {vehicle.equipmentNumber}
                    </span>
                  )}
                  <span className="font-mono text-xs text-slate-400">
                    {vehicle.assetTag}
                  </span>
                </div>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="truncate text-xs text-slate-500">
                  {vehicle.licensePlate ?? "No plate"} · {vehicle.division ?? "—"}
                </span>
                <StatusBadge
                  variant={vehicle.status as Parameters<typeof StatusBadge>[0]["variant"]}
                  label={ASSET_STATUS_LABELS[vehicle.status] ?? vehicle.status}
                />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
