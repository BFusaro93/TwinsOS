"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { Plus, Trash2, Check, X, ChevronDown, ChevronRight } from "lucide-react";
import {
  useJobCosting,
  useJobMaterials,
  useAddJobMaterial,
  useDeleteJobMaterial,
} from "@/lib/hooks/use-job-costing";

interface Props {
  jobId: string;
  estimateId?: string | null;
}

function pct(num: number, den: number): number {
  if (den === 0) return 0;
  return Math.round((num / den) * 100 * 10) / 10;
}

function varianceClass(variance: number, isRevenueRow: boolean): string {
  if (variance === 0) return "";
  // For cost rows: negative variance (under budget) = favorable = green
  // For revenue rows: positive variance = favorable = green
  const favorable = isRevenueRow ? variance > 0 : variance < 0;
  return favorable ? "text-green-600 font-medium" : "text-red-600 font-medium";
}

function fmtHrs(h: number): string {
  return h.toFixed(1) + " hrs";
}

function fmtVarianceHrs(est: number, act: number): React.ReactNode {
  const v = act - est;
  const cls = v <= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium";
  const sign = v > 0 ? "+" : "";
  const vPct = est > 0 ? ` (${sign}${pct(v, est)}%)` : "";
  return <span className={cls}>{sign}{v.toFixed(1)} hrs{vPct}</span>;
}

function fmtVarianceCents(est: number, act: number, isRevenue = false): React.ReactNode {
  const v = act - est;
  const cls = varianceClass(v, isRevenue);
  const sign = v > 0 ? "+" : "";
  const vPct = est > 0 ? ` (${sign}${pct(v, est)}%)` : "";
  return <span className={cls}>{sign}{formatCurrency(Math.abs(v))}{vPct}</span>;
}

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, highlight }: {
  label: string;
  value: string;
  sub?: string;
  highlight?: "green" | "red" | "neutral";
}) {
  const valueClass = highlight === "green"
    ? "text-green-600"
    : highlight === "red"
    ? "text-red-600"
    : "text-slate-800";
  return (
    <div className="flex-1 rounded-lg border bg-white p-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{label}</p>
      <p className={cn("text-xl font-bold", valueClass)}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Add Material inline form ───────────────────────────────────────────────────

interface AddMaterialFormProps {
  jobId: string;
  onDone: () => void;
}

function AddMaterialForm({ jobId, onDone }: AddMaterialFormProps) {
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const addMaterial = useAddJobMaterial(jobId);

  async function handleSave() {
    if (!desc.trim()) return;
    try {
      await addMaterial.mutateAsync({
        description: desc.trim(),
        qty: parseFloat(qty) || 1,
        unitCostCents: Math.round((parseFloat(unitCost) || 0) * 100),
      });
      toast.success("Material added");
      onDone();
    } catch {
      toast.error("Failed to add material");
    }
  }

  return (
    <tr className="border-t bg-slate-50">
      <td className="px-3 py-2">
        <Input
          autoFocus
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Description…"
          className="h-7 text-xs"
        />
      </td>
      <td className="px-2 py-2 text-right">
        <Input
          type="number"
          min="0"
          step="0.01"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="h-7 w-20 text-right text-xs ml-auto"
        />
      </td>
      <td className="px-2 py-2 text-right">
        <Input
          type="number"
          min="0"
          step="0.01"
          value={unitCost}
          onChange={(e) => setUnitCost(e.target.value)}
          placeholder="0.00"
          className="h-7 w-24 text-right text-xs ml-auto"
        />
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-xs text-slate-500">
        {unitCost && qty
          ? formatCurrency(Math.round(parseFloat(unitCost) * 100) * (parseFloat(qty) || 1))
          : "—"}
      </td>
      <td className="px-2 py-2">
        <div className="flex justify-end gap-1">
          <button
            onClick={() => void handleSave()}
            disabled={addMaterial.isPending}
            className="rounded p-1 hover:bg-green-50 text-green-600"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDone} className="rounded p-1 hover:bg-slate-100 text-slate-400">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function JobCostingTab({ jobId, estimateId }: Props) {
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [linesExpanded, setLinesExpanded] = useState(false);

  const { data: costing, isLoading } = useJobCosting(jobId, estimateId);
  const { data: materials = [] } = useJobMaterials(jobId);
  const deleteMaterial = useDeleteJobMaterial(jobId);

  async function handleDeleteMaterial(id: string) {
    if (!confirm("Remove this material?")) return;
    try {
      await deleteMaterial.mutateAsync(id);
      toast.success("Material removed");
    } catch {
      toast.error("Failed to remove material");
    }
  }

  if (isLoading || !costing) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-slate-400">
        Loading costing data…
      </div>
    );
  }

  const {
    estimatedLines,
    actualHours,
    actualLaborCostCents,
    actualMaterialCostCents,
    actualTotalCostCents,
    estimatedTotalCents,
    estimatedCostCents,
    estimatedBudgetedHours,
  } = costing;

  // Derived summary values
  const grossProfitCents = estimatedTotalCents - actualTotalCostCents;
  const marginPct = estimatedTotalCents > 0
    ? Math.round((grossProfitCents / estimatedTotalCents) * 1000) / 10
    : 0;

  const profitHighlight = grossProfitCents >= 0 ? "green" as const : "red" as const;
  const marginHighlight = marginPct >= 0 ? "green" as const : "red" as const;

  // Estimated material cost = total estimated cost − estimated labor cost
  // Since we store cost_cents per line item (which is the direct/labor cost),
  // we sum line item cost_cents for estimated labor, rest is material.
  const estimatedLaborCostCents = estimatedLines.reduce((s, l) => s + l.costCents, 0);
  const estimatedMaterialCostCents = Math.max(0, estimatedCostCents - estimatedLaborCostCents);

  return (
    <div className="flex flex-col gap-5">

      {/* ── Summary strip ── */}
      <div className="flex gap-3">
        <SummaryCard
          label="Estimated Revenue"
          value={estimatedTotalCents > 0 ? formatCurrency(estimatedTotalCents) : "—"}
          sub="from estimate"
        />
        <SummaryCard
          label="Actual Cost"
          value={formatCurrency(actualTotalCostCents)}
          sub={`Labor ${formatCurrency(actualLaborCostCents)} + Materials ${formatCurrency(actualMaterialCostCents)}`}
        />
        <SummaryCard
          label="Gross Profit"
          value={estimatedTotalCents > 0 ? formatCurrency(grossProfitCents) : "—"}
          highlight={estimatedTotalCents > 0 ? profitHighlight : "neutral"}
          sub="revenue − actual cost"
        />
        <SummaryCard
          label="Margin %"
          value={estimatedTotalCents > 0 ? `${marginPct.toFixed(1)}%` : "—"}
          highlight={estimatedTotalCents > 0 ? marginHighlight : "neutral"}
          sub="gross profit / revenue"
        />
      </div>

      {/* ── Est vs Actual comparison table ── */}
      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <div className="bg-slate-50 border-b px-4 py-2">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Estimated vs. Actual</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left">Category</th>
              <th className="px-4 py-2.5 text-right">Estimated</th>
              <th className="px-4 py-2.5 text-right">Actual</th>
              <th className="px-4 py-2.5 text-right">Variance</th>
            </tr>
          </thead>
          <tbody>
            {/* Labor Hours */}
            <tr className="border-b">
              <td className="px-4 py-2.5 text-slate-700 font-medium">Labor Hours</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                {estimatedBudgetedHours > 0 ? fmtHrs(estimatedBudgetedHours) : "—"}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-slate-800">
                {fmtHrs(actualHours)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {estimatedBudgetedHours > 0
                  ? fmtVarianceHrs(estimatedBudgetedHours, actualHours)
                  : <span className="text-slate-300">—</span>}
              </td>
            </tr>
            {/* Labor Cost */}
            <tr className="border-b">
              <td className="px-4 py-2.5 text-slate-700 font-medium">Labor Cost</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                {estimatedLaborCostCents > 0 ? formatCurrency(estimatedLaborCostCents) : "—"}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-slate-800">
                {formatCurrency(actualLaborCostCents)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {estimatedLaborCostCents > 0
                  ? fmtVarianceCents(estimatedLaborCostCents, actualLaborCostCents)
                  : <span className="text-slate-300">—</span>}
              </td>
            </tr>
            {/* Material Cost */}
            <tr className="border-b">
              <td className="px-4 py-2.5 text-slate-700 font-medium">Material Cost</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                {estimatedMaterialCostCents > 0 ? formatCurrency(estimatedMaterialCostCents) : "—"}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-slate-800">
                {formatCurrency(actualMaterialCostCents)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {estimatedMaterialCostCents > 0
                  ? fmtVarianceCents(estimatedMaterialCostCents, actualMaterialCostCents)
                  : <span className="text-slate-300">—</span>}
              </td>
            </tr>
            {/* Total Cost */}
            <tr className="border-b bg-slate-50">
              <td className="px-4 py-2.5 text-slate-800 font-semibold">Total Cost</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-700">
                {estimatedCostCents > 0 ? formatCurrency(estimatedCostCents) : "—"}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-900">
                {formatCurrency(actualTotalCostCents)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {estimatedCostCents > 0
                  ? fmtVarianceCents(estimatedCostCents, actualTotalCostCents)
                  : <span className="text-slate-300">—</span>}
              </td>
            </tr>
            {/* Revenue */}
            <tr>
              <td className="px-4 py-2.5 text-slate-700 font-medium">Revenue</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                {estimatedTotalCents > 0 ? formatCurrency(estimatedTotalCents) : "—"}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-slate-400 italic text-xs">
                actual billed separately
              </td>
              <td className="px-4 py-2.5 text-right text-slate-300">—</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Materials section ── */}
      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <div className="bg-slate-50 border-b px-4 py-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Actual Materials Used</p>
          {!addingMaterial && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px] px-2"
              onClick={() => setAddingMaterial(true)}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add Material
            </Button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left">Description</th>
              <th className="px-4 py-2.5 text-right">Qty</th>
              <th className="px-4 py-2.5 text-right">Unit Cost</th>
              <th className="px-4 py-2.5 text-right">Total</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {materials.length === 0 && !addingMaterial && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-sm">
                  No materials recorded yet.
                </td>
              </tr>
            )}
            {materials.map((m) => (
              <tr key={m.id} className="group border-b last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2.5 text-slate-800">
                  <div>{m.description}</div>
                  {m.notes && <div className="text-xs text-slate-400">{m.notes}</div>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{m.qty}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{formatCurrency(m.unitCostCents)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-800">{formatCurrency(m.totalCostCents)}</td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => void handleDeleteMaterial(m.id)}
                    className="opacity-0 group-hover:opacity-100 rounded p-1 hover:bg-red-50 text-slate-300 hover:text-red-500 transition-opacity"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {addingMaterial && (
              <AddMaterialForm
                jobId={jobId}
                onDone={() => setAddingMaterial(false)}
              />
            )}
          </tbody>
          {materials.length > 0 && (
            <tfoot>
              <tr className="border-t bg-slate-50">
                <td colSpan={3} className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Total</td>
                <td className="px-4 py-2 text-right font-bold text-slate-800">
                  {formatCurrency(materials.reduce((s, m) => s + m.totalCostCents, 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Per-line-item breakdown (collapsible) ── */}
      {estimatedLines.length > 0 && (
        <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
          <button
            className="w-full flex items-center gap-2 bg-slate-50 border-b px-4 py-2 text-left"
            onClick={() => setLinesExpanded((v) => !v)}
          >
            {linesExpanded
              ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Per-Service Breakdown ({estimatedLines.length} service{estimatedLines.length !== 1 ? "s" : ""})
            </p>
          </button>
          {linesExpanded && (
            <>
              {estimatedLines.length > 1 && (
                <div className="bg-amber-50 border-b px-4 py-2 text-xs text-amber-700">
                  Note: actual hours are tracked at the job level, not per service. Hours below are estimated only.
                </div>
              )}
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-2.5 text-left">Service</th>
                    <th className="px-4 py-2.5 text-right">Est. Hours</th>
                    <th className="px-4 py-2.5 text-right">Est. Cost</th>
                    <th className="px-4 py-2.5 text-right">Est. Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {estimatedLines.map((line, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-4 py-2.5 text-slate-800 font-medium">{line.serviceName}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                        {line.budgetedHours > 0 ? fmtHrs(line.budgetedHours) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                        {line.costCents > 0 ? formatCurrency(line.costCents) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-800">
                        {formatCurrency(line.revenueCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
