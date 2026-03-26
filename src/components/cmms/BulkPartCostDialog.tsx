"use client";

import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils";
import { useBulkUpdateParts } from "@/lib/hooks/use-parts";
import { useSettingsStore } from "@/stores/settings-store";
import type { Part } from "@/types";

interface DraftRow {
  id: string;
  name: string;
  partNumber: string;
  vendorName: string;
  unitCost: string; // dollars, user-editable
  origUnitCost: number; // cents, for dirty detection
}

interface BulkPartCostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parts: Part[];
}

export function BulkPartCostDialog({
  open,
  onOpenChange,
  parts,
}: BulkPartCostDialogProps) {
  const { mutate: bulkUpdate, isPending: saving } = useBulkUpdateParts();
  const { costMethod } = useSettingsStore();

  const [rows, setRows] = useState<DraftRow[]>([]);
  const [search, setSearch] = useState("");
  const [adjustPct, setAdjustPct] = useState("");
  const [adjustTarget] = useState<"unitCost">("unitCost");

  useEffect(() => {
    if (!open) return;
    setRows(
      parts.map((p) => ({
        id: p.id,
        name: p.name,
        partNumber: p.partNumber,
        vendorName: p.vendorName ?? "",
        unitCost: (p.unitCost / 100).toFixed(2),
        origUnitCost: p.unitCost,
      }))
    );
    setSearch("");
    setAdjustPct("");
  }, [open, parts]);

  const filtered = rows.filter(
    (r) =>
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.partNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.vendorName.toLowerCase().includes(search.toLowerCase())
  );

  const dirtyCount = rows.filter((r) => {
    const newCost = Math.round((parseFloat(r.unitCost) || 0) * 100);
    return newCost !== r.origUnitCost;
  }).length;

  function setRowCost(id: string, value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, unitCost: value } : r)));
  }

  function applyAdjustment() {
    const pct = parseFloat(adjustPct);
    if (isNaN(pct)) return;
    const mult = 1 + pct / 100;
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        unitCost: ((parseFloat(r.unitCost) || 0) * mult).toFixed(2),
      }))
    );
    setAdjustPct("");
  }

  function handleSave() {
    const updates = rows
      .map((r) => ({
        id: r.id,
        unitCost: Math.round((parseFloat(r.unitCost) || 0) * 100),
      }))
      .filter((u, i) => u.unitCost !== rows[i].origUnitCost);

    if (updates.length === 0) {
      onOpenChange(false);
      return;
    }

    bulkUpdate(updates, {
      onSuccess: () => {
        onOpenChange(false);
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Bulk Update Part Costs</DialogTitle>
          <DialogDescription>
            Edit unit costs for multiple parts at once.
            {costMethod !== "manual" && (
              <span className="ml-1 text-amber-600">
                WAC/FIFO is active — received-goods costs take precedence over
                this manual fallback.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Quick % adjust */}
        <div className="rounded-md border bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">
            Quick % Adjust (applies to all visible rows)
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.1"
              placeholder="e.g. 5 for +5%, -3 for -3%"
              value={adjustPct}
              onChange={(e) => setAdjustPct(e.target.value)}
              className="h-8 w-52 text-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={applyAdjustment}
              disabled={!adjustPct}
            >
              Apply to Unit Cost
            </Button>
          </div>
        </div>

        <Separator />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search parts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-sm"
          />
        </div>

        {/* Table */}
        <div className="max-h-[45vh] overflow-y-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="px-3 py-2 font-medium">Part</th>
                <th className="px-3 py-2 font-medium">Part #</th>
                <th className="px-3 py-2 font-medium">Vendor</th>
                <th className="w-40 px-3 py-2 font-medium">Unit Cost ($)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const costChanged =
                  Math.round((parseFloat(r.unitCost) || 0) * 100) !== r.origUnitCost;
                return (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-900">{r.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{r.partNumber}</td>
                    <td className="px-3 py-2 text-slate-500">{r.vendorName || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={r.unitCost}
                          onChange={(e) => setRowCost(r.id, e.target.value)}
                          className={`h-7 w-28 text-xs ${costChanged ? "border-brand-400 bg-brand-50" : ""}`}
                        />
                        {costChanged && (
                          <span className="text-[10px] text-slate-400">
                            was {formatCurrency(r.origUnitCost)}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-sm text-slate-400">
                    No parts match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter className="items-center">
          {dirtyCount > 0 && (
            <p className="mr-auto text-xs text-slate-500">
              {dirtyCount} part{dirtyCount !== 1 ? "s" : ""} modified
            </p>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving
              ? "Saving…"
              : dirtyCount > 0
              ? `Save Changes (${dirtyCount})`
              : "No Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
