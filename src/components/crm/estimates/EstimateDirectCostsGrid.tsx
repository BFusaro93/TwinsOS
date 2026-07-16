"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { centsToDisplay, computeDirectCostOverhead } from "@/lib/estimate-calc";
import { useUpsertDirectCost, useDeleteDirectCost } from "@/lib/hooks/use-estimates";
import { useOverheadSettings, OVERHEAD_SETTINGS_DEFAULTS, type OverheadSettings } from "@/lib/hooks/use-overhead-settings";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import type { EstimateDirectCost, DirectCostType } from "@/types/crm-estimates";

const COST_TYPE_LABELS: Record<DirectCostType, string> = {
  labor:            "Labor",
  sub_contract:     "Sub Contract",
  service:          "Service",
  product_material: "Product/Material",
  asset_equipment:  "Asset/Equipment",
  other:            "Other",
};

function DirectCostRow({
  item,
  estimateId,
  overheadSettings,
}: {
  item: EstimateDirectCost;
  estimateId: string;
  overheadSettings: OverheadSettings;
}) {
  const [row, setRow] = useState(item);
  const [dirty, setDirty] = useState(false);
  const { mutateAsync: upsert, isPending } = useUpsertDirectCost();
  const { mutateAsync: remove } = useDeleteDirectCost();

  function update<K extends keyof EstimateDirectCost>(key: K, val: EstimateDirectCost[K]) {
    setRow((prev) => {
      const next = { ...prev, [key]: val };
      const totalCents = Math.round(next.qty * next.rateCents);
      const overheadCents = computeDirectCostOverhead(next.costType, totalCents, overheadSettings);
      return { ...next, totalCents, overheadCents };
    });
    setDirty(true);
  }

  async function save() {
    if (!dirty) return;
    try {
      await upsert({
        estimateId,
        item: {
          id: row.id,
          description: row.description,
          cost_type: row.costType,
          qty: row.qty,
          rate_cents: row.rateCents,
          total_cents: row.totalCents,
          overhead_cents: row.overheadCents,
          sort_order: row.sortOrder,
        },
      });
      setDirty(false);
    } catch {
      toast.error("Failed to save cost");
    }
  }

  async function handleDelete() {
    try {
      await remove({ id: row.id, estimateId });
    } catch {
      toast.error("Failed to delete");
    }
  }

  return (
    <tr className="group border-b border-slate-100 text-xs hover:bg-slate-50">
      {/* Description */}
      <td className="min-w-[160px] px-3 py-1.5">
        <input
          value={row.description}
          onChange={(e) => update("description", e.target.value)}
          onBlur={save}
          className="w-full rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs focus:border-brand-400 focus:outline-none"
        />
      </td>

      {/* Type */}
      <td className="px-3 py-1.5">
        <select
          value={row.costType}
          onChange={(e) => { update("costType", e.target.value as DirectCostType); }}
          onBlur={save}
          className="rounded border border-slate-200 bg-white px-1 py-0.5 text-xs focus:outline-none"
        >
          {Object.entries(COST_TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </td>

      {/* Qty */}
      <td className="w-14 px-3 py-1.5">
        <input
          type="number"
          value={row.qty}
          onChange={(e) => update("qty", Number(e.target.value) || 0)}
          onBlur={save}
          className="w-full rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs focus:outline-none"
        />
      </td>

      {/* Rate */}
      <td className="w-20 px-3 py-1.5">
        <input
          type="number"
          value={row.rateCents / 100}
          onChange={(e) => update("rateCents", Math.round((Number(e.target.value) || 0) * 100))}
          onBlur={save}
          className="w-full rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs focus:outline-none"
        />
      </td>

      {/* Total */}
      <td className="w-20 px-3 py-1.5 text-right tabular-nums text-slate-700">
        {centsToDisplay(row.totalCents)}
      </td>

      {/* Overhead */}
      <td className="w-20 px-3 py-1.5 text-right tabular-nums text-slate-500">
        {centsToDisplay(row.overheadCents)}
      </td>

      {/* Actions */}
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
          <button
            onClick={handleDelete}
            className="rounded p-0.5 text-slate-400 hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        {isPending && <span className="text-[10px] text-slate-400">…</span>}
        {dirty && !isPending && (
          <button onClick={save} className="text-[10px] font-medium text-brand-500 hover:underline">
            save
          </button>
        )}
      </td>
    </tr>
  );
}

export function EstimateDirectCostsGrid({
  estimateId,
  items,
}: {
  estimateId: string;
  items: EstimateDirectCost[];
}) {
  const { mutateAsync: upsert } = useUpsertDirectCost();
  const { data: overheadSettings = OVERHEAD_SETTINGS_DEFAULTS } = useOverheadSettings();

  async function addItem() {
    try {
      await upsert({
        estimateId,
        item: {
          description: "New Cost",
          cost_type: "other",
          qty: 1,
          rate_cents: 0,
          total_cents: 0,
          overhead_cents: 0,
          sort_order: items.length,
        },
      });
    } catch {
      toast.error("Failed to add cost");
    }
  }

  const totalCents = items.reduce((s, i) => s + i.totalCents, 0);
  const totalOverhead = items.reduce((s, i) => s + i.overheadCents, 0);

  return (
    <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
      <table className="w-full min-w-[600px] text-xs">
        <thead className="bg-slate-200">
          <tr className="text-left font-semibold text-slate-600">
            <th className="px-3 py-2">Direct Costs</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Qty</th>
            <th className="px-3 py-2">Rate</th>
            <th className="px-3 py-2 text-right">Total</th>
            <th className="px-3 py-2 text-right">Overhead</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <DirectCostRow key={item.id} item={item} estimateId={estimateId} overheadSettings={overheadSettings} />
          ))}
          {/* totals row */}
          <tr className="border-t bg-slate-50 text-xs font-semibold text-slate-600">
            <td className="px-3 py-1.5" colSpan={4} />
            <td className="px-3 py-1.5 text-right tabular-nums">{centsToDisplay(totalCents)}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{centsToDisplay(totalOverhead)}</td>
            <td />
          </tr>
        </tbody>
      </table>
      <div className="border-t p-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-slate-500 hover:text-slate-800"
          onClick={addItem}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add Item
        </Button>
      </div>
    </div>
  );
}
