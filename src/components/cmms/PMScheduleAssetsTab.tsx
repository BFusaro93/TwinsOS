"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useParts } from "@/lib/hooks/use-parts";
import {
  usePMScheduleAssets,
  usePMScheduleAssetParts,
  useAddPMScheduleAssetPart,
  useUpdatePMScheduleAssetPart,
  useDeletePMScheduleAssetPart,
} from "@/lib/hooks/use-pm-schedule-assets";
import type { PMScheduleAssetPart } from "@/types/cmms";
import { useRoleCapabilities } from "@/lib/hooks/use-role-capabilities";

interface PMScheduleAssetsTabProps {
  pmScheduleId: string;
}

// ── Add / Edit part dialog ────────────────────────────────────────────────────

interface PartDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pmScheduleAssetId: string;
  editing?: PMScheduleAssetPart | null;
}

function PartDialog({ open, onOpenChange, pmScheduleAssetId, editing }: PartDialogProps) {
  const { data: parts } = useParts();
  const [search, setSearch] = useState("");
  const [partKey, setPartKey] = useState(editing?.partId ?? "");
  const [qty, setQty] = useState(editing ? String(editing.quantity) : "1");
  const [cost, setCost] = useState(editing ? String(editing.unitCost / 100) : "");

  const addPart = useAddPMScheduleAssetPart();
  const updatePart = useUpdatePMScheduleAssetPart();

  const filtered = (parts ?? []).filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.partNumber.toLowerCase().includes(search.toLowerCase())
  );
  const selectedPart = (parts ?? []).find((p) => p.id === partKey);

  function handleSave() {
    const quantity = Math.max(1, parseInt(qty) || 1);
    const unitCost = Math.round(parseFloat(cost || "0") * 100);

    if (editing) {
      updatePart.mutate(
        { id: editing.id, pmScheduleAssetId, quantity, unitCost },
        { onSuccess: () => { onOpenChange(false); } }
      );
    } else if (selectedPart) {
      addPart.mutate(
        {
          pmScheduleAssetId,
          partId: selectedPart.id,
          partName: selectedPart.name,
          partNumber: selectedPart.partNumber,
          quantity,
          unitCost: unitCost || selectedPart.unitCost,
        },
        { onSuccess: () => { onOpenChange(false); setSearch(""); setPartKey(""); setQty("1"); setCost(""); } }
      );
    }
  }

  const canSave = editing ? true : !!selectedPart;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Part" : "Add Part"}</DialogTitle>
          <DialogDescription>
            {editing ? "Update quantity or cost for this part." : "Select a part from inventory to add to this asset's service template."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {!editing && (
            <div className="flex flex-col gap-2">
              <Input
                placeholder="Search parts…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
              <div className="max-h-56 overflow-y-auto rounded border">
                {filtered.length === 0 ? (
                  <p className="p-3 text-center text-sm text-slate-400 dark:text-neutral-500">No parts found</p>
                ) : (
                  filtered.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setPartKey(p.id); if (!cost) setCost((p.unitCost / 100).toFixed(2)); }}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-muted/40 ${partKey === p.id ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400" : ""}`}
                    >
                      <Package className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-neutral-500" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">#{p.partNumber} · On hand: {p.quantityOnHand}</p>
                      </div>
                      <span className="shrink-0 text-muted-foreground">{formatCurrency(p.unitCost)}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {editing && (
            <p className="text-sm font-medium text-slate-700 dark:text-neutral-300">{editing.partName}</p>
          )}

          <div className="flex gap-3">
            <div className="grid flex-1 gap-1">
              <label className="text-xs font-medium text-slate-600 dark:text-neutral-400">Qty</label>
              <Input
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div className="grid flex-1 gap-1">
              <label className="text-xs font-medium text-slate-600 dark:text-neutral-400">Unit Cost ($)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
          </div>

        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!canSave || addPart.isPending || updatePart.isPending}
            onClick={handleSave}
          >
            {addPart.isPending || updatePart.isPending ? "Saving…" : editing ? "Save" : "Add Part"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Per-asset parts list ──────────────────────────────────────────────────────

function AssetPartsSection({ pmScheduleAssetId }: { pmScheduleAssetId: string }) {
  const { data: parts, isLoading } = usePMScheduleAssetParts(pmScheduleAssetId);
  const deletePart = useDeletePMScheduleAssetPart();
  const { canWriteEquipt } = useRoleCapabilities();
  const [addOpen, setAddOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<PMScheduleAssetPart | null>(null);

  if (isLoading) return <p className="px-4 py-2 text-xs text-slate-400 dark:text-neutral-500">Loading…</p>;

  const total = (parts ?? []).reduce((s, p) => s + p.unitCost * p.quantity, 0);

  return (
    <div className="border-t bg-slate-50/60 dark:bg-muted/40">
      {(parts ?? []).length === 0 ? (
        <p className="px-4 py-2 text-xs text-slate-400 dark:text-neutral-500 italic">{canWriteEquipt ? "No parts — click + to add" : "No parts"}</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted text-muted-foreground">
              <th className="px-4 py-1.5 text-left font-medium">Part</th>
              <th className="px-2 py-1.5 text-right font-medium w-16">Qty</th>
              <th className="px-2 py-1.5 text-right font-medium w-24">Unit Cost</th>
              <th className="px-2 py-1.5 text-right font-medium w-24">Total</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {(parts ?? []).map((p) => (
              <tr key={p.id} className="group border-b border-slate-100 dark:border-neutral-800 last:border-0 hover:bg-card">
                <td className="px-4 py-2">
                  <p className="font-medium text-slate-800 dark:text-neutral-100">{p.partName}</p>
                  {p.partNumber && <p className="text-slate-400 dark:text-neutral-500">#{p.partNumber}</p>}
                </td>
                <td className="px-2 py-2 text-right text-slate-700 dark:text-neutral-300">{p.quantity}</td>
                <td className="px-2 py-2 text-right text-slate-700 dark:text-neutral-300">{formatCurrency(p.unitCost)}</td>
                <td className="px-2 py-2 text-right text-slate-700 dark:text-neutral-300">{formatCurrency(p.unitCost * p.quantity)}</td>
                <td className="px-2 py-2 text-right">
                  {canWriteEquipt && <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditingPart(p)}
                      className="rounded p-1 text-slate-400 dark:text-neutral-500 hover:bg-muted hover:text-slate-600 dark:hover:text-neutral-400"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => deletePart.mutate({ id: p.id, pmScheduleAssetId })}
                      className="rounded p-1 text-slate-400 dark:text-neutral-500 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-500 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>}
                </td>
              </tr>
            ))}
          </tbody>
          {(parts ?? []).length > 0 && (
            <tfoot>
              <tr className="border-t border-border bg-muted">
                <td colSpan={3} className="px-4 py-1.5 text-right text-xs font-medium text-slate-600 dark:text-neutral-400">Total</td>
                <td className="px-2 py-1.5 text-right text-xs font-semibold text-slate-800 dark:text-neutral-100">{formatCurrency(total)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      )}

      {canWriteEquipt && <div className="flex justify-end px-3 py-2">
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground hover:text-slate-700 dark:hover:text-neutral-300" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add Part
        </Button>
      </div>}

      <PartDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        pmScheduleAssetId={pmScheduleAssetId}
      />
      <PartDialog
        open={!!editingPart}
        onOpenChange={(v) => { if (!v) setEditingPart(null); }}
        pmScheduleAssetId={pmScheduleAssetId}
        editing={editingPart}
      />
    </div>
  );
}

// ── Asset row ─────────────────────────────────────────────────────────────────

function AssetRow({ pmScheduleAssetId, assetName }: { pmScheduleAssetId: string; assetName: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b last:border-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-slate-800 dark:text-neutral-100 hover:bg-slate-50 dark:hover:bg-muted/40 transition-colors"
      >
        {expanded ? <ChevronDown className="h-4 w-4 text-slate-400 dark:text-neutral-500" /> : <ChevronRight className="h-4 w-4 text-slate-400 dark:text-neutral-500" />}
        {assetName}
      </button>
      {expanded && <AssetPartsSection pmScheduleAssetId={pmScheduleAssetId} />}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function PMScheduleAssetsTab({ pmScheduleId }: PMScheduleAssetsTabProps) {
  const { data: scheduleAssets, isLoading } = usePMScheduleAssets(pmScheduleId);

  if (isLoading) {
    return <div className="p-6 text-sm text-slate-400 dark:text-neutral-500">Loading assets…</div>;
  }

  if (!scheduleAssets || scheduleAssets.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <Package className="h-8 w-8 text-slate-300 dark:text-neutral-500" />
        <p className="text-sm text-muted-foreground">No assets linked yet.</p>
        <p className="text-xs text-slate-400 dark:text-neutral-500">Edit this schedule to add assets.</p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500 bg-slate-50 dark:bg-muted/40 border-b">
        {scheduleAssets.length} {scheduleAssets.length === 1 ? "Asset" : "Assets"} — click to manage parts
      </div>
      {scheduleAssets.map((sa) => (
        <AssetRow
          key={sa.id}
          pmScheduleAssetId={sa.id}
          assetName={sa.assetName}
        />
      ))}
    </div>
  );
}
