"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import {
  EQUIPMENT_UNIT_LABELS,
  useEquipment,
  useSaveServiceEquipment,
  useServiceEquipment,
} from "@/lib/hooks/use-equipment";

/**
 * Default equipment for a service. When this service is added to an estimate,
 * these machines are pre-filled on the new line as internal cost rows — staff
 * can still change the quantity (e.g. 2 days instead of 1) on that estimate.
 */
export function ServiceEquipmentTab({ serviceId }: { serviceId: string }) {
  const { data: defaults = [] } = useServiceEquipment(serviceId);
  const { data: catalog = [] } = useEquipment();
  const { mutateAsync: save } = useSaveServiceEquipment();
  const [adding, setAdding] = useState("");

  const linkable = catalog.filter((e) => e.isActive && !defaults.some((d) => d.equipmentId === e.id));

  async function run(p: Parameters<typeof save>[0]) {
    try {
      await save(p);
    } catch {
      toast.error("Failed to save equipment");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Machines attached here are pre-filled on the estimate line whenever this service is added, as an internal
        cost — the client never sees them. The quantity (days or hours) can still be changed on each estimate.
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-slate-200 dark:bg-neutral-700">
            <tr className="text-left text-xs font-semibold text-slate-600 dark:text-neutral-400">
              <th className="px-3 py-2">Equipment</th>
              <th className="px-3 py-2">Cost rate</th>
              <th className="w-28 px-3 py-2 text-right">Default qty</th>
              <th className="w-10 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {defaults.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No default equipment.
                </td>
              </tr>
            )}
            {defaults.map((d) => {
              const eq = catalog.find((e) => e.id === d.equipmentId);
              return (
                <tr key={d.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{eq?.name ?? "(removed)"}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {eq ? `${formatCurrency(eq.rateCents)} ${EQUIPMENT_UNIT_LABELS[eq.unit]}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      defaultValue={d.defaultQty}
                      onBlur={(e) => {
                        const qty = Math.max(0, Number(e.target.value) || 0);
                        if (qty !== d.defaultQty) void run({ serviceId, id: d.id, defaultQty: qty });
                      }}
                      className="w-20 rounded border border-border bg-card px-1.5 py-0.5 text-right tabular-nums focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      title="Remove"
                      onClick={() => void run({ serviceId, id: d.id, remove: true })}
                      className="rounded p-0.5 text-red-400 hover:text-red-600"
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

      <div className="flex items-center gap-2">
        <select
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          className="rounded border border-border bg-card px-2 py-1.5 text-sm focus:outline-none"
          aria-label="Equipment to add"
        >
          <option value="">{catalog.length === 0 ? "No equipment in catalog yet" : "Select equipment…"}</option>
          {linkable.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} — {formatCurrency(e.rateCents)} {EQUIPMENT_UNIT_LABELS[e.unit]}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={!adding}
          onClick={async () => {
            await run({ serviceId, equipmentId: adding, defaultQty: 1 });
            setAdding("");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
