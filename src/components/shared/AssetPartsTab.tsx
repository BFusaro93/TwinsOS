"use client";

import { useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { useAssetParts, useBulkAddAssetParts, useRemoveAssetPart } from "@/lib/hooks/use-asset-parts";
import { useParts } from "@/lib/hooks/use-parts";
import { PartDetailSheet } from "@/components/cmms/PartDetailSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Part, AssetPart } from "@/types";

interface AssetPartsTabProps {
  assetId: string;
  recordLabel?: string;
}

export function AssetPartsTab({ assetId, recordLabel = "asset" }: AssetPartsTabProps) {
  const { data: assetParts, isLoading } = useAssetParts(assetId);
  const { data: allParts } = useParts();
  const { mutate: bulkAddAssetParts, isPending: linking } = useBulkAddAssetParts();
  const { mutate: removeAssetPart } = useRemoveAssetPart();

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const allLinked = assetParts ?? [];
  const linkedPartIds = new Set(allLinked.map((ap) => ap.partId));

  const availableParts = (allParts ?? []).filter(
    (p) => !linkedPartIds.has(p.id) && p.deletedAt === null
  );
  const filteredAvailable = availableParts.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.partNumber.toLowerCase().includes(search.toLowerCase())
  );

  function handleLink(part: Part) {
    // Collect the selected part plus any interchangeable parts not yet linked.
    // If the selected part is a generic (has parentPartId): include the OEM parent
    // and any sibling alternates.  If it's the OEM parent: include its children.
    const allPartsArr = allParts ?? [];
    const interchangeable: Part[] = [];

    if (part.parentPartId) {
      // Generic part — add OEM parent + siblings
      const parent = allPartsArr.find((p) => p.id === part.parentPartId);
      if (parent) interchangeable.push(parent);
      allPartsArr
        .filter((p) => p.parentPartId === part.parentPartId && p.id !== part.id)
        .forEach((p) => interchangeable.push(p));
    } else {
      // OEM / standalone part — add any generic alternates
      allPartsArr
        .filter((p) => p.parentPartId === part.id)
        .forEach((p) => interchangeable.push(p));
    }

    // Build the full set: selected part + interchangeable parts not already linked
    const toAdd: Part[] = [part];
    for (const p of interchangeable) {
      if (!linkedPartIds.has(p.id)) toAdd.push(p);
    }

    bulkAddAssetParts(
      toAdd.map((p) => ({ assetId, partId: p.id, partName: p.name, partNumber: p.partNumber })),
      {
        onSuccess: () => {
          setLinkDialogOpen(false);
          setSearch("");
        },
      }
    );
  }

  function handlePartClick(ap: AssetPart) {
    const part = allParts?.find((p) => p.id === ap.partId);
    if (part) {
      setSelectedPart(part);
      setSheetOpen(true);
    }
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
      {/* Header row */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {allLinked.length} part{allLinked.length !== 1 ? "s" : ""} linked
        </p>
        <Button size="sm" variant="outline" onClick={() => setLinkDialogOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Link Part
        </Button>
      </div>

      {/* Parts table / empty */}
      {allLinked.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-slate-400">No parts linked to this {recordLabel}.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">
                  Part Name
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">
                  Part #
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">
                  On Hand
                </th>
                <th className="w-8 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {allLinked.map((ap) => {
                const part = allParts?.find((p) => p.id === ap.partId);
                const isLow = part && part.quantityOnHand <= part.minimumStock;
                return (
                  <tr key={ap.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <button
                        className="text-left font-medium text-brand-600 hover:underline"
                        onClick={() => handlePartClick(ap)}
                      >
                        {ap.partName}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-slate-500">{ap.partNumber}</td>
                    <td className="px-3 py-2 text-right">
                      {part ? (
                        <span
                          className={
                            isLow ? "font-medium text-red-600" : "text-slate-700"
                          }
                        >
                          {part.quantityOnHand}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <button
                        className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                        title="Unlink part"
                        onClick={() => removeAssetPart({ id: ap.id, assetId })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Link Part dialog ── */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link a Part</DialogTitle>
            <DialogDescription>
              Select a part from inventory to associate with this {recordLabel}.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by name or part #…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="max-h-72 overflow-y-auto">
            {filteredAvailable.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">
                {search ? "No parts match your search." : "All parts are already linked."}
              </p>
            ) : (
              <ul className="divide-y">
                {filteredAvailable.map((part) => (
                  <li key={part.id}>
                    <button
                      className="flex w-full items-start gap-3 rounded px-1 py-2.5 text-left hover:bg-slate-50 disabled:opacity-50"
                      disabled={linking}
                      onClick={() => handleLink(part)}
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-800">{part.name}</p>
                        <p className="text-xs text-slate-500">
                          {part.partNumber} &middot; {part.category}
                        </p>
                      </div>
                      <span className="text-xs text-slate-400">
                        {part.quantityOnHand} on hand
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Part detail sheet overlay ── */}
      <PartDetailSheet
        part={selectedPart}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
