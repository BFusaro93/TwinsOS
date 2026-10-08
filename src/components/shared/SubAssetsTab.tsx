"use client";

import { useState } from "react";
import { Link, Plus, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ASSET_STATUS_LABELS } from "@/lib/constants";
import { useAssets, useUpdateAsset } from "@/lib/hooks/use-assets";
import { useRoleCapabilities } from "@/lib/hooks/use-role-capabilities";
import type { Asset } from "@/types";

export type SubAssetParent = { kind: "asset" | "vehicle"; id: string };

/** Sub-assets (plows, salters…) attached to an asset or a vehicle. */
export function SubAssetsTab({ parent, onAddSubAsset }: { parent: SubAssetParent; onAddSubAsset: () => void }) {
  const { data: allAssets } = useAssets();
  const { mutate: updateAsset, isPending: linking } = useUpdateAsset();
  const { canWriteEquipt } = useRoleCapabilities();

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");

  const isChild = (a: Asset) =>
    parent.kind === "vehicle" ? a.parentVehicleId === parent.id : a.parentAssetId === parent.id;
  const subAssets = (allAssets ?? []).filter((a) => a.deletedAt === null && isChild(a));

  // Linkable = assets with no parent of their own that aren't already a child.
  // The hierarchy is one level deep, so an asset that already has sub-assets
  // of its own can't become a child either.
  const subAssetIds = new Set(subAssets.map((a) => a.id));
  const assetIdsWithChildren = new Set(
    (allAssets ?? []).filter((a) => a.deletedAt === null && a.parentAssetId).map((a) => a.parentAssetId)
  );
  const linkable = (allAssets ?? []).filter(
    (a) =>
      a.id !== parent.id &&
      !a.parentAssetId &&
      !a.parentVehicleId &&
      !assetIdsWithChildren.has(a.id) &&
      !subAssetIds.has(a.id) &&
      a.deletedAt === null
  );

  const filtered = linkSearch.trim()
    ? linkable.filter((a) =>
        a.name.toLowerCase().includes(linkSearch.toLowerCase()) ||
        a.assetTag.toLowerCase().includes(linkSearch.toLowerCase()) ||
        (a.make ?? "").toLowerCase().includes(linkSearch.toLowerCase()) ||
        (a.model ?? "").toLowerCase().includes(linkSearch.toLowerCase())
      )
    : linkable;

  function handleLink(id: string) {
    updateAsset(
      parent.kind === "vehicle" ? { id, parentVehicleId: parent.id } : { id, parentAssetId: parent.id },
      { onSuccess: () => { setLinkOpen(false); setLinkSearch(""); } }
    );
  }

  function handleUnlink(id: string) {
    updateAsset(parent.kind === "vehicle" ? { id, parentVehicleId: null } : { id, parentAssetId: null });
  }

  return (
    <div className="flex flex-col gap-3 p-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
          Sub-assets
          <span className="ml-1.5 font-normal normal-case text-slate-300 dark:text-neutral-500">({subAssets.length})</span>
        </p>
        {canWriteEquipt && <div className="flex items-center gap-2">
          {/* Link existing asset */}
          <Popover open={linkOpen} onOpenChange={(o) => { setLinkOpen(o); if (!o) setLinkSearch(""); }}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline">
                <Link className="mr-1.5 h-3.5 w-3.5" />
                Link Existing
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="end">
              <p className="mb-1.5 px-1 text-xs font-semibold text-muted-foreground">
                Select an asset to attach as a sub-asset
              </p>
              <Input
                autoFocus
                placeholder="Search assets…"
                value={linkSearch}
                onChange={(e) => setLinkSearch(e.target.value)}
                className="mb-1.5 h-8 text-sm"
              />
              <div
                className="max-h-56 overflow-y-auto"
                onWheel={(e) => e.stopPropagation()}
              >
                {filtered.length === 0 ? (
                  <p className="py-3 text-center text-xs text-slate-400 dark:text-neutral-500">
                    {linkSearch ? "No assets match" : "No available assets"}
                  </p>
                ) : (
                  filtered.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      disabled={linking}
                      onClick={() => handleLink(a.id)}
                      className="flex w-full flex-col rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                    >
                      <span className="font-medium text-slate-800 dark:text-neutral-100">{a.name}</span>
                      <span className="text-xs text-slate-400 dark:text-neutral-500">
                        {[a.make, a.model].filter(Boolean).join(" ")}
                        {a.assetTag && <span className="ml-1 font-mono">{a.assetTag}</span>}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Create new sub-asset */}
          <Button size="sm" variant="outline" onClick={onAddSubAsset}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Sub-Asset
          </Button>
        </div>}
      </div>

      {subAssets.length === 0 ? (
        <div className="flex h-20 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-slate-400 dark:text-neutral-500">No sub-assets linked yet.</p>
        </div>
      ) : (
        subAssets.map((sub) => (
          <div
            key={sub.id}
            className="flex items-center justify-between rounded-md border border-slate-100 dark:border-neutral-800 bg-slate-50 dark:bg-muted/40 px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-neutral-100">{sub.name}</p>
              <p className="text-xs text-muted-foreground">
                {[sub.make, sub.model].filter(Boolean).join(" ")}
                {sub.assetTag && (
                  <span className="ml-2 font-mono text-slate-400 dark:text-neutral-500">{sub.assetTag}</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge
                variant={sub.status as Parameters<typeof StatusBadge>[0]["variant"]}
                label={ASSET_STATUS_LABELS[sub.status] ?? sub.status}
              />
              {canWriteEquipt && (
                <button
                  type="button"
                  title="Unlink this sub-asset"
                  onClick={() => handleUnlink(sub.id)}
                  className="ml-1 rounded p-1 text-slate-300 dark:text-neutral-500 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-500 dark:hover:text-red-400"
                >
                  <Unlink className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
