"use client";

import { useState } from "react";
import { EyeOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { centsToDisplay, bpsToPercent } from "@/lib/estimate-calc";
import {
  EQUIPMENT_UNIT_LABELS,
  effectiveChargeCents,
  useDeleteLineEquipment,
  useEquipment,
  useLineItemEquipment,
  useUpsertLineEquipment,
  type LineItemEquipment,
} from "@/lib/hooks/use-equipment";

/**
 * Internal equipment cost under an estimate line. Never rendered on the
 * proposal, PDF, portal or invoice — it only moves the line's cost and margin.
 * Name/unit/rate are a snapshot of the catalog entry, so editing a rate in
 * Settings never rewrites an estimate that was already priced.
 */

function EquipmentRow({ row, lineItemId }: { row: LineItemEquipment; lineItemId: string }) {
  const [qty, setQty] = useState(String(row.qty));
  const [rate, setRate] = useState((row.rateCents / 100).toFixed(2));
  const { mutateAsync: upsert } = useUpsertLineEquipment();
  const { mutateAsync: remove } = useDeleteLineEquipment();

  async function save() {
    const nextQty = Math.max(0, Number(qty) || 0);
    const nextRate = Math.max(0, Math.round((Number(rate) || 0) * 100));
    if (nextQty === row.qty && nextRate === row.rateCents) return;
    try {
      await upsert({
        lineItemId,
        item: {
          id: row.id,
          equipmentId: row.equipmentId,
          name: row.name,
          unit: row.unit,
          qty: nextQty,
          rateCents: nextRate,
          chargeRateCents: row.chargeRateCents,
          sortOrder: row.sortOrder,
        },
      });
    } catch {
      toast.error("Failed to save equipment");
    }
  }

  async function handleDelete() {
    try {
      await remove({ id: row.id, lineItemId });
    } catch {
      toast.error("Failed to remove equipment");
    }
  }

  // Snapshot charge rate × qty; with no markup set, the charge is just the cost.
  const chargeCents = Math.round(row.qty * effectiveChargeCents(row.rateCents, row.chargeRateCents));
  const unitWord = row.unit === "hour" ? "hrs" : row.unit === "day" ? "days" : "×";

  return (
    <tr className="group border-b border-slate-50 dark:border-neutral-800 bg-amber-50/40 dark:bg-muted/40 text-[11px]">
      <td colSpan={17} className="border-l-2 border-amber-400 dark:border-amber-600 py-1 pl-8 pr-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="min-w-[160px] font-medium text-slate-700 dark:text-neutral-300">{row.name}</span>
          <span className="rounded bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 text-[10px] text-amber-700 dark:text-amber-400">
            Equipment
          </span>
          <label className="flex items-center gap-1 text-muted-foreground">
            <input
              type="number"
              min={0}
              step="0.5"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onBlur={save}
              className="w-16 rounded border border-border bg-card px-1.5 py-0.5 text-right tabular-nums text-xs focus:outline-none"
            />
            {unitWord}
          </label>
          <label className="flex items-center gap-1 text-muted-foreground">
            $
            <input
              type="number"
              min={0}
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              onBlur={save}
              className="w-20 rounded border border-border bg-card px-1.5 py-0.5 text-right tabular-nums text-xs focus:outline-none"
            />
            {EQUIPMENT_UNIT_LABELS[row.unit]}
          </label>
          <span className="tabular-nums font-medium text-slate-700 dark:text-neutral-300" title="Internal cost = qty × rate">
            {centsToDisplay(row.totalCostCents)}
          </span>
          {chargeCents !== row.totalCostCents && (
            <span
              className="tabular-nums text-muted-foreground"
              title={`Charge ${centsToDisplay(chargeCents)} − cost ${centsToDisplay(row.totalCostCents)}`}
            >
              charge {centsToDisplay(chargeCents)} · margin {centsToDisplay(chargeCents - row.totalCostCents)}
            </span>
          )}
          <button
            onClick={handleDelete}
            title="Remove"
            className="rounded p-0.5 text-red-400 opacity-100 transition-opacity hover:text-red-600 lg:opacity-0 lg:group-hover:opacity-100 dark:hover:text-red-400"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export function LineItemEquipmentRows({
  lineItemId,
  revenueCents,
  lineCostCents,
}: {
  lineItemId: string;
  /** The line's total, the same basis the grid's GM% column uses. */
  revenueCents: number;
  /** The line's own modeled cost (labor/production rate), before equipment. */
  lineCostCents: number;
}) {
  const { data: rows = [] } = useLineItemEquipment(lineItemId);
  const { data: catalog = [] } = useEquipment();
  const { mutateAsync: upsert } = useUpsertLineEquipment();
  const [picking, setPicking] = useState("");

  const active = catalog.filter((e) => e.isActive);
  const equipmentCostCents = rows.reduce((s, r) => s + r.totalCostCents, 0);
  const equipmentChargeCents = rows.reduce(
    (s, r) => s + Math.round(r.qty * effectiveChargeCents(r.rateCents, r.chargeRateCents)),
    0
  );

  async function add(equipmentId: string) {
    const eq = catalog.find((e) => e.id === equipmentId);
    if (!eq) return;
    try {
      await upsert({
        lineItemId,
        item: {
          equipmentId: eq.id,
          name: eq.name,
          unit: eq.unit,
          qty: 1,
          rateCents: eq.rateCents,
          chargeRateCents: eq.chargeRateCents,
          sortOrder: rows.length,
        },
      });
    } catch {
      toast.error("Failed to add equipment");
    } finally {
      setPicking("");
    }
  }

  // Margin if the equipment cost is counted against this line. Display-only.
  const marginAfterBps =
    revenueCents > 0
      ? Math.round(((revenueCents - lineCostCents - equipmentCostCents) / revenueCents) * 10000)
      : 0;

  return (
    <>
      {rows.map((r) => (
        <EquipmentRow key={r.id} row={r} lineItemId={lineItemId} />
      ))}
      <tr className="border-b border-slate-100 dark:border-neutral-800 bg-amber-50/30 dark:bg-muted/40">
        <td colSpan={17} className="px-8 py-1">
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <select
              value={picking}
              onChange={(e) => e.target.value && add(e.target.value)}
              className="rounded border border-border bg-card px-1.5 py-0.5 text-[11px] text-brand-600 dark:text-brand-400 focus:outline-none"
              aria-label="Add equipment"
            >
              <option value="">
                {active.length === 0 ? "No equipment in catalog (Settings → Services)" : "+ Add Equipment"}
              </option>
              {active.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} — cost ${(e.rateCents / 100).toFixed(2)}
                  {e.chargeRateCents != null ? ` / charge $${(e.chargeRateCents / 100).toFixed(2)}` : ""} {EQUIPMENT_UNIT_LABELS[e.unit]}
                </option>
              ))}
            </select>
            <span className="flex items-center gap-1 text-muted-foreground">
              <EyeOff className="h-3 w-3" /> Internal cost — not shown to the client
            </span>
            {rows.length > 0 && (
              <span className="tabular-nums text-muted-foreground">
                Equipment cost {centsToDisplay(equipmentCostCents)}
                {equipmentChargeCents !== equipmentCostCents && (
                  <> · charge {centsToDisplay(equipmentChargeCents)} (line price should cover it)</>
                )}{" "}
                · margin after equipment{" "}
                <span
                  className={
                    marginAfterBps >= 3000
                      ? "font-medium text-green-600 dark:text-green-400"
                      : marginAfterBps >= 1000
                        ? "font-medium"
                        : "font-medium text-red-500 dark:text-red-400"
                  }
                >
                  {bpsToPercent(marginAfterBps)}
                </span>
              </span>
            )}
          </div>
        </td>
      </tr>
    </>
  );
}
