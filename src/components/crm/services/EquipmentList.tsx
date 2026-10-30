"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatCurrency } from "@/lib/utils";
import {
  EQUIPMENT_UNIT_LABELS,
  useDeleteEquipment,
  useEquipment,
  useUpsertEquipment,
  type Equipment,
  type EquipmentUnit,
} from "@/lib/hooks/use-equipment";

/**
 * Equipment catalog — machines priced as an internal COST, not sold as services.
 * Attach one to an estimate line (expand the line → Add Equipment) and its
 * qty × rate rolls into that line's cost, margin and overhead. Never shown to
 * the client.
 */

interface Draft {
  id?: string;
  name: string;
  description: string;
  rate: string;
  /** Blank = no markup (charge equals cost). */
  charge: string;
  unit: EquipmentUnit;
}

const EMPTY: Draft = { name: "", description: "", rate: "", charge: "", unit: "day" };

function dollarsToCents(v: string): number {
  return Math.max(0, Math.round((Number(v) || 0) * 100));
}

/** "$100.00 · 20.0%" — margin of charge over cost, as a share of the charge. */
function marginLabel(costCents: number, chargeCents: number): string {
  const margin = chargeCents - costCents;
  const pct = chargeCents > 0 ? ((margin / chargeCents) * 100).toFixed(1) : "0.0";
  return `${formatCurrency(margin)} · ${pct}%`;
}

export function EquipmentList() {
  const { data: equipment = [], isLoading } = useEquipment();
  const { mutateAsync: upsert, isPending } = useUpsertEquipment();
  const { mutateAsync: remove } = useDeleteEquipment();
  const [draft, setDraft] = useState<Draft | null>(null);

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      await upsert({
        id: draft.id,
        name: draft.name,
        description: draft.description,
        rateCents: dollarsToCents(draft.rate),
        chargeRateCents: draft.charge.trim() === "" ? null : dollarsToCents(draft.charge),
        unit: draft.unit,
      });
      setDraft(null);
    } catch {
      toast.error("Failed to save equipment");
    }
  }

  async function handleDelete(e: Equipment) {
    if (!window.confirm(`Remove ${e.name}? Estimates that already use it keep their snapshot.`)) return;
    try {
      await remove(e.id);
    } catch {
      toast.error("Failed to remove equipment");
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Machines are an internal cost of delivering a service. Enter what the machine costs you and, if you mark it
          up, what you charge. The margin is the difference. Attach equipment to an estimate line and its cost rolls
          into that line&apos;s cost and margin. The client only ever sees the line&apos;s price.
        </p>
        <Button size="sm" onClick={() => setDraft({ ...EMPTY })}>
          <Plus className="mr-1 h-4 w-4" />
          Add Equipment
        </Button>
      </div>

      {draft && (
        <div className="mb-4 grid gap-3 rounded-lg border bg-card p-4 shadow-sm sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
          <label className="text-xs text-muted-foreground">
            Name
            <input
              autoFocus
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Mini Excavator"
              className="mt-1 w-full rounded border border-border bg-card px-2 py-1.5 text-sm text-foreground focus:outline-none"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Cost rate ($)
            <input
              type="number"
              min={0}
              step="0.01"
              value={draft.rate}
              onChange={(e) => setDraft({ ...draft, rate: e.target.value })}
              placeholder="400.00"
              className="mt-1 w-full rounded border border-border bg-card px-2 py-1.5 text-right text-sm text-foreground focus:outline-none"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Charge rate ($)
            <input
              type="number"
              min={0}
              step="0.01"
              value={draft.charge}
              onChange={(e) => setDraft({ ...draft, charge: e.target.value })}
              placeholder="500.00"
              className="mt-1 w-full rounded border border-border bg-card px-2 py-1.5 text-right text-sm text-foreground focus:outline-none"
            />
            <span className="mt-1 block text-[11px]">
              {draft.charge.trim() !== "" && dollarsToCents(draft.rate) > 0
                ? `Margin ${marginLabel(dollarsToCents(draft.rate), dollarsToCents(draft.charge))}`
                : "Blank = no markup"}
            </span>
          </label>
          <label className="text-xs text-muted-foreground">
            Charged
            <select
              value={draft.unit}
              onChange={(e) => setDraft({ ...draft, unit: e.target.value as EquipmentUnit })}
              className="mt-1 w-full rounded border border-border bg-card px-2 py-1.5 text-sm text-foreground focus:outline-none"
            >
              {Object.entries(EQUIPMENT_UNIT_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <Button size="sm" onClick={save} disabled={isPending}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
          <label className="text-xs text-muted-foreground sm:col-span-5">
            Notes (internal)
            <input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="Fuel, depreciation and maintenance included"
              className="mt-1 w-full rounded border border-border bg-card px-2 py-1.5 text-sm text-foreground focus:outline-none"
            />
          </label>
        </div>
      )}

      {!isLoading && equipment.length === 0 && !draft ? (
        <EmptyState
          icon={Wrench}
          title="No equipment yet"
          description="Add your machines (mini ex, skid steer, Dingo) with a cost rate, then attach them to estimate lines."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-200 dark:bg-neutral-700">
              <tr className="text-left text-xs font-semibold text-slate-600 dark:text-neutral-400">
                <th className="px-4 py-2">Equipment</th>
                <th className="px-4 py-2 text-right">Cost rate</th>
                <th className="px-4 py-2 text-right">Charge rate</th>
                <th className="px-4 py-2 text-right">Margin</th>
                <th className="px-4 py-2">Charged</th>
                <th className="px-4 py-2">Notes</th>
                <th className="w-20 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {equipment.map((e) => (
                <tr key={e.id} className="group border-b border-slate-100 last:border-0 dark:border-neutral-800">
                  <td className="px-4 py-2 font-medium">{e.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(e.rateCents)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {e.chargeRateCents == null ? <span className="text-muted-foreground">—</span> : formatCurrency(e.chargeRateCents)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {e.chargeRateCents == null ? "—" : marginLabel(e.rateCents, e.chargeRateCents)}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{EQUIPMENT_UNIT_LABELS[e.unit]}</td>
                  <td className="px-4 py-2 text-muted-foreground">{e.description ?? ""}</td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
                      <button
                        title="Edit"
                        onClick={() =>
                          setDraft({
                            id: e.id,
                            name: e.name,
                            description: e.description ?? "",
                            rate: (e.rateCents / 100).toFixed(2),
                            charge: e.chargeRateCents == null ? "" : (e.chargeRateCents / 100).toFixed(2),
                            unit: e.unit,
                          })
                        }
                        className="rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-neutral-300"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Remove"
                        onClick={() => handleDelete(e)}
                        className="rounded p-1 text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
