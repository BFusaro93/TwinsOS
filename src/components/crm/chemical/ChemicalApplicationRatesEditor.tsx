"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  useChemicalApplicationRates,
  useChemicalLookupItems,
  useChemicalSettings,
  useSaveChemicalApplicationRates,
} from "@/lib/hooks/use-chemical-tracking";

interface RateRow {
  applicationMethodId: string | null;
  rateQty: string;
  unitOfMeasureId: string | null;
  areaQty: string;
  areaUnitId: string | null;
  productCost: string;
  isDefault: boolean;
}

function emptyRow(isDefault: boolean, defaultUnitId: string | null, prevAreaUnitId: string | null): RateRow {
  return {
    applicationMethodId: null,
    rateQty: "",
    unitOfMeasureId: defaultUnitId,
    areaQty: "",
    areaUnitId: prevAreaUnitId,
    productCost: "",
    isDefault,
  };
}

/** Application-rate manager for a chemical-tracking product — lives on the
 *  product's detail sheet since rates need an existing product id. */
export function ChemicalApplicationRatesEditor({ productId }: { productId: string }) {
  const { data: rates, isLoading } = useChemicalApplicationRates(productId);
  const { data: methods = [] } = useChemicalLookupItems("application_method");
  const { data: volumeUnits = [] } = useChemicalLookupItems("volume_unit");
  const { data: areaUnits = [] } = useChemicalLookupItems("area_unit");
  const { data: settings } = useChemicalSettings();
  const saveRates = useSaveChemicalApplicationRates();

  const [rows, setRows] = useState<RateRow[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!rates) return;
    setRows(
      rates.length > 0
        ? rates.map((r) => ({
            applicationMethodId: r.applicationMethodId,
            rateQty: r.rateQty !== null ? String(r.rateQty) : "",
            unitOfMeasureId: r.unitOfMeasureId,
            areaQty: r.areaQty !== null ? String(r.areaQty) : "",
            areaUnitId: r.areaUnitId,
            productCost: r.productCostCents ? (r.productCostCents / 100).toFixed(2) : "",
            isDefault: r.isDefault,
          }))
        : []
    );
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rates?.length, productId]);

  function updateRow(i: number, patch: Partial<RateRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setDirty(true);
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      emptyRow(
        prev.length === 0,
        settings?.defaultUnitOfMeasureId ?? null,
        prev[prev.length - 1]?.areaUnitId ?? null
      ),
    ]);
    setDirty(true);
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
    setDirty(true);
  }

  function handleSave() {
    saveRates.mutate(
      {
        productId,
        rates: rows.map((r) => ({
          applicationMethodId: r.applicationMethodId,
          rateQty: r.rateQty ? parseFloat(r.rateQty) : null,
          unitOfMeasureId: r.unitOfMeasureId,
          areaQty: r.areaQty ? parseFloat(r.areaQty) : null,
          areaUnitId: r.areaUnitId,
          productCostCents: r.productCost ? Math.round(parseFloat(r.productCost) * 100) : 0,
          isDefault: r.isDefault,
        })),
      },
      { onSuccess: () => setDirty(false) }
    );
  }

  if (isLoading) return <p className="text-sm text-slate-400">Loading application rates…</p>;

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 && (
        <p className="text-sm text-slate-400">
          No application rates yet. Add one to define how much of this chemical to use per area.
        </p>
      )}
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 rounded-md border p-2.5">
          <div className="col-span-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={row.isDefault}
                onCheckedChange={(checked) =>
                  setRows((prev) =>
                    prev.map((r, idx) => ({ ...r, isDefault: idx === i ? checked === true : false }))
                  )
                }
              />
              <span className="text-xs text-slate-500">Default rate</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-slate-400 hover:text-red-500"
              onClick={() => removeRow(i)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="grid gap-1">
            <label className="text-xs text-slate-500">Application Method</label>
            <Select
              value={row.applicationMethodId ?? "none"}
              onValueChange={(v) => updateRow(i, { applicationMethodId: v === "none" ? null : v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {methods.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1">
            <label className="text-xs text-slate-500">Product Cost ($)</label>
            <Input
              className="h-8 text-xs"
              type="number"
              step="any"
              value={row.productCost}
              onChange={(e) => updateRow(i, { productCost: e.target.value })}
              placeholder="0.00"
            />
          </div>

          <div className="grid gap-1">
            <label className="text-xs text-slate-500">Applied</label>
            <div className="flex gap-1">
              <Input
                className="h-8 text-xs"
                type="number"
                step="any"
                value={row.rateQty}
                onChange={(e) => updateRow(i, { rateQty: e.target.value })}
                placeholder="Qty"
              />
              <Select
                value={row.unitOfMeasureId ?? "none"}
                onValueChange={(v) => updateRow(i, { unitOfMeasureId: v === "none" ? null : v })}
              >
                <SelectTrigger className="h-8 w-24 text-xs">
                  <SelectValue placeholder="Unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {volumeUnits.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1">
            <label className="text-xs text-slate-500">Area</label>
            <div className="flex gap-1">
              <Input
                className="h-8 text-xs"
                type="number"
                step="any"
                value={row.areaQty}
                onChange={(e) => updateRow(i, { areaQty: e.target.value })}
                placeholder="Qty"
              />
              <Select
                value={row.areaUnitId ?? "none"}
                onValueChange={(v) => updateRow(i, { areaUnitId: v === "none" ? null : v })}
              >
                <SelectTrigger className="h-8 w-24 text-xs">
                  <SelectValue placeholder="Unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {areaUnits.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {row.rateQty && row.productCost && (
            <p className="col-span-2 text-xs text-slate-400">
              {formatCurrency(Math.round(parseFloat(row.productCost) * 100 * parseFloat(row.rateQty || "0")))} for{" "}
              {row.rateQty} unit(s)
            </p>
          )}
        </div>
      ))}

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1">
          <Plus className="h-3.5 w-3.5" /> Add Application Rate
        </Button>
        {dirty && (
          <Button type="button" size="sm" onClick={handleSave} disabled={saveRates.isPending}>
            {saveRates.isPending ? "Saving…" : "Save Rates"}
          </Button>
        )}
      </div>
    </div>
  );
}
