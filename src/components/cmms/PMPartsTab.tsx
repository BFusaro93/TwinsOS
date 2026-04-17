"use client";

import { useState } from "react";
import { Plus, Search, Package, Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useParts } from "@/lib/hooks/use-parts";
import { PartDetailSheet } from "@/components/cmms/PartDetailSheet";
import {
  usePMParts,
  useAddPMPart,
  useUpdatePMPart,
  useDeletePMPart,
} from "@/lib/hooks/use-pm-parts";
import type { PMPart } from "@/types/cmms";

interface PMPartsTabProps {
  pmScheduleId: string;
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <td className="px-2 py-2 text-right">
      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          title="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
          title="Remove"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </td>
  );
}

export function PMPartsTab({ pmScheduleId }: PMPartsTabProps) {
  const { data: items = [] } = usePMParts(pmScheduleId);
  const { data: allParts = [] } = useParts();
  const { mutate: addPart, isPending: adding } = useAddPMPart();
  const { mutate: updatePart } = useUpdatePMPart();
  const { mutate: deletePart } = useDeletePMPart();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const selectedPart = selectedPartId ? allParts.find((p) => p.id === selectedPartId) ?? null : null;
  const [editForm, setEditForm] = useState({ quantity: "", unitCost: "" });

  const linkedIds = new Set(items.map((p) => p.partId));
  const editingItem = editingId ? items.find((p) => p.id === editingId) ?? null : null;

  const available = allParts
    .filter((p) => !linkedIds.has(p.id) && p.deletedAt === null)
    .filter(
      (p) =>
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.partNumber.toLowerCase().includes(search.toLowerCase())
    );

  function openEdit(item: PMPart) {
    setEditingId(item.id);
    setEditForm({
      quantity: String(item.quantity),
      unitCost: (item.unitCost / 100).toFixed(2),
    });
  }

  function saveEdit() {
    if (!editingId) return;
    const quantity = Math.max(1, parseInt(editForm.quantity, 10) || 1);
    const unitCost = Math.round(parseFloat(editForm.unitCost) * 100);
    updatePart(
      { id: editingId, pmScheduleId, quantity, unitCost: unitCost || (editingItem?.unitCost ?? 0) },
      { onSuccess: () => setEditingId(null) }
    );
  }

  function handleAdd(partId: string) {
    const part = allParts.find((p) => p.id === partId);
    if (!part) return;
    addPart(
      {
        pmScheduleId,
        partId: part.id,
        partName: part.name,
        partNumber: part.partNumber,
        quantity: qtyMap[partId] ?? 1,
        unitCost: part.unitCost,
      },
      {
        onSuccess: () => {
          setAddOpen(false);
          setSearch("");
          setQtyMap({});
        },
      }
    );
  }

  const total = items.reduce((sum, p) => sum + p.quantity * p.unitCost, 0);

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-3.5 w-3.5 text-slate-400" />
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Expected Parts
            <span className="ml-1.5 font-normal normal-case text-slate-300">({items.length})</span>
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Part
        </Button>
      </div>

      <p className="text-xs text-slate-400">
        Use this tab for parts that are <span className="font-medium text-slate-500">shared across all assets</span> in this schedule (e.g. a lubricant used on every machine). For parts that are unique to a specific asset, add them under the <span className="font-medium text-slate-500">Assets tab</span> by expanding that asset's row.
      </p>

      {/* Table */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-md border border-dashed py-8 text-center">
          <p className="text-sm text-slate-400">No shared parts added yet.</p>
          <p className="text-xs text-slate-300">For asset-specific parts, use the Assets tab.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Part</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Part #</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Qty</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Unit Cost</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Subtotal</th>
                <th className="w-16 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const fullPart = allParts.find((ap) => ap.id === p.partId);
                return (
                  <tr key={p.id} className="group border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {fullPart?.pictureUrl ? (
                          <img src={fullPart.pictureUrl} alt="" className="h-8 w-8 rounded object-cover" />
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-100">
                            <Package className="h-4 w-4 text-slate-400" />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedPartId(p.partId)}
                          className="text-left font-medium text-brand-600 hover:underline"
                        >
                          {p.partName}
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-500">{p.partNumber || "—"}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{p.quantity}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(p.unitCost)}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-900">
                      {formatCurrency(p.quantity * p.unitCost)}
                    </td>
                    <RowActions
                      onEdit={() => openEdit(p)}
                      onDelete={() => deletePart({ id: p.id, pmScheduleId })}
                    />
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold text-slate-500">
                  Estimated Parts Cost
                </td>
                <td className="px-3 py-2 text-right font-semibold text-slate-900">
                  {formatCurrency(total)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Add Part dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Part</DialogTitle>
            <DialogDescription>
              Select a part from inventory to include in this PM schedule.
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
            {available.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">
                {search ? "No parts match your search." : "All parts are already added."}
              </p>
            ) : (
              <ul className="divide-y">
                {available.map((part) => (
                  <li key={part.id}>
                    <div className="flex items-center gap-3 px-1 py-2.5">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-800">{part.name}</p>
                        <p className="text-xs text-slate-500">
                          {part.partNumber} · {formatCurrency(part.unitCost)} each
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          value={qtyMap[part.id] ?? 1}
                          onChange={(e) =>
                            setQtyMap((prev) => ({ ...prev, [part.id]: Math.max(1, Number(e.target.value)) }))
                          }
                          className="h-7 w-16 text-center text-sm"
                        />
                        <Button size="sm" disabled={adding} onClick={() => handleAdd(part.id)}>
                          Add
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Part dialog */}
      <Dialog open={!!editingItem} onOpenChange={(o) => { if (!o) setEditingId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Part</DialogTitle>
            <DialogDescription>
              {editingItem?.partName} — {editingItem?.partNumber}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Quantity</label>
                <Input
                  type="number"
                  min={1}
                  value={editForm.quantity}
                  onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Unit Cost ($)</label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={editForm.unitCost}
                  onChange={(e) => setEditForm((f) => ({ ...f, unitCost: e.target.value }))}
                />
              </div>
            </div>
            <Button onClick={saveEdit} className="mt-1">
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PartDetailSheet
        part={selectedPart}
        open={!!selectedPart}
        onOpenChange={(o) => { if (!o) setSelectedPartId(null); }}
      />
    </div>
  );
}
