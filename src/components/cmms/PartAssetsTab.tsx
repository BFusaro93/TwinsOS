"use client";

import { useState } from "react";
import { Plus, Search, Trash2, Truck, Cpu } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ASSET_STATUS_LABELS } from "@/lib/constants";
import { usePartAssetLinks, useAddPartAssetLink, useRemoveAssetPart } from "@/lib/hooks/use-asset-parts";
import { useAssets } from "@/lib/hooks/use-assets";
import { useVehicles } from "@/lib/hooks/use-vehicles";
import type { Asset, Vehicle } from "@/types";

type LinkedRecord =
  | { kind: "asset"; record: Asset; linkId: string }
  | { kind: "vehicle"; record: Vehicle; linkId: string };

interface PartAssetsTabProps {
  partId: string;
  partName: string;
  partNumber: string;
  onRecordClick?: (item: LinkedRecord) => void;
}

export function PartAssetsTab({ partId, partName, partNumber, onRecordClick }: PartAssetsTabProps) {
  const queryClient = useQueryClient();
  const { data: links = [], isLoading } = usePartAssetLinks(partId);
  const { data: allAssets = [] } = useAssets();
  const { data: allVehicles = [] } = useVehicles();
  const { mutate: addLink, isPending: linking } = useAddPartAssetLink();
  const { mutate: removeLink } = useRemoveAssetPart();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Resolve link rows → full asset/vehicle records
  const linkedIds = new Set(links.map((l) => l.assetId));

  const items: LinkedRecord[] = links.reduce<LinkedRecord[]>((acc, link) => {
    const vehicle = allVehicles.find((v) => v.id === link.assetId);
    if (vehicle) return [...acc, { kind: "vehicle", record: vehicle, linkId: link.id }];
    const asset = allAssets.find((a) => a.id === link.assetId);
    if (asset) return [...acc, { kind: "asset", record: asset, linkId: link.id }];
    return acc;
  }, []);

  // All unlinked assets + vehicles for the picker
  const unlinked: LinkedRecord[] = [
    ...allVehicles
      .filter((v) => !linkedIds.has(v.id))
      .map((v): LinkedRecord => ({ kind: "vehicle", record: v, linkId: "" })),
    ...allAssets
      .filter((a) => !linkedIds.has(a.id))
      .map((a): LinkedRecord => ({ kind: "asset", record: a, linkId: "" })),
  ];

  const filtered = search
    ? unlinked.filter(({ record }) => {
        const q = search.toLowerCase();
        const asTag = (record as Asset).assetTag ?? "";
        const lp = (record as Vehicle).licensePlate ?? "";
        return (
          record.name.toLowerCase().includes(q) ||
          asTag.toLowerCase().includes(q) ||
          lp.toLowerCase().includes(q)
        );
      })
    : unlinked;

  function handleLink({ record }: LinkedRecord) {
    addLink(
      {
        assetId: record.id,
        partId,
        partName,
        partNumber,
      },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setSearch("");
        },
      }
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {items.length} asset{items.length !== 1 ? "s" : ""} / vehicle{items.length !== 1 ? "s" : ""} linked
        </p>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Link Asset / Vehicle
        </Button>
      </div>

      {/* Table or empty state */}
      {items.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-slate-400">No assets or vehicles linked to this part.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Name</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Asset Type</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Status</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {items.map(({ kind, record, linkId }) => (
                <tr key={record.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onRecordClick?.({ kind, record, linkId } as LinkedRecord)}
                      className="font-medium text-brand-600 hover:underline text-left"
                    >
                      {record.name}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      {kind === "vehicle" ? (
                        <Truck className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <Cpu className="h-3.5 w-3.5 shrink-0" />
                      )}
                      {kind === "vehicle"
                        ? "Vehicle"
                        : (record as Asset).assetType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge
                      variant={record.status}
                      label={ASSET_STATUS_LABELS[record.status] ?? record.status}
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      title="Unlink"
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeLink(
                          { id: linkId, assetId: record.id },
                          { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["part-asset-links", partId] }) }
                        );
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Link dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link Asset / Vehicle</DialogTitle>
            <DialogDescription>
              Select an asset or vehicle to associate with{" "}
              <span className="font-medium text-slate-700">{partName}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by name, asset tag, or license plate…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">
                {search ? "No results match your search." : "All assets and vehicles are already linked."}
              </p>
            ) : (
              <ul className="divide-y">
                {filtered.map(({ kind, record }) => (
                  <li key={record.id}>
                    <button
                      className="flex w-full items-center gap-3 rounded px-1 py-2.5 text-left hover:bg-slate-50 disabled:opacity-50"
                      disabled={linking}
                      onClick={() => handleLink({ kind, record } as LinkedRecord)}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                        {kind === "vehicle" ? (
                          <Truck className="h-3.5 w-3.5" />
                        ) : (
                          <Cpu className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <div className="flex-1 overflow-hidden">
                        <p className="truncate text-sm font-medium text-slate-800">{record.name}</p>
                        <p className="text-xs text-slate-500">
                          {kind === "vehicle" ? "Vehicle" : "Asset"}
                          {(record as Asset).assetTag
                            ? ` · ${(record as Asset).assetTag}`
                            : ""}
                          {(record as Vehicle).licensePlate
                            ? ` · ${(record as Vehicle).licensePlate}`
                            : ""}
                          {record.location ? ` · ${record.location}` : ""}
                        </p>
                      </div>
                      <StatusBadge
                        variant={record.status}
                        label={ASSET_STATUS_LABELS[record.status] ?? record.status}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
