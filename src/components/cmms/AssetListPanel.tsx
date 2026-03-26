"use client";

import { cn, getInitials, getAvatarColor } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ASSET_STATUS_LABELS } from "@/lib/constants";
import type { Asset } from "@/types";

interface AssetListPanelProps {
  assets: Asset[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function AssetListPanel({ assets, selectedId, onSelect }: AssetListPanelProps) {
  return (
    <div className="flex flex-col overflow-y-auto">
      {assets.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-slate-400">
          No assets found
        </p>
      )}
      {assets.map((asset) => {
        const isSelected = asset.id === selectedId;
        const initials = getInitials(asset.name);
        const avatarColor = getAvatarColor(asset.name);
        const makeModel = [asset.make, asset.model].filter(Boolean).join(" ");

        return (
          <button
            key={asset.id}
            onClick={() => onSelect(asset.id)}
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
                  {asset.name}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {asset.equipmentNumber && (
                    <span className="font-mono text-xs font-medium text-slate-600">
                      {asset.equipmentNumber}
                    </span>
                  )}
                  <span className="font-mono text-xs text-slate-400">
                    {asset.assetTag}
                  </span>
                </div>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="truncate text-xs text-slate-500">
                  {makeModel || asset.assetType}
                </span>
                <StatusBadge
                  variant={asset.status as Parameters<typeof StatusBadge>[0]["variant"]}
                  label={ASSET_STATUS_LABELS[asset.status] ?? asset.status}
                />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
