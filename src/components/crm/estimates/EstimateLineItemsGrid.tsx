"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { bpsToPercent, centsToDisplay, computeLineItem } from "@/lib/estimate-calc";
import { useUpsertLineItem, useDeleteLineItem } from "@/lib/hooks/use-estimates";
import { useCRMServices } from "@/lib/hooks/use-crm-jobs";
import { useOrgSettings } from "@/lib/hooks/use-org-settings";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Trash2, Copy, Plus, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import type { EstimateLineItem, LineItemStatus } from "@/types/crm-estimates";

const UNIT_TYPES = ["sqft", "lf", "cuyd", "acres", "hr", "each", "lb", "gal"];

// ── small inline input ────────────────────────────────────────────────────────

function InlineNum({
  value,
  onChange,
  onBlur,
  className,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  onBlur?: () => void;
  className?: string;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value || ""}
      step={step ?? "any"}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      onBlur={onBlur}
      className={cn(
        "w-full rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs focus:border-brand-400 focus:outline-none",
        className
      )}
    />
  );
}

// ── status badge / selector ───────────────────────────────────────────────────

const STATUS_COLOR: Record<LineItemStatus, string> = {
  quote:  "bg-blue-100 text-blue-700",
  draft:  "bg-slate-100 text-slate-600",
  won:    "bg-green-100 text-green-700",
  lost:   "bg-red-100 text-red-600",
};

// ── single editable row ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface RowState extends EstimateLineItem {}

function LineItemRow({
  item,
  estimateId,
  onDelete,
  onDuplicate,
}: {
  item: EstimateLineItem;
  estimateId: string;
  onDelete: (id: string) => void;
  onDuplicate: (item: EstimateLineItem) => void;
}) {
  const [row, setRow] = useState<RowState>(() => item);
  const [dirty, setDirty] = useState(false);
  const { mutateAsync: upsert, isPending } = useUpsertLineItem();

  function update<K extends keyof RowState>(key: K, val: RowState[K]) {
    setRow((prev) => {
      const next = { ...prev, [key]: val };
      const computed = computeLineItem(next);
      return { ...next, ...computed };
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
          service_id: row.serviceId,
          service_name: row.serviceName,
          status: row.status,
          calc_type: row.calcType,
          qty: row.qty,
          unit_type: row.unitType,
          production_rate_sqft_per_hr: row.productionRateSqftPerHr,
          rate_cents: row.rateCents,
          visits: row.visits,
          total_cents: row.totalCents,
          budgeted_hours: row.budgetedHours,
          total_budgeted_hours: row.totalBudgetedHours,
          cost_cents: row.costCents,
          total_cost_cents: row.totalCostCents,
          margin_bps: row.marginBps,
          markup_bps: row.markupBps,
          adj_rate_cents: row.adjRateCents,
          sort_order: row.sortOrder,
        },
      });
      setDirty(false);
    } catch {
      toast.error("Failed to save line item");
    }
  }

  // Is budgeted hours auto-calculated (production rate active)?
  const isAutoHrs =
    !!row.productionRateSqftPerHr &&
    row.productionRateSqftPerHr > 0 &&
    row.unitType !== "hr" &&
    row.unitType !== "each";

  return (
    <>
      {/* ── main row ──────────────────────────────────────────────────────── */}
      <tr className="group border-b border-slate-100 bg-white text-xs hover:bg-slate-50">
        {/* Status */}
        <td className="px-2 py-1.5">
          <select
            value={row.status}
            onChange={(e) => update("status", e.target.value as LineItemStatus)}
            onBlur={save}
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium focus:outline-none",
              STATUS_COLOR[row.status]
            )}
          >
            <option value="quote">Quote</option>
            <option value="draft">Draft</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>
        </td>

        {/* Service name */}
        <td className="min-w-[160px] px-2 py-1.5 font-semibold text-slate-900">
          {row.serviceName}
        </td>

        {/* OCC (Visits) */}
        <td className="w-12 px-2 py-1.5">
          <InlineNum
            value={row.visits}
            onChange={(v) => update("visits", v)}
            onBlur={save}
            step={1}
          />
        </td>

        {/* QTY */}
        <td className="w-20 px-2 py-1.5">
          <InlineNum
            value={row.qty}
            onChange={(v) => update("qty", v)}
            onBlur={save}
          />
        </td>

        {/* Unit */}
        <td className="w-16 px-2 py-1.5">
          <select
            value={row.unitType ?? ""}
            onChange={(e) => update("unitType", e.target.value || null)}
            onBlur={save}
            className="w-full rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] focus:outline-none"
          >
            <option value="">—</option>
            {UNIT_TYPES.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </td>

        {/* P/H — hours per occurrence. Auto-calc shown in blue if production rate is active */}
        <td className="w-14 px-2 py-1.5 text-right tabular-nums">
          {isAutoHrs ? (
            <span className="text-blue-600 font-medium">{row.budgetedHours.toFixed(2)}</span>
          ) : (
            <InlineNum
              value={row.budgetedHours}
              onChange={(v) => update("budgetedHours", v)}
              onBlur={save}
            />
          )}
        </td>

        {/* T.H. — total hours = P/H × OCC */}
        <td className="w-14 px-2 py-1.5 text-right tabular-nums text-slate-500">
          {row.totalBudgetedHours.toFixed(2)}
        </td>

        {/* Calc type */}
        <td className="w-12 px-2 py-1.5 text-center">
          <select
            value={row.calcType}
            onChange={(e) => update("calcType", Number(e.target.value) as 0 | 1)}
            onBlur={save}
            className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] focus:outline-none"
          >
            <option value={1}>×</option>
            <option value={0}>$</option>
          </select>
        </td>

        {/* Rate (P/P — price per occurrence) */}
        <td className="w-20 px-2 py-1.5">
          <InlineNum
            value={row.rateCents / 100}
            onChange={(v) => update("rateCents", Math.round(v * 100))}
            onBlur={save}
          />
        </td>

        {/* Total (TP) */}
        <td className="w-20 px-2 py-1.5 text-right tabular-nums font-medium text-slate-700">
          {centsToDisplay(row.totalCents)}
        </td>

        {/* GM% */}
        <td className={cn(
          "w-16 px-2 py-1.5 text-right tabular-nums",
          row.marginBps >= 3000 ? "text-green-600" : row.marginBps >= 1000 ? "text-slate-500" : "text-red-500"
        )}>
          {bpsToPercent(row.marginBps)}
        </td>

        {/* Cost */}
        <td className="w-16 px-2 py-1.5">
          <InlineNum
            value={row.costCents / 100}
            onChange={(v) => update("costCents", Math.round(v * 100))}
            onBlur={save}
          />
        </td>

        {/* T. Cost */}
        <td className="w-16 px-2 py-1.5 text-right tabular-nums text-slate-500">
          {centsToDisplay(row.totalCostCents)}
        </td>

        {/* Adj Rate */}
        <td className="w-20 px-2 py-1.5">
          <InlineNum
            value={(row.adjRateCents ?? 0) / 100}
            onChange={(v) => update("adjRateCents", v === 0 ? null : Math.round(v * 100))}
            onBlur={save}
          />
        </td>

        {/* Actions */}
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={() => onDuplicate(row)}
              title="Duplicate"
              className="rounded p-0.5 text-slate-400 hover:text-slate-600"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onDelete(row.id)}
              title="Delete"
              className="rounded p-0.5 text-slate-400 hover:text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>

        {/* Save indicator */}
        <td className="w-6 px-1 py-1.5">
          {isPending && <span className="text-[10px] text-slate-400">…</span>}
          {dirty && !isPending && (
            <button
              onClick={save}
              className="text-[10px] font-medium text-brand-500 hover:underline"
            >
              save
            </button>
          )}
        </td>
      </tr>

      {/* ── sub-row: production rate hint ─────────────────────────────────── */}
      {row.productionRateSqftPerHr && row.productionRateSqftPerHr > 0 && row.qty > 0 && row.unitType && row.unitType !== "hr" && row.unitType !== "each" && (
        <tr className="border-b border-slate-50 bg-blue-50/40 text-[10px] text-blue-500">
          <td colSpan={2} />
          <td colSpan={3} className="px-2 py-0.5 italic">
            {row.qty.toLocaleString()} {row.unitType} ÷ {row.productionRateSqftPerHr.toLocaleString()} {row.unitType}/hr
          </td>
          <td className="px-2 py-0.5 text-right text-blue-600 font-medium">
            = {row.budgetedHours.toFixed(2)} hrs/occ
          </td>
          <td colSpan={10} />
        </tr>
      )}
    </>
  );
}

// ── main grid ─────────────────────────────────────────────────────────────────

interface Props {
  estimateId: string;
  items: EstimateLineItem[];
}

export function EstimateLineItemsGrid({ estimateId, items }: Props) {
  const { data: services } = useCRMServices();
  const { data: orgSettings } = useOrgSettings();
  const { mutateAsync: upsert } = useUpsertLineItem();
  const { mutateAsync: deleteItem } = useDeleteLineItem();

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteItem({ id, estimateId });
      } catch {
        toast.error("Failed to delete line item");
      }
    },
    [deleteItem, estimateId]
  );

  const handleDuplicate = useCallback(
    async (item: EstimateLineItem) => {
      try {
        await upsert({
          estimateId,
          item: {
            service_id: item.serviceId,
            service_name: item.serviceName,
            status: item.status,
            calc_type: item.calcType,
            qty: item.qty,
            unit_type: item.unitType,
            production_rate_sqft_per_hr: item.productionRateSqftPerHr,
            rate_cents: item.rateCents,
            visits: item.visits,
            total_cents: item.totalCents,
            budgeted_hours: item.budgetedHours,
            total_budgeted_hours: item.totalBudgetedHours,
            cost_cents: item.costCents,
            total_cost_cents: item.totalCostCents,
            margin_bps: item.marginBps,
            markup_bps: item.markupBps,
            adj_rate_cents: item.adjRateCents,
            sort_order: items.length,
          },
        });
      } catch {
        toast.error("Failed to duplicate line item");
      }
    },
    [upsert, estimateId, items.length]
  );

  async function addService(svc: { name: string; id?: string; unit?: string; productionRate?: number | null; rateCents?: number | null }) {
    const unit = svc.unit ?? null;
    const prodRate = svc.productionRate ?? null;

    // Pre-calculate budgeted hours if production rate available
    let budgetedHours = 0;
    if (prodRate && prodRate > 0 && unit && unit !== "hr" && unit !== "each") {
      budgetedHours = 0; // will be calculated when qty is entered
    }

    const computed = computeLineItem({
      calcType: 1,
      qty: 1,
      rateCents: svc.rateCents ?? 0,
      visits: 1,
      budgetedHours,
      costCents: 0,
      adjRateCents: null,
      unitType: unit,
      productionRateSqftPerHr: prodRate,
    });

    try {
      await upsert({
        estimateId,
        item: {
          service_id: svc.id ?? null,
          service_name: svc.name,
          status: "quote",
          calc_type: 1,
          qty: 1,
          unit_type: unit,
          production_rate_sqft_per_hr: prodRate,
          rate_cents: svc.rateCents ?? 0,
          visits: 1,
          cost_cents: 0,
          adj_rate_cents: null,
          sort_order: items.length,
          ...computed,
        },
      });
    } catch {
      toast.error("Failed to add item");
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
      <table className="w-full min-w-[1200px] text-xs">
        <thead className="sticky top-0 text-white" style={{ backgroundColor: orgSettings?.brandColor ?? "#60ab45" }}>
          <tr>
            <th className="px-2 py-2 text-left font-medium">Status</th>
            <th className="px-2 py-2 text-left font-medium">Service / Package</th>
            <th className="px-2 py-2 text-center font-medium" title="Occurrences (visits)">OCC</th>
            <th className="px-2 py-2 text-right font-medium">QTY</th>
            <th className="px-2 py-2 text-left font-medium">Unit</th>
            <th className="px-2 py-2 text-right font-medium" title="Hours per occurrence (auto-calculated in blue when production rate is set)">P/H</th>
            <th className="px-2 py-2 text-right font-medium" title="Total budgeted hours">T.H.</th>
            <th className="px-2 py-2 text-center font-medium" title="Calc type: × = qty×rate×visits, $ = fixed">Calc</th>
            <th className="px-2 py-2 text-right font-medium" title="Price per occurrence">Rate</th>
            <th className="px-2 py-2 text-right font-medium" title="Total price">TP</th>
            <th className="px-2 py-2 text-right font-medium">GM%</th>
            <th className="px-2 py-2 text-right font-medium">Cost</th>
            <th className="px-2 py-2 text-right font-medium">T.Cost</th>
            <th className="px-2 py-2 text-right font-medium" title="Adjusted rate override">Adj Rate</th>
            <th className="px-2 py-2" />
            <th className="px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={16} className="py-8 text-center text-slate-400 text-xs">
                No line items yet — add a service below
              </td>
            </tr>
          )}
          {items.map((item) => (
            <LineItemRow
              key={item.id}
              item={item}
              estimateId={estimateId}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
            />
          ))}
        </tbody>
      </table>

      {/* Add item */}
      <div className="border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Item
              <ChevronDown className="ml-1 h-3 w-3 text-slate-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            {(services ?? []).filter((s) => s.isActive).map((s) => (
              <DropdownMenuItem
                key={s.id}
                className="flex items-center justify-between text-xs"
                onClick={() => addService({
                  id: s.id,
                  name: s.name,
                  unit: s.unit ?? undefined,
                  productionRate: s.productionRateSqftPerHr,
                  rateCents: s.defaultRateCents,
                })}
              >
                <span className="font-medium">{s.name}</span>
                {s.productionRateSqftPerHr && (
                  <span className="text-[10px] text-slate-400 ml-2 shrink-0">
                    {s.productionRateSqftPerHr.toLocaleString()} {s.unit}/hr
                  </span>
                )}
              </DropdownMenuItem>
            ))}
            {(services ?? []).filter((s) => s.isActive).length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              className="text-xs text-slate-500"
              onClick={() => addService({ name: "Custom Item" })}
            >
              <Plus className="mr-1.5 h-3 w-3" /> Blank line item
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
