"use client";

import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { bpsToPercent, centsToDisplay, computeLineItem, getBreakevenRateCents } from "@/lib/estimate-calc";
import { useUpsertLineItem, useDeleteLineItem } from "@/lib/hooks/use-estimates";
import { useCRMServices } from "@/lib/hooks/use-crm-jobs";
import { useProducts } from "@/lib/hooks/use-products";
import { useOrgSettings } from "@/lib/hooks/use-org-settings";
import { useDiscounts } from "@/lib/hooks/use-crm-discounts";
import { stripHtml } from "@/lib/utils/strip-html";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Trash2, Copy, Plus, ChevronDown, ChevronRight, Pencil, Heading2, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { LineItemNotesPopover, type LineItemNotes } from "./LineItemNotesPopover";
import { LineItemDiscountPopover, type LineItemDiscountPatch } from "@/components/shared/LineItemDiscountPopover";
import { AddSubitemDialog } from "./AddSubitemDialog";
import {
  useLineItemSubitems,
  useDeleteSubitem,
  type LineItemSubitem,
} from "@/lib/hooks/use-line-item-subitems";
import type { EstimateLineItem, LineItemStatus } from "@/types/crm-estimates";
import type { CRMDiscount } from "@/types/crm-discounts";
import type { BudgetMethod } from "@/types/crm-jobs";

const UNIT_TYPES = ["sqft", "lf", "cuyd", "acres", "hr", "each", "lb", "gal"];

// ── small inline input ────────────────────────────────────────────────────────

function InlineNum({
  value,
  onChange,
  onBlur,
  className,
  step,
  zeroAsEmpty = true,
}: {
  value: number;
  onChange: (v: number) => void;
  onBlur?: () => void;
  className?: string;
  step?: number;
  /** `value || ""` makes 0 render as a blank box — the right call for a
   *  field where 0 means "unset" (Adj Rate), but confusing on Cost: typing
   *  0 to intentionally reset back to auto-fill mode looked like the input
   *  silently rejected it (reverting to blank) rather than confirming
   *  "$0.00 saved". Pass false to show a real 0 as "0" instead of blank. */
  zeroAsEmpty?: boolean;
}) {
  return (
    <input
      type="number"
      value={value || (zeroAsEmpty ? "" : 0)}
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

// ── sub-item rows ─────────────────────────────────────────────────────────────

function SubitemRows({ lineItemId, onAddClick }: { lineItemId: string; onAddClick: () => void }) {
  const { data: subitems = [], isLoading } = useLineItemSubitems(lineItemId);
  const { mutateAsync: deleteSubitem } = useDeleteSubitem();
  const [editingSubitem, setEditingSubitem] = useState<LineItemSubitem | null>(null);

  async function handleDelete(s: LineItemSubitem) {
    try { await deleteSubitem({ id: s.id, lineItemId }); }
    catch { toast.error("Failed to delete sub-item"); }
  }

  return (
    <>
      {isLoading && (
        <tr className="border-b border-slate-50 bg-slate-50/60">
          <td colSpan={17} className="px-6 py-1.5 text-[10px] text-slate-400 italic">Loading…</td>
        </tr>
      )}
      {subitems.map((s) => (
        <tr key={s.id} className="group border-b border-slate-50 bg-slate-50/60 text-[11px]">
          <td className="w-8 px-2 py-1" />
          <td colSpan={2} className="border-l-2 border-brand-300 pl-6 py-1">
            <span className="font-medium text-slate-700">{s.name}</span>
            <span className="ml-2 rounded bg-slate-200 px-1 py-0.5 text-[10px] text-slate-500">
              {s.type === "product" ? "Product" : "Subservice"}
            </span>
          </td>
          <td className="w-12 px-2 py-1 text-right tabular-nums text-slate-600">{s.qty}</td>
          <td colSpan={5} />
          <td className="w-20 px-2 py-1 text-right tabular-nums text-slate-600">
            ${(s.rateCents / 100).toFixed(2)}
          </td>
          <td className="w-20 px-2 py-1 text-right tabular-nums font-medium text-slate-700">
            {centsToDisplay(s.totalCents)}
          </td>
          <td />
          <td className="w-20 px-2 py-1 text-right tabular-nums text-slate-500" title="Unit cost">
            ${(s.costCents / 100).toFixed(2)}
          </td>
          <td className="w-20 px-2 py-1 text-right tabular-nums text-slate-500" title="Total cost = unit cost × qty">
            {centsToDisplay(s.costCents * s.qty)}
          </td>
          <td />
          <td className="px-2 py-1">
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button onClick={() => setEditingSubitem(s)} title="Edit"
                className="rounded p-0.5 text-slate-400 hover:text-slate-600">
                <Pencil className="h-3 w-3" />
              </button>
              <button onClick={() => handleDelete(s)} title="Delete"
                className="rounded p-0.5 text-red-400 hover:text-red-600">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </td>
          <td />
        </tr>
      ))}
      <tr className="border-b border-slate-100 bg-slate-50/40">
        <td colSpan={17} className="px-8 py-1">
          <button onClick={onAddClick}
            className="text-[11px] text-brand-600 hover:text-brand-700 hover:underline">
            + Add Product / Service
          </button>
        </td>
      </tr>
      {editingSubitem && (
        <AddSubitemDialog
          lineItemId={lineItemId}
          subitem={editingSubitem}
          open={true}
          onClose={() => setEditingSubitem(null)}
        />
      )}
    </>
  );
}

// ── single editable row ───────────────────────────────────────────────────────

// ── Section header row ────────────────────────────────────────────────────────

function SectionRow({
  item,
  estimateId,
  onDelete,
  tiersEnabled,
}: {
  item: EstimateLineItem;
  estimateId: string;
  onDelete: (id: string, estimateId: string) => void;
  tiersEnabled?: boolean;
}) {
  const upsert = useUpsertLineItem();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.sectionName ?? "New Section");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  function saveName() {
    setEditing(false);
    if (name === item.sectionName) return;
    upsert.mutate({ estimateId, item: { id: item.id, section_name: name } });
  }

  return (
    <tr ref={setNodeRef} style={style} className={cn("bg-slate-100 border-b border-slate-200", isDragging && "relative z-10 opacity-70")}>
      <td colSpan={tiersEnabled ? 18 : 17} className="px-3 py-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="shrink-0 cursor-grab touch-none text-slate-300 hover:text-slate-500 active:cursor-grabbing"
            title="Drag to reorder"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <Heading2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          {editing ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditing(false); }}
              className="flex-1 bg-transparent text-xs font-semibold text-slate-700 outline-none border-b border-slate-400 max-w-xs"
            />
          ) : (
            <span
              className="text-xs font-semibold text-slate-700 cursor-pointer hover:text-slate-900"
              onClick={() => setEditing(true)}
              title="Click to rename"
            >
              {name}
            </span>
          )}
          <button
            onClick={() => onDelete(item.id, estimateId)}
            className="ml-auto rounded p-0.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Delete section"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface RowState extends EstimateLineItem {}

function LineItemRow({
  item,
  estimateId,
  onDelete,
  onDuplicate,
  selected,
  onToggleSelect,
  expanded,
  onToggleExpand,
  tiersEnabled,
  discounts,
  onStatusChange,
}: {
  item: EstimateLineItem;
  estimateId: string;
  onDelete: (id: string) => void;
  onDuplicate: (item: EstimateLineItem) => void;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  tiersEnabled?: boolean;
  discounts: CRMDiscount[];
  onStatusChange?: (status: LineItemStatus) => void;
}) {
  const [row, setRow] = useState<RowState>(() => item);
  const [dirty, setDirty] = useState(false);
  // `row` only seeds from `item` on mount — writes that happen outside this row
  // (bulk Rate Increase, status changes) update `item` via refetch but never touch
  // this local draft, so the cell would keep showing pre-update values. Resync
  // whenever the incoming item changes and we don't have an unsaved local edit.
  useEffect(() => {
    if (!dirty) setRow(item);
  }, [item, dirty]);
  const { mutateAsync: upsert, isPending } = useUpsertLineItem();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const dragStyle = { transform: CSS.Transform.toString(transform), transition };
  const [addSubitemOpen, setAddSubitemOpen] = useState(false);
  const { data: subitems = [] } = useLineItemSubitems(item.id);
  const { data: orgSettings } = useOrgSettings();
  const breakevenRateCents = getBreakevenRateCents(orgSettings?.customizations);

  function update<K extends keyof RowState>(key: K, val: RowState[K]) {
    setRow((prev) => {
      const next = { ...prev, [key]: val };
      const computed = computeLineItem(next, breakevenRateCents);
      const merged: RowState = { ...next, ...computed };
      // A flat discount can't exceed the line's own (possibly now-smaller) total
      merged.discountCents = Math.min(merged.discountCents, merged.totalCents);
      return merged;
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
          budget_method: row.budgetMethod,
          rate_cents: row.rateCents,
          visits: row.visits,
          total_cents: row.totalCents,
          discount_cents: row.discountCents,
          discount_type: row.discountType,
          discount_value: row.discountValue,
          applied_discount_id: row.appliedDiscountId,
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

  async function saveDiscount(patch: LineItemDiscountPatch) {
    const next = { ...row, ...patch };
    setRow(next);
    try {
      await upsert({
        estimateId,
        item: {
          id: row.id,
          discount_cents: patch.discountCents,
          discount_type: patch.discountType,
          discount_value: patch.discountValue,
          applied_discount_id: patch.appliedDiscountId,
        },
      });
    } catch {
      setRow(row);
      toast.error("Failed to update discount");
    }
  }

  async function saveNotes(notes: LineItemNotes) {
    try {
      await upsert({
        estimateId,
        item: {
          id: row.id,
          estimate_desc: notes.estimateDesc,
          job_note: notes.jobNote,
          invoice_desc: notes.invoiceDesc,
          internal_note: notes.internalNote,
        },
      });
      setRow((r) => ({ ...r, ...notes }));
    } catch {
      toast.error("Failed to save notes");
    }
  }

  // Is budgeted hours auto-calculated? Only when the line item is explicitly
  // set to the production-rate budget method (not just because a rate is present).
  const isAutoHrs =
    row.budgetMethod === "production_rate" &&
    !!row.productionRateSqftPerHr &&
    row.productionRateSqftPerHr > 0 &&
    row.unitType !== "hr" &&
    row.unitType !== "each";

  // Is Cost auto-calculated from Budgeted Hours × the org's breakeven labor
  // rate? costCents stays 0 (see computeLineItem) for as long as this is
  // true — display-only, computed fresh from totalCostCents here rather
  // than persisting a derived per-unit value that would poison the NEXT
  // Qty/Budgeted-Hours edit (see estimate-calc.ts for the corruption that
  // caused — a stale derived rate silently re-multiplied by qty again).
  const isAutoCost = row.costCents === 0 && !!breakevenRateCents && row.budgetedHours > 0;
  const autoCostPerUnitCents = isAutoCost
    ? (row.qty > 0 ? row.totalCostCents / row.qty / row.visits : row.totalCostCents / row.visits)
    : 0;

  return (
    <>
      {/* ── main row ──────────────────────────────────────────────────────── */}
      <tr
        ref={setNodeRef}
        style={dragStyle}
        className={cn(
          "group border-b border-slate-100 bg-white text-xs hover:bg-slate-50",
          selected && "bg-brand-50",
          isDragging && "relative z-10 opacity-70"
        )}
      >
        {/* Drag handle + checkbox */}
        <td className="w-12 px-1 py-1.5">
          <div className="flex items-center justify-center gap-0.5">
            <button
              type="button"
              {...attributes}
              {...listeners}
              className="cursor-grab touch-none text-slate-300 hover:text-slate-500 active:cursor-grabbing"
              title="Drag to reorder"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(row.id)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-brand-500"
            />
          </div>
        </td>

        {/* Status */}
        <td className="px-2 py-1.5">
          <select
            value={row.status}
            onChange={(e) => {
              const next = e.target.value as LineItemStatus;
              update("status", next);
              onStatusChange?.(next);
            }}
            onBlur={save}
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium focus:outline-none",
              STATUS_COLOR[row.status]
            )}
          >
            <option value="draft">Draft</option>
            <option value="quote">Quote</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>
        </td>

        {/* Tier (only when tiersEnabled) */}
        {tiersEnabled && (
          <td className="w-20 px-2 py-1.5">
            <select
              value={row.tier ?? "all"}
              onChange={async (e) => {
                const val = e.target.value === "all" ? null : e.target.value as 'basic' | 'standard' | 'premium';
                setRow((r) => ({ ...r, tier: val }));
                try {
                  await upsert({ estimateId, item: { id: row.id, tier: val } });
                } catch {
                  toast.error("Failed to save tier");
                }
              }}
              className="w-full rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] focus:outline-none"
            >
              <option value="all">All</option>
              <option value="basic">Basic</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
            </select>
          </td>
        )}

        {/* Service name + expand chevron */}
        <td className="min-w-[160px] px-2 py-1.5 font-semibold text-slate-900">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onToggleExpand(item.id)}
              title={expanded ? "Collapse sub-items" : "Expand sub-items"}
              className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-600"
            >
              {expanded
                ? <ChevronDown className="h-3.5 w-3.5" />
                : <ChevronRight className="h-3.5 w-3.5" />
              }
            </button>
            {subitems.length > 0 && !expanded && (
              <span className="rounded-full bg-slate-200 px-1.5 text-[9px] text-slate-500 font-normal">
                {subitems.length}
              </span>
            )}
            {row.serviceName}
          </div>
        </td>

        {/* Visits */}
        <td className="w-16 px-2 py-1.5">
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
        <td className="w-20 px-2 py-1.5">
          <select
            value={row.unitType ?? ""}
            onChange={(e) => update("unitType", e.target.value || null)}
            onBlur={save}
            className="w-full rounded border border-slate-200 bg-white px-1 py-0.5 text-xs focus:outline-none"
          >
            <option value="">—</option>
            {UNIT_TYPES.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </td>

        {/* B.Hr — budgeted hours per visit. Auto-calc shown in blue if production rate is active */}
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

        {/* T.H. — total hours = B.Hr × Visits */}
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

        {/* Rate (price per visit) */}
        <td className="w-20 px-2 py-1.5">
          <InlineNum
            value={row.rateCents / 100}
            onChange={(v) => update("rateCents", Math.round(v * 100))}
            onBlur={save}
          />
        </td>

        {/* Total (TP) */}
        <td className="w-20 px-2 py-1.5 text-right tabular-nums">
          {row.discountCents > 0 ? (
            <div className="flex flex-col items-end leading-tight">
              <span className="text-[10px] text-slate-300 line-through">{centsToDisplay(row.totalCents)}</span>
              <span className="font-medium text-slate-700">{centsToDisplay(row.totalCents - row.discountCents)}</span>
            </div>
          ) : (
            <span className="font-medium text-slate-700">{centsToDisplay(row.totalCents)}</span>
          )}
        </td>

        {/* GM% */}
        <td className={cn(
          "w-16 px-2 py-1.5 text-right tabular-nums",
          row.marginBps >= 3000 ? "text-green-600" : row.marginBps >= 1000 ? "text-slate-500" : "text-red-500"
        )}>
          {bpsToPercent(row.marginBps)}
        </td>

        {/* Cost — auto-derived value (blue) is shown but still editable:
            typing a real number here is what actually sets costCents and
            switches this line out of auto mode going forward. */}
        <td className="w-24 px-2 py-1.5">
          <InlineNum
            value={isAutoCost ? autoCostPerUnitCents / 100 : row.costCents / 100}
            onChange={(v) => update("costCents", Math.round(v * 100))}
            onBlur={save}
            className={isAutoCost ? "text-blue-600 font-medium" : undefined}
            zeroAsEmpty={false}
          />
        </td>

        {/* T. Cost */}
        <td className="w-24 px-2 py-1.5 text-right tabular-nums text-slate-500">
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
          <div className="flex items-center gap-1">
            <LineItemDiscountPopover
              discountCents={row.discountCents}
              discountType={row.discountType}
              discountValue={row.discountValue}
              appliedDiscountId={row.appliedDiscountId}
              lineTotalCents={row.totalCents}
              discounts={discounts}
              onSave={saveDiscount}
            />
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <LineItemNotesPopover
              notes={{ estimateDesc: row.estimateDesc ?? null, jobNote: row.jobNote ?? null, invoiceDesc: row.invoiceDesc ?? null, internalNote: row.internalNote ?? null }}
              onSave={saveNotes}
            />
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
          <td colSpan={3} />
          <td colSpan={3} className="px-2 py-0.5 italic">
            {row.qty.toLocaleString()} {row.unitType} ÷ {row.productionRateSqftPerHr.toLocaleString()} {row.unitType}/hr
          </td>
          <td className="px-2 py-0.5 text-right text-blue-600 font-medium">
            = {row.budgetedHours.toFixed(2)} hrs/occ
          </td>
          <td colSpan={11} />
        </tr>
      )}

      {/* ── sub-items ─────────────────────────────────────────────────────── */}
      {expanded && (
        <SubitemRows
          lineItemId={item.id}
          onAddClick={() => setAddSubitemOpen(true)}
        />
      )}

      {addSubitemOpen && (
        <AddSubitemDialog
          lineItemId={item.id}
          open={true}
          onClose={() => setAddSubitemOpen(false)}
        />
      )}
    </>
  );
}

// ── main grid ─────────────────────────────────────────────────────────────────

interface Props {
  estimateId: string;
  items: EstimateLineItem[];
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  tiersEnabled?: boolean;
  onItemStatusChange?: (status: LineItemStatus) => void;
}

export function EstimateLineItemsGrid({ estimateId, items, selectedIds = [], onSelectionChange, tiersEnabled = false, onItemStatusChange }: Props) {
  const { data: services } = useCRMServices();
  const { data: orgSettings } = useOrgSettings();
  const breakevenRateCents = getBreakevenRateCents(orgSettings?.customizations);
  const { data: productCatalog = [] } = useProducts();
  const materialProducts = productCatalog.filter(
    (p) => p.category === "stocked_material" || p.category === "project_material"
  );
  const { mutateAsync: upsert } = useUpsertLineItem();
  const { mutateAsync: deleteItem } = useDeleteLineItem();
  const { data: discounts = [] } = useDiscounts();
  const activeDiscounts = discounts.filter((d) => d.isActive);

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

  const dragSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(items, oldIndex, newIndex);
      reordered.forEach((it, i) => {
        if (it.sortOrder !== i) {
          upsert({ estimateId, item: { id: it.id, sort_order: i } }).catch(() =>
            toast.error("Failed to save new order")
          );
        }
      });
    },
    [items, upsert, estimateId]
  );

  async function addService(svc: { name: string; id?: string; unit?: string; productionRate?: number | null; budgetMethod?: BudgetMethod; rateCents?: number | null; estimateDesc?: string | null; invoiceDesc?: string | null }) {
    const unit = svc.unit ?? null;
    const prodRate = svc.productionRate ?? null;
    const budgetMethod = svc.budgetMethod ?? "manual";

    const computed = computeLineItem({
      calcType: 1,
      qty: 1,
      rateCents: svc.rateCents ?? 0,
      visits: 1,
      budgetedHours: 0, // will be calculated when qty is entered (production_rate) or set manually
      costCents: 0,
      adjRateCents: null,
      unitType: unit,
      productionRateSqftPerHr: prodRate,
      budgetMethod,
    }, breakevenRateCents);

    try {
      await upsert({
        estimateId,
        item: {
          service_id: svc.id ?? null,
          service_name: svc.name,
          status: "draft",
          calc_type: 1,
          qty: 1,
          unit_type: unit,
          // Both are authored via a rich-text editor on the Service (Descriptions
          // tab), but are only ever displayed/edited as plain text once copied
          // onto a line item (see EstimateDetail.tsx's stripHtml(li.estimateDesc),
          // the Invoice Description popover's plain textarea, and the actual
          // invoice line item description on a generated invoice) — strip HTML
          // here at copy time instead of showing raw "<p>...</p>" everywhere
          // downstream.
          estimate_desc: svc.estimateDesc ? stripHtml(svc.estimateDesc) || null : null,
          invoice_desc: svc.invoiceDesc ? stripHtml(svc.invoiceDesc) || null : null,
          production_rate_sqft_per_hr: prodRate,
          budget_method: budgetMethod,
          rate_cents: svc.rateCents ?? 0,
          visits: 1,
          cost_cents: computed.costCents,
          adj_rate_cents: null,
          sort_order: items.length,
          total_cents: computed.totalCents,
          budgeted_hours: computed.budgetedHours,
          total_budgeted_hours: computed.totalBudgetedHours,
          total_cost_cents: computed.totalCostCents,
          margin_bps: computed.marginBps,
          markup_bps: computed.markupBps,
        },
      });
    } catch {
      toast.error("Failed to add item");
    }
  }

  async function addSection() {
    try {
      await upsert({
        estimateId,
        item: {
          row_type: "section",
          section_name: "New Section",
          status: "quote",
          sort_order: items.length,
          service_name: "",
          qty: 0,
          rate_cents: 0,
          visits: 1,
          total_cents: 0,
          cost_cents: 0,
          calc_type: 1,
        },
      });
    } catch {
      toast.error("Failed to add section");
    }
  }

  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelect(id: string) {
    if (!onSelectionChange) return;
    onSelectionChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]
    );
  }

  function toggleSelectAll() {
    if (!onSelectionChange) return;
    onSelectionChange(selectedIds.length === items.length ? [] : items.map((i) => i.id));
  }

  const activeServices = (services ?? []).filter((s) => s.isActive);
  const lc = search.toLowerCase();
  const filteredServices = lc
    ? activeServices.filter((s) => s.name.toLowerCase().includes(lc))
    : activeServices;
  const filteredProducts = lc
    ? materialProducts.filter((p) => p.name.toLowerCase().includes(lc))
    : materialProducts;

  const addItemButton = (
    <Popover open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs">
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Item
          <ChevronDown className="ml-1 h-3 w-3 text-slate-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b px-2 py-1.5">
          <Input
            autoFocus
            placeholder="Search services & products…"
            className="h-7 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {filteredServices.length > 0 && (
            <>
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Services</div>
              {filteredServices.map((s) => (
                <button
                  key={s.id}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-xs hover:bg-slate-50"
                  onClick={() => {
                    addService({ id: s.id, name: s.name, unit: s.unit ?? undefined, productionRate: s.productionRateSqftPerHr, budgetMethod: s.budgetMethod, rateCents: s.defaultRateCents, estimateDesc: s.descriptionOnEstimate, invoiceDesc: s.invoiceDescription });
                    setAddOpen(false); setSearch("");
                  }}
                >
                  <span className="font-medium text-slate-900">{s.name}</span>
                  {s.productionRateSqftPerHr && (
                    <span className="ml-2 shrink-0 text-[10px] text-slate-400">
                      {s.productionRateSqftPerHr.toLocaleString()} {s.unit}/hr
                    </span>
                  )}
                </button>
              ))}
            </>
          )}
          {filteredProducts.length > 0 && (
            <>
              <div className="mt-1 border-t px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Products / Materials</div>
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-xs hover:bg-slate-50"
                  onClick={() => {
                    addService({ name: p.name, unit: "each", rateCents: p.price });
                    setAddOpen(false); setSearch("");
                  }}
                >
                  <span className="font-medium text-slate-900">{p.name}</span>
                  {p.price > 0 && (
                    <span className="ml-2 shrink-0 text-[10px] text-slate-400">
                      ${(p.price / 100).toFixed(2)}
                    </span>
                  )}
                </button>
              ))}
            </>
          )}
          {filteredServices.length === 0 && filteredProducts.length === 0 && lc && (
            <div className="px-3 py-3 text-xs text-slate-400">No results for &ldquo;{search}&rdquo;</div>
          )}
          <div className="mt-1 border-t">
            <button
              className="flex w-full items-center px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
              onClick={() => { addService({ name: "Custom Item" }); setAddOpen(false); setSearch(""); }}
            >
              <Plus className="mr-1.5 h-3 w-3" /> Blank line item
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="flex min-h-[250px] flex-col rounded-lg border bg-white shadow-sm">
      {/* Add Item toolbar — always visible at the top */}
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2 bg-slate-50">
        {addItemButton}
        <Button variant="ghost" size="sm" className="h-8 text-xs text-slate-500" onClick={addSection}>
          <Heading2 className="mr-1 h-3.5 w-3.5" /> Add Section
        </Button>
      </div>
      <div className="flex-1 overflow-x-auto pb-3">
        <table className="w-full min-w-[1200px] text-xs">
          <thead className="text-white" style={{ backgroundColor: orgSettings?.brandColor ?? "#60ab45" }}>
            <tr>
              <th className="w-12 px-1 py-2 text-center">
                <input
                  type="checkbox"
                  checked={items.length > 0 && selectedIds.length === items.length}
                  onChange={toggleSelectAll}
                  className="h-3.5 w-3.5 rounded border-slate-300"
                />
              </th>
              <th className="px-2 py-2 text-left font-medium">Status</th>
              {tiersEnabled && <th className="px-2 py-2 text-left font-medium">Tier</th>}
              <th className="px-2 py-2 text-left font-medium" title="The service or package being sold on this line">Service / Package</th>
              <th className="px-2 py-2 text-center font-medium" title="Number of visits this line item covers">Visits</th>
              <th className="px-2 py-2 text-right font-medium" title="Quantity of the unit below, per visit">QTY</th>
              <th className="px-2 py-2 text-left font-medium" title="Unit of measure for Qty (e.g. sq ft, hr, each)">Unit</th>
              <th className="px-2 py-2 text-right font-medium" title="Budgeted hours per visit — auto-calculated in blue when a production rate is set, otherwise entered manually">B.Hr</th>
              <th className="px-2 py-2 text-right font-medium" title="Total budgeted hours = B.Hr × Visits">T.H.</th>
              <th className="px-2 py-2 text-center font-medium" title="Calc type: × = qty×rate×visits, $ = fixed">Calc</th>
              <th className="px-2 py-2 text-right font-medium" title="Price per visit charged to the client">Rate</th>
              <th className="px-2 py-2 text-right font-medium" title="Total price charged to the client for this line">TP</th>
              <th className="px-2 py-2 text-right font-medium" title="Gross margin % = (Total Price − Total Cost) ÷ Total Price">GM%</th>
              <th className="px-2 py-2 text-right font-medium" title="Cost per visit — pre-fills from budgeted hours × your org's breakeven labor rate until you type a value manually">Cost</th>
              <th className="px-2 py-2 text-right font-medium" title="Total cost = Cost × Qty × Visits">T.Cost</th>
              <th className="px-2 py-2 text-right font-medium" title="Manual override of Rate — used in calculations instead of Rate when set">Adj Rate</th>
              <th className="px-2 py-2" />
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={tiersEnabled ? 18 : 17} className="py-8 text-center text-slate-400 text-xs">
                  No line items yet — use Add Item above
                </td>
              </tr>
            )}
            <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                {items.map((item) =>
                  item.rowType === "section" ? (
                    <SectionRow
                      key={item.id}
                      item={item}
                      estimateId={estimateId}
                      onDelete={handleDelete}
                      tiersEnabled={tiersEnabled}
                    />
                  ) : (
                    <LineItemRow
                      key={item.id}
                      item={item}
                      estimateId={estimateId}
                      onDelete={handleDelete}
                      onDuplicate={handleDuplicate}
                      selected={selectedIds.includes(item.id)}
                      onToggleSelect={toggleSelect}
                      expanded={expandedRows.has(item.id)}
                      onToggleExpand={toggleExpand}
                      tiersEnabled={tiersEnabled}
                      discounts={activeDiscounts}
                      onStatusChange={onItemStatusChange}
                    />
                  )
                )}
              </SortableContext>
            </DndContext>
          </tbody>
        </table>
      </div>
    </div>
  );
}
