"use client";

import { Fragment, useState, useCallback, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn, formatCurrency } from "@/lib/utils";
import { bpsToPercent, centsToDisplay, clampComplexityBps, computeLineItem, getBreakevenRateCents, resolveLineDiscountCents } from "@/lib/estimate-calc";
import { useUpsertLineItem, useDeleteLineItem, useEstimateSubitemTotals } from "@/lib/hooks/use-estimates";
import { packageGroupLineIds } from "@/lib/estimates/package-group";
import { useCRMServices } from "@/lib/hooks/use-crm-jobs";
import { useProducts } from "@/lib/hooks/use-products";
import { useOrgSettings } from "@/lib/hooks/use-org-settings";
import { useDiscounts } from "@/lib/hooks/use-crm-discounts";
import { useClient, useClientProperties } from "@/lib/hooks/use-clients";
import { useCustomFieldDefs, useClientCustomFieldValues } from "@/lib/hooks/use-client-custom-fields";
import { fetchFieldValueWithClientFallback } from "@/lib/chemical-area";
import { usePropertyCustomFieldValues, lookupRateMatrixMatch, applyMatrixTail, type RateMatrixRow } from "@/lib/hooks/use-rate-matrix";
import { createClient } from "@/lib/supabase/client";
import { stripHtml } from "@/lib/utils/strip-html";
import { usePackages } from "@/lib/hooks/use-packages";
import type { CRMPackage } from "@/types/crm-packages";
import { isAreaUnit, needsProductionRateUnitWarning, unitLabel } from "@/lib/estimates/units";
import { resolveTakeoffSqft, type ClientTakeoff } from "@/lib/estimates/client-takeoff";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Trash2, Copy, Package as PackageIcon, Plus, ChevronDown, ChevronRight, Pencil, Heading2, GripVertical, AlertTriangle, Printer, ArrowDownToLine } from "lucide-react";
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
import { BudgetedHoursPopover, type BudgetedHoursPatch } from "./BudgetedHoursPopover";
import { LineItemComplexityPopover } from "./LineItemComplexityPopover";
import { LineItemDiscountPopover, type LineItemDiscountPatch } from "@/components/shared/LineItemDiscountPopover";
import { AddSubitemDialog } from "./AddSubitemDialog";
import { LineItemEquipmentRows } from "./LineItemEquipmentRows";
import { useLineItemEquipment, useApplyServiceEquipmentDefaults } from "@/lib/hooks/use-equipment";
import {
  useLineItemSubitems,
  useDeleteSubitem,
  useToggleSubitemPrint,
  type LineItemSubitem,
} from "@/lib/hooks/use-line-item-subitems";
import type { EstimateLineItem, LineItemStatus } from "@/types/crm-estimates";
import type { CRMDiscount } from "@/types/crm-discounts";
import type { BudgetMethod } from "@/types/crm-jobs";
import { mutationErrorMessage } from "@/lib/utils/mutation-error";

const UNIT_TYPES = ["sqft", "lf", "cuyd", "acres", "hr", "each", "lb", "gal"];

// ── small inline input ────────────────────────────────────────────────────────

function InlineNum({
  value,
  onChange,
  onFocus,
  onBlur,
  className,
  step,
  zeroAsEmpty = true,
}: {
  value: number;
  onChange: (v: number) => void;
  onFocus?: () => void;
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
      min={0}
      // Every numeric cell in this grid (visits, qty, hours, rate, cost, adj
      // rate) is non-negative. A negative rate used to save a negative line
      // total that the estimate rollup then floored to 0 (estimate-calc.ts),
      // so the line and the estimate total silently disagreed.
      onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        "w-full rounded border border-border bg-card px-1.5 py-0.5 text-right text-xs focus:border-brand-400 focus:outline-none",
        className
      )}
    />
  );
}

// ── status badge / selector ───────────────────────────────────────────────────

const STATUS_COLOR: Record<LineItemStatus, string> = {
  quote:  "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400",
  draft:  "bg-muted text-slate-600 dark:text-neutral-400",
  won:    "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400",
  lost:   "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400",
};

// ── sub-item rows ─────────────────────────────────────────────────────────────

function SubitemRows({ lineItemId, onAddClick }: { lineItemId: string; onAddClick: () => void }) {
  const { data: subitems = [], isLoading } = useLineItemSubitems(lineItemId);
  const { mutateAsync: deleteSubitem } = useDeleteSubitem();
  const { mutate: togglePrint } = useToggleSubitemPrint();
  const [editingSubitem, setEditingSubitem] = useState<LineItemSubitem | null>(null);

  async function handleDelete(s: LineItemSubitem) {
    try { await deleteSubitem({ id: s.id, lineItemId }); }
    catch (err) { toast.error(mutationErrorMessage(err, "Failed to delete sub-item")); }
  }

  return (
    <>
      {isLoading && (
        <tr className="border-b border-slate-50 dark:border-neutral-800 bg-slate-50/60 dark:bg-muted/40">
          <td colSpan={17} className="px-6 py-1.5 text-[10px] text-slate-400 dark:text-neutral-500 italic">Loading…</td>
        </tr>
      )}
      {subitems.map((s) => (
        <tr key={s.id} className="group border-b border-slate-50 dark:border-neutral-800 bg-slate-50/60 dark:bg-muted/40 text-[11px]">
          <td className="w-8 px-2 py-1" />
          <td colSpan={2} className="border-l-2 border-brand-300 dark:border-brand-700 pl-6 py-1">
            <span className="font-medium text-slate-700 dark:text-neutral-300">{s.name}</span>
            <span className="ml-2 rounded bg-slate-200 dark:bg-neutral-700 px-1 py-0.5 text-[10px] text-muted-foreground">
              {s.type === "product" ? "Product" : "Subservice"}
            </span>
          </td>
          <td className="w-12 px-2 py-1 text-right tabular-nums text-slate-600 dark:text-neutral-400">{s.qty}</td>
          <td colSpan={5} />
          <td className="w-20 px-2 py-1 text-right tabular-nums text-slate-600 dark:text-neutral-400">
            ${(s.rateCents / 100).toFixed(2)}
          </td>
          <td className="w-20 px-2 py-1 text-right tabular-nums font-medium text-slate-700 dark:text-neutral-300">
            {centsToDisplay(s.totalCents)}
          </td>
          <td />
          <td className="w-20 px-2 py-1 text-right tabular-nums text-muted-foreground" title="Unit cost">
            ${(s.costCents / 100).toFixed(2)}
          </td>
          <td className="w-20 px-2 py-1 text-right tabular-nums text-muted-foreground" title="Total cost = unit cost × qty">
            {centsToDisplay(s.costCents * s.qty)}
          </td>
          <td />
          <td className="px-2 py-1">
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button onClick={() => setEditingSubitem(s)} title="Edit"
                className="rounded p-0.5 text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-400">
                <Pencil className="h-3 w-3" />
              </button>
              <button onClick={() => handleDelete(s)} title="Delete"
                className="rounded p-0.5 text-red-400 hover:text-red-600 dark:hover:text-red-400">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </td>
          <td className="px-2 py-1">
            <div className="flex items-center gap-1">
              {/* Like Service Autopilot: one click shows/hides this sub-item on the
                  client's estimate. Always visible so the state is readable. */}
              <button
                type="button"
                onClick={() => togglePrint({ id: s.id, lineItemId, field: "printOnEstimate", value: !s.printOnEstimate })}
                title={s.printOnEstimate ? "Printed on the estimate — click to hide" : "Not printed on the estimate — click to show"}
                aria-pressed={s.printOnEstimate}
                className={`rounded p-0.5 ${s.printOnEstimate ? "text-brand-600 dark:text-brand-400" : "text-slate-300 dark:text-neutral-600"} hover:text-brand-700 dark:hover:text-brand-400`}
              >
                <Printer className="h-3.5 w-3.5" />
              </button>
            </div>
          </td>
        </tr>
      ))}
      <tr className="border-b border-slate-100 dark:border-neutral-800 bg-slate-50/40 dark:bg-muted/40">
        <td colSpan={17} className="px-8 py-1">
          <button onClick={onAddClick}
            className="text-[11px] text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-400 hover:underline">
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

export type FillDownField = "qty" | "rate" | "hours" | "cost" | "adj" | "all";

const FILL_DOWN_BUTTONS: { field: FillDownField; label: string }[] = [
  { field: "qty", label: "Qty" },
  { field: "rate", label: "Rate" },
  { field: "hours", label: "B.Hr" },
  { field: "cost", label: "Cost" },
  { field: "adj", label: "Adj Rate" },
  { field: "all", label: "All" },
];

function SectionRow({
  item,
  estimateId,
  onDelete,
  onFillDown,
  tiersEnabled,
}: {
  item: EstimateLineItem;
  estimateId: string;
  onDelete: (id: string, estimateId: string) => void;
  onFillDown: (packageId: string, field: FillDownField, headerId?: string) => void;
  tiersEnabled?: boolean;
}) {
  const upsert = useUpsertLineItem();
  const [editing, setEditing] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState(item.estimateDesc ?? "");
  useEffect(() => setDesc(item.estimateDesc ?? ""), [item.estimateDesc]);

  // A package section's estimate_desc is the wording the client sees as the
  // package's main description (proposal, portal, PDF, email grid).
  function saveDesc() {
    setEditingDesc(false);
    if (desc === (item.estimateDesc ?? "")) return;
    upsert.mutate({ estimateId, item: { id: item.id, estimate_desc: desc.trim() || null } });
  }
  const [name, setName] = useState(item.sectionName ?? "New Section");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  function saveName() {
    setEditing(false);
    if (name === item.sectionName) return;
    upsert.mutate({ estimateId, item: { id: item.id, section_name: name } });
  }

  return (
    <tr ref={setNodeRef} style={style} className={cn("bg-muted border-b border-border", isDragging && "relative z-10 opacity-70")}>
      <td colSpan={tiersEnabled ? 18 : 17} className="px-3 py-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="shrink-0 cursor-grab touch-none text-slate-300 dark:text-neutral-500 hover:text-muted-foreground active:cursor-grabbing"
            title="Drag to reorder"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <Heading2 className="h-3.5 w-3.5 text-slate-400 dark:text-neutral-500 shrink-0" />
          {editing ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditing(false); }}
              className="flex-1 bg-transparent text-xs font-semibold text-slate-700 dark:text-neutral-300 outline-none border-b border-slate-400 dark:border-neutral-600 max-w-xs"
            />
          ) : (
            <span
              className="text-xs font-semibold text-slate-700 dark:text-neutral-300 cursor-pointer hover:text-slate-900 dark:hover:text-neutral-100"
              onClick={() => setEditing(true)}
              title="Click to rename"
            >
              {name}
            </span>
          )}
          <button
            onClick={() => onDelete(item.id, estimateId)}
            className="ml-auto rounded p-0.5 text-slate-400 dark:text-neutral-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
            title="Delete section"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
        {item.packageId && (
          <div className="mt-1 pl-12 text-xs">
            {editingDesc ? (
              <textarea
                autoFocus
                rows={3}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                onBlur={saveDesc}
                onKeyDown={(e) => { if (e.key === "Escape") { setDesc(item.estimateDesc ?? ""); setEditingDesc(false); } }}
                placeholder="Package description shown to the client"
                className="w-full max-w-2xl rounded border border-slate-300 dark:border-neutral-600 bg-background px-2 py-1 text-xs outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingDesc(true)}
                className="flex w-full max-w-2xl items-start gap-1.5 rounded border border-dashed border-slate-300 dark:border-neutral-600 bg-background/60 px-2 py-1 text-left text-muted-foreground hover:border-brand-400 hover:text-foreground"
                title="Click to edit the description the client sees"
              >
                <Pencil className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  <span className="font-medium text-foreground">Description on estimate: </span>
                  {item.estimateDesc ? item.estimateDesc : "none yet — click to add the wording the client sees"}
                </span>
              </button>
            )}
          </div>
        )}
        {item.packageId && (
          <div className="mt-1 flex flex-wrap items-center gap-1 pl-12 text-[10px] text-muted-foreground">
            <ArrowDownToLine className="h-3 w-3" />
            <span>Copy the first visit&rsquo;s value to every visit:</span>
            {FILL_DOWN_BUTTONS.map((b) => (
              <button
                key={b.field}
                type="button"
                onClick={() => onFillDown(item.packageId as string, b.field, item.id)}
                className="rounded border border-slate-300 dark:border-neutral-600 px-1.5 py-0.5 hover:border-brand-400 hover:text-foreground"
                title={b.field === "all" ? "Copy qty, rate, calc, budgeted hours, cost and adjusted rate" : `Copy ${b.label} from the first visit to the rest`}
              >
                {b.label}
              </button>
            ))}
          </div>
        )}
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
  takeoff,
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
  /** The estimate's client measurements, for the "use takeoff" shortcut on sq ft lines. */
  takeoff: ClientTakeoff | null;
}) {
  const [row, setRow] = useState<RowState>(() => item);
  const [dirty, setDirty] = useState(false);
  // While the Cost box has focus, always show what's actually in row.costCents
  // (even 0) rather than the auto-computed blue display — otherwise the
  // instant costCents hits 0 mid-edit, the auto-fill kicks in and the input's
  // displayed value snaps to a nonzero computed number WHILE THE USER IS
  // STILL TYPING, making it look like the field can never be cleared at all.
  const [costFocused, setCostFocused] = useState(false);
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
  const { data: lineEquipment = [] } = useLineItemEquipment(item.id);
  const { data: orgSettings } = useOrgSettings();
  const breakevenRateCents = getBreakevenRateCents(orgSettings?.customizations);
  const equipmentCents = lineEquipment.reduce((sum, e) => sum + e.totalCostCents, 0);

  // A flat discount can't exceed the line's own (possibly now-smaller) total —
  // otherwise the line contributes NEGATIVE revenue to the estimate subtotal.
  // This used to live inline in update() only, so saveComplexity (which shrinks
  // totalCents whenever the slider goes below 100%) skipped it entirely: a $600
  // line carrying a $500 flat discount, dropped to 50%, totalled $300 against a
  // $500 discount and subtracted $200 from the estimate. Shared by every path
  // here that rewrites totalCents.
  //
  // A PERCENT discount is also re-derived here against the new total: its
  // discount_cents was a snapshot from when it was picked, so any qty/rate/
  // complexity change left the line discounted by the old dollar amount.
  function clampDiscount(r: RowState): RowState {
    return { ...r, discountCents: resolveLineDiscountCents(r) };
  }

  function update<K extends keyof RowState>(key: K, val: RowState[K]) {
    setRow((prev) => {
      const next = { ...prev, [key]: val };
      const computed = computeLineItem(next, breakevenRateCents);
      return clampDiscount({ ...next, ...computed });
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
          complexity_bps: row.complexityBps,
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
    } catch (err) {
      toast.error(mutationErrorMessage(err, "Failed to save line item"));
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
    } catch (err) {
      setRow(row);
      toast.error(mutationErrorMessage(err, "Failed to update discount"));
    }
  }

  async function applyBudgetedHoursPatch(patch: BudgetedHoursPatch) {
    // Mirrors saveDiscount rather than update()+save(): both fields need to
    // land in the SAME computeLineItem pass (a two-step update()/update()
    // would recompute totalCostCents off the old budgetedHours in between),
    // and the upsert needs the freshly merged row, not the current closure's
    // stale `row` a queued save() would read.
    const next = { ...row, budgetedHours: patch.budgetedHours, ...(patch.costCents !== undefined ? { costCents: patch.costCents } : {}) };
    const computed = computeLineItem(next, breakevenRateCents);
    const merged: RowState = clampDiscount({ ...next, ...computed });
    setRow(merged);
    try {
      await upsert({
        estimateId,
        item: {
          id: merged.id,
          // The stored hours are the UNSCALED base (see estimate-calc.ts) —
          // computeLineItem no longer multiplies them by complexity, so what
          // the user typed in the popover is what comes back in the B.Hr cell.
          budgeted_hours: merged.budgetedHours,
          total_budgeted_hours: merged.totalBudgetedHours,
          cost_cents: merged.costCents,
          total_cost_cents: merged.totalCostCents,
          margin_bps: merged.marginBps,
          markup_bps: merged.markupBps,
          total_cents: merged.totalCents,
          discount_cents: merged.discountCents,
        },
      });
    } catch (err) {
      setRow(row);
      toast.error(mutationErrorMessage(err, "Failed to update budgeted hours"));
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
          treated_area: notes.treatedArea,
        },
      });
      setRow((r) => ({ ...r, ...notes }));
    } catch (err) {
      toast.error(mutationErrorMessage(err, "Failed to save notes"));
    }
  }

  async function saveComplexity(rawComplexityBps: number) {
    // Clamp before anything is computed or written: nothing in the DB bounds
    // complexity_bps, and 0 would make the line free while a negative would
    // make it owe the client money.
    const complexityBps = clampComplexityBps(rawComplexityBps);
    const computed = computeLineItem({ ...row, complexityBps }, breakevenRateCents);
    const next: RowState = clampDiscount({ ...row, complexityBps, ...computed });
    setRow(next);
    try {
      await upsert({
        estimateId,
        item: {
          id: row.id,
          complexity_bps: next.complexityBps,
          total_cents: next.totalCents,
          // Unchanged by complexity now (it's the unscaled base) — still
          // written so a row whose stored hours were inflated by the old
          // compounding bug is corrected the next time the slider is touched.
          budgeted_hours: next.budgetedHours,
          total_budgeted_hours: next.totalBudgetedHours,
          total_cost_cents: next.totalCostCents,
          margin_bps: next.marginBps,
          markup_bps: next.markupBps,
          discount_cents: next.discountCents,
        },
      });
    } catch (err) {
      setRow(row);
      toast.error(mutationErrorMessage(err, "Failed to save complexity adjustment"));
    }
  }

  // Is budgeted hours auto-calculated? Only when the line item is explicitly
  // set to the production-rate budget method (not just because a rate is
  // present) AND its qty is an area — the production rate is sq ft/hr, so a
  // "visit"/"each" quantity can't be divided by it (see computeLineItem).
  const isAutoHrs =
    row.budgetMethod === "production_rate" &&
    !!row.productionRateSqftPerHr &&
    row.productionRateSqftPerHr > 0 &&
    isAreaUnit(row.unitType);

  // ── row-level warnings (shown in a sub-row under the line) ────────────────
  // Production-rate budgeting with a non-area unit: hours can't be derived, so
  // the line would quietly go out with 0 budgeted hours.
  const unitWarning = needsProductionRateUnitWarning(row.budgetMethod, row.unitType);
  // No rate: the line totals $0 and would be sent to the client as free.
  const noRateWarning = row.rowType !== "section" && row.rateCents === 0 && (row.adjRateCents ?? 0) === 0;
  // Client takeoff the sq ft qty could be defaulted from (offered, never forced).
  const takeoffSqft = isAreaUnit(row.unitType) ? resolveTakeoffSqft(row.serviceName, takeoff) : null;
  const offerTakeoff = takeoffSqft !== null && row.qty !== takeoffSqft;

  // Is Cost auto-calculated from Budgeted Hours × the org's breakeven labor
  // rate? costCents stays 0 (see computeLineItem) for as long as this is
  // true — display-only, computed fresh from totalCostCents here rather
  // than persisting a derived per-unit value that would poison the NEXT
  // Qty/Budgeted-Hours edit (see estimate-calc.ts for the corruption that
  // caused — a stale derived rate silently re-multiplied by qty again).
  const displayMarginBps =
    equipmentCents > 0 && row.totalCents > 0
      ? Math.round(((row.totalCents - row.totalCostCents - equipmentCents) / row.totalCents) * 10000)
      : row.marginBps;
  const isAutoCost = !costFocused && row.costCents === 0 && !!breakevenRateCents && row.budgetedHours > 0;
  const isComplexityAdjusted = row.complexityBps !== 10000;
  const autoCostPerUnitCents = isAutoCost
    ? row.totalCostCents / (row.qty > 0 ? row.qty : 1) / (row.visits > 0 ? row.visits : 1)
    : 0;

  return (
    <>
      {/* ── main row ──────────────────────────────────────────────────────── */}
      <tr
        ref={setNodeRef}
        style={dragStyle}
        className={cn(
          "group border-b border-slate-100 dark:border-neutral-800 bg-card text-xs hover:bg-slate-50 dark:hover:bg-muted/40",
          selected && "bg-brand-50 dark:bg-brand-900/30",
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
              className="cursor-grab touch-none text-slate-300 dark:text-neutral-500 hover:text-muted-foreground active:cursor-grabbing"
              title="Drag to reorder"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(row.id)}
              className="h-3.5 w-3.5 rounded border-slate-300 dark:border-neutral-700 text-brand-500 dark:text-brand-400"
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
                } catch (err) {
                  toast.error(mutationErrorMessage(err, "Failed to save tier"));
                }
              }}
              className="w-full rounded border border-border bg-card px-1 py-0.5 text-[10px] focus:outline-none"
            >
              <option value="all">All</option>
              <option value="basic">Basic</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
            </select>
          </td>
        )}

        {/* Service name + expand chevron */}
        <td
          className={cn(
            "min-w-[160px] px-2 py-1.5 font-semibold text-slate-900 dark:text-neutral-100",
            // A package's visits sit under its header, indented like sub-items on other lines.
            item.packageId && "border-l-2 border-brand-300 dark:border-brand-700 pl-6"
          )}
        >
          <div className="flex items-center gap-1">
            <button
              onClick={() => onToggleExpand(item.id)}
              title={expanded ? "Collapse sub-items" : "Expand sub-items"}
              className="shrink-0 rounded p-0.5 text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-400"
            >
              {expanded
                ? <ChevronDown className="h-3.5 w-3.5" />
                : <ChevronRight className="h-3.5 w-3.5" />
              }
            </button>
            {subitems.length > 0 && !expanded && (
              <span className="rounded-full bg-slate-200 dark:bg-neutral-700 px-1.5 text-[9px] text-muted-foreground font-normal">
                {subitems.length}
              </span>
            )}
            {row.serviceId ? (
              row.serviceName
            ) : (
              // Catalog lines keep the catalog name; a blank/custom line has
              // no other place to be named, so it would reach the client's
              // proposal as "Custom Item".
              <input
                value={row.serviceName ?? ""}
                onChange={(e) => update("serviceName", e.target.value)}
                onBlur={save}
                placeholder="Line item name"
                aria-label="Line item name"
                className="w-full min-w-0 rounded border border-border bg-card px-1.5 py-0.5 text-xs font-semibold focus:border-brand-400 focus:outline-none"
              />
            )}
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
            className="w-full rounded border border-border bg-card px-1 py-0.5 text-xs focus:outline-none"
          >
            <option value="">—</option>
            {UNIT_TYPES.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </td>

        {/* B.Hr — BASE budgeted hours per visit, before any complexity
            adjustment (estimate-calc.ts keeps the stored value unscaled so it
            can't compound). The complexity-scaled figure is what T.H. shows,
            exactly as Rate is the base and Total carries the adjustment. */}
        <td className="w-20 px-2 py-1.5">
          <div className="flex items-center justify-end gap-0.5">
            {isAutoHrs ? (
              <span className="text-right text-blue-600 dark:text-blue-400 font-medium tabular-nums">{row.budgetedHours.toFixed(2)}</span>
            ) : (
              <>
                <InlineNum
                  value={row.budgetedHours}
                  onChange={(v) => update("budgetedHours", v)}
                  onBlur={save}
                />
                <BudgetedHoursPopover
                  budgetedHours={row.budgetedHours}
                  qty={row.qty}
                  visits={row.visits}
                  calcType={row.calcType}
                  complexityBps={row.complexityBps}
                  totalCostCents={row.totalCostCents}
                  isAutoCost={isAutoCost}
                  breakevenRateCents={breakevenRateCents}
                  onApply={applyBudgetedHoursPatch}
                />
              </>
            )}
          </div>
        </td>

        {/* T.H. — total hours = B.Hr × complexity × Visits */}
        <td
          className="w-14 px-2 py-1.5 text-right tabular-nums text-muted-foreground"
          title={
            isComplexityAdjusted
              ? `${row.budgetedHours.toFixed(2)} base hrs × ${bpsToPercent(row.complexityBps)} complexity × ${row.visits} visit${row.visits === 1 ? "" : "s"}`
              : undefined
          }
        >
          {row.totalBudgetedHours.toFixed(2)}
        </td>

        {/* Calc type */}
        <td className="w-12 px-2 py-1.5 text-center">
          <select
            value={row.calcType}
            onChange={(e) => update("calcType", Number(e.target.value) as 0 | 1)}
            onBlur={save}
            className="rounded border border-border bg-card px-1 py-0.5 text-[10px] focus:outline-none"
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
              <span className="text-[10px] text-slate-300 dark:text-neutral-500 line-through">{centsToDisplay(row.totalCents)}</span>
              <span className="font-medium text-slate-700 dark:text-neutral-300">{centsToDisplay(row.totalCents - row.discountCents)}</span>
            </div>
          ) : (
            <span className="font-medium text-slate-700 dark:text-neutral-300">{centsToDisplay(row.totalCents)}</span>
          )}
        </td>

        {/* GM% — display-only: equipment (internal cost on the line) is netted
            out here, though the stored marginBps (an input to the cost/rate
            math) stays equipment-free. */}
        <td
          className={cn(
            "w-16 px-2 py-1.5 text-right tabular-nums",
            displayMarginBps >= 3000 ? "text-green-600 dark:text-green-400" : displayMarginBps >= 1000 ? "text-muted-foreground" : "text-red-500 dark:text-red-400"
          )}
          title={equipmentCents > 0 ? `Margin after ${centsToDisplay(equipmentCents)} equipment (before equipment: ${bpsToPercent(row.marginBps)})` : undefined}
        >
          {bpsToPercent(displayMarginBps)}
        </td>

        {/* Cost — auto-derived value (blue) is shown but still editable:
            typing a real number here is what actually sets costCents and
            switches this line out of auto mode going forward. */}
        <td className="w-24 px-2 py-1.5">
          <InlineNum
            value={isAutoCost ? autoCostPerUnitCents / 100 : row.costCents / 100}
            onChange={(v) => update("costCents", Math.round(v * 100))}
            onFocus={() => setCostFocused(true)}
            onBlur={() => { setCostFocused(false); save(); }}
            className={isAutoCost ? "text-blue-600 dark:text-blue-400 font-medium" : undefined}
            zeroAsEmpty={false}
          />
        </td>

        {/* T. Cost */}
        <td
          className="w-24 px-2 py-1.5 text-right tabular-nums text-muted-foreground"
          title={equipmentCents > 0 ? `${centsToDisplay(row.totalCostCents)} line cost + ${centsToDisplay(equipmentCents)} equipment` : undefined}
        >
          {centsToDisplay(row.totalCostCents + equipmentCents)}
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
            {/* Complexity lives OUTSIDE the hover-reveal group: an adjusted
                line has to be identifiable at rest. Hover-reveal is also
                unreliable on touch (tablet-breakpoint policy), which made a
                125% line indistinguishable from a standard one on an iPad.
                The trigger hides itself when the line is unadjusted, so the
                row is no busier than before. */}
            <LineItemComplexityPopover
              complexityBps={row.complexityBps}
              onSave={saveComplexity}
            />
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <LineItemNotesPopover
              notes={{ estimateDesc: row.estimateDesc ?? null, jobNote: row.jobNote ?? null, invoiceDesc: row.invoiceDesc ?? null, internalNote: row.internalNote ?? null, treatedArea: row.treatedArea ?? null }}
              onSave={saveNotes}
            />
            <button
              onClick={() => onDuplicate(row)}
              title="Duplicate"
              className="rounded p-0.5 text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-400"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onDelete(row.id)}
              title="Delete"
              className="rounded p-0.5 text-slate-400 dark:text-neutral-500 hover:text-red-500 dark:hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            </div>
          </div>
        </td>

        {/* Save indicator */}
        <td className="w-6 px-1 py-1.5">
          {isPending && <span className="text-[10px] text-slate-400 dark:text-neutral-500">…</span>}
          {dirty && !isPending && (
            <button
              onClick={save}
              className="text-[10px] font-medium text-brand-500 dark:text-brand-400 hover:underline"
            >
              save
            </button>
          )}
        </td>
      </tr>

      {/* ── sub-row: production rate hint ─────────────────────────────────── */}
      {/* The production rate is always sq ft per man-hour — label it that way
          regardless of the service unit (a "visit"-unit line never gets here). */}
      {isAutoHrs && row.qty > 0 && (
        <tr className="border-b border-slate-50 dark:border-neutral-800 bg-blue-50/40 dark:bg-blue-950/40 text-[10px] text-blue-500 dark:text-blue-400">
          <td colSpan={3} />
          <td colSpan={3} className="px-2 py-0.5 italic">
            {row.qty.toLocaleString()} sq ft ÷ {row.productionRateSqftPerHr!.toLocaleString()} sq ft/hr
          </td>
          <td className="px-2 py-0.5 text-right text-blue-600 dark:text-blue-400 font-medium">
            = {row.budgetedHours.toFixed(2)} hrs/occ
          </td>
          <td colSpan={11} />
        </tr>
      )}

      {/* ── sub-row: warnings / takeoff shortcut ───────────────────────────── */}
      {(unitWarning || noRateWarning || offerTakeoff) && (
        <tr className="border-b border-slate-50 dark:border-neutral-800 bg-amber-50/60 dark:bg-amber-950/40 text-[10px] text-amber-800 dark:text-amber-300">
          <td colSpan={18} className="px-3 py-1">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
              {unitWarning && (
                <span className="inline-flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
                  Production-rate budgeting needs an area unit (sq ft) — set the service unit
                  {" "}or enter hours manually. Current unit: {unitLabel(row.unitType, "none")}.
                </span>
              )}
              {noRateWarning && (
                <span className="inline-flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
                  No rate set — this line totals $0.00.
                </span>
              )}
              {offerTakeoff && takeoffSqft !== null && (
                <button
                  type="button"
                  onClick={() => { update("qty", takeoffSqft); }}
                  className="font-medium text-brand-600 dark:text-brand-400 hover:underline"
                  title="Set Qty from the client's measured area"
                >
                  Use client takeoff ({takeoffSqft.toLocaleString()} sq ft)
                </button>
              )}
            </div>
          </td>
        </tr>
      )}

      {/* ── sub-items ─────────────────────────────────────────────────────── */}
      {expanded && (
        <SubitemRows
          lineItemId={item.id}
          onAddClick={() => setAddSubitemOpen(true)}
        />
      )}
      {expanded && (
        <LineItemEquipmentRows
          lineItemId={item.id}
          revenueCents={row.totalCents}
          lineCostCents={row.totalCostCents}
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
  /** The estimate's client — used to default sq ft quantities from their takeoff. */
  clientId?: string;
  /** The estimate's property, if set — drives Rate Matrix lookups when a service being added has matrix rows keyed off one of this property's custom field values. */
  propertyId?: string | null;
  items: EstimateLineItem[];
  /** Every live line on the estimate, not just the ones the status tab shows — package
   *  delete and fill-down act on the whole package, including hidden visits. */
  allItems?: EstimateLineItem[];
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  tiersEnabled?: boolean;
  onItemStatusChange?: (status: LineItemStatus) => void;
}

export function EstimateLineItemsGrid({ estimateId, clientId, propertyId, items, allItems, selectedIds = [], onSelectionChange, tiersEnabled = false, onItemStatusChange }: Props) {
  const everyItem = allItems ?? items;
  const { data: subitemTotals = {} } = useEstimateSubitemTotals(estimateId);
  const { data: services } = useCRMServices();
  const { data: orgSettings } = useOrgSettings();
  const breakevenRateCents = getBreakevenRateCents(orgSettings?.customizations);

  // Client takeoff (measured areas) — from the client's fixed measurement
  // columns plus any numeric custom fields — so a production-rate sq ft
  // service can default its qty instead of starting at 1.
  const { data: client } = useClient(clientId ?? "");
  // Prefetch only — addService reads the property's field value straight from
  // the DB so it can't race this query (see the comment there). Keeping the
  // hook warms the cache and keeps the values a click away.
  const { data: propertyFieldValues = [] } = usePropertyCustomFieldValues(propertyId ?? "");
  const { data: customFieldDefs = [] } = useCustomFieldDefs();
  const { data: customFieldValues = [] } = useClientCustomFieldValues(clientId ?? "");
  // When the estimate is for one of the client's properties, its quantities come from
  // that property: a satellite property's own measurements (blank stays blank rather
  // than borrowing another address's numbers), while the client's own-address (master)
  // property still falls back to the client's figures it mirrors. No property = the client's.
  const { data: clientProperties = [] } = useClientProperties(clientId ?? "");
  const estimateProperty = propertyId ? clientProperties.find((p) => p.id === propertyId) ?? null : null;
  const useSatelliteTakeoff = !!estimateProperty && !estimateProperty.isMaster;
  const takeoff: ClientTakeoff | null = client
    ? {
        turfSqft: useSatelliteTakeoff ? estimateProperty.turfSqft ?? null : (estimateProperty?.turfSqft ?? client.turfSqft ?? null),
        mulchBedSqft: useSatelliteTakeoff ? estimateProperty.mulchBedSqft ?? null : (estimateProperty?.mulchBedSqft ?? client.mulchBedSqft ?? null),
        grossSqft: useSatelliteTakeoff ? estimateProperty.grossSqft ?? null : (estimateProperty?.grossSqft ?? client.grossSqft ?? null),
        // A satellite uses only its own property-level values; the client-level ones
        // belong to the master address and must not leak in.
        customNumeric: Object.fromEntries(
          (useSatelliteTakeoff ? propertyFieldValues : customFieldValues).flatMap((v) => {
            const def = customFieldDefs.find((d) => d.id === v.fieldDefId);
            return def && def.fieldType === "number" && typeof v.valueNumber === "number"
              ? [[def.name.toLowerCase(), v.valueNumber]]
              : [];
          }),
        ),
      }
    : null;
  const { data: productCatalog = [] } = useProducts();
  const materialProducts = productCatalog.filter(
    (p) => p.category === "stocked_material" || p.category === "project_material"
  );
  const { mutateAsync: upsert } = useUpsertLineItem();
  const { mutateAsync: applyEquipmentDefaults } = useApplyServiceEquipmentDefaults();
  const { mutateAsync: deleteItem } = useDeleteLineItem();
  const { data: packages = [] } = usePackages(false);
  const { data: discounts = [] } = useDiscounts();
  const activeDiscounts = discounts.filter((d) => d.isActive);

  // Deleting a package's header takes all of its visits with it, after a confirm.
  const [packageDelete, setPackageDelete] = useState<{ id: string; name: string; lineIds: string[] } | null>(null);

  const handleDelete = useCallback(
    async (id: string) => {
      const target = everyItem.find((i) => i.id === id);
      // The package's own visits, by position from the full list: lines hidden by the status
      // tab are still part of it, and a second copy of the same package is a separate group.
      const groupIds = target?.rowType === "section" && target.packageId ? packageGroupLineIds(id, everyItem) : [];
      if (groupIds.length > 0) {
        setPackageDelete({ id, name: target?.sectionName ?? "this package", lineIds: groupIds });
        return;
      }
      try {
        await deleteItem({ id, estimateId });
      } catch (err) {
        toast.error(mutationErrorMessage(err, "Failed to delete line item"));
      }
    },
    [deleteItem, estimateId, everyItem]
  );

  async function confirmPackageDelete() {
    const pending = packageDelete;
    setPackageDelete(null);
    if (!pending) return;
    try {
      for (const lineId of pending.lineIds) await deleteItem({ id: lineId, estimateId });
      await deleteItem({ id: pending.id, estimateId });
    } catch (err) {
      toast.error(mutationErrorMessage(err, "Failed to delete the package"));
    }
  }

  /** SA-style fill down: copy the package's first visit's value(s) onto every other visit,
   *  recomputing each line's totals the same way editing the cell would. */
  async function fillPackageDown(packageId: string, field: FillDownField, headerId?: string) {
    // This header's own visits only (a package added twice is two groups).
    const groupIds = headerId ? new Set(packageGroupLineIds(headerId, everyItem)) : null;
    const lines = everyItem.filter((i) =>
      !i.deletedAt && i.rowType !== "section" && (groupIds ? groupIds.has(i.id) : i.packageId === packageId)
    );
    const [first, ...rest] = lines;
    if (!first || rest.length === 0) return;
    const pick = (src: EstimateLineItem): Partial<EstimateLineItem> => {
      switch (field) {
        case "qty": return { qty: src.qty };
        case "rate": return { rateCents: src.rateCents };
        case "hours": return { budgetedHours: src.budgetedHours };
        case "cost": return { costCents: src.costCents };
        case "adj": return { adjRateCents: src.adjRateCents };
        default: return {
          qty: src.qty, rateCents: src.rateCents, calcType: src.calcType,
          budgetedHours: src.budgetedHours, costCents: src.costCents, adjRateCents: src.adjRateCents,
        };
      }
    };
    try {
      for (const line of rest) {
        const next = { ...line, ...pick(first) };
        const computed = computeLineItem(next, breakevenRateCents);
        const merged = { ...next, ...computed };
        const withDiscount = { ...merged, discountCents: resolveLineDiscountCents(merged) };
        await upsert({
          estimateId,
          item: {
            id: line.id,
            calc_type: withDiscount.calcType,
            qty: withDiscount.qty,
            rate_cents: withDiscount.rateCents,
            total_cents: withDiscount.totalCents,
            discount_cents: withDiscount.discountCents,
            budgeted_hours: withDiscount.budgetedHours,
            total_budgeted_hours: withDiscount.totalBudgetedHours,
            cost_cents: withDiscount.costCents,
            total_cost_cents: withDiscount.totalCostCents,
            margin_bps: withDiscount.marginBps,
            markup_bps: withDiscount.markupBps,
            adj_rate_cents: withDiscount.adjRateCents,
          },
        });
      }
      toast.success(`Copied from "${first.serviceName}" to ${rest.length} other visit${rest.length !== 1 ? "s" : ""}`);
    } catch (err) {
      toast.error(mutationErrorMessage(err, "Failed to copy the values down"));
    }
  }

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
            budget_method: item.budgetMethod,
            complexity_bps: item.complexityBps,
            tier: item.tier,
            // The copy is an ordinary line: a package has exactly its own steps, and an
            // extra tagged line would convert into a priced service with no visit.
            package_id: null,
            discount_cents: item.discountCents,
            discount_type: item.discountType,
            discount_value: item.discountValue,
            applied_discount_id: item.appliedDiscountId,
            estimate_desc: item.estimateDesc,
            job_note: item.jobNote,
            invoice_desc: item.invoiceDesc,
            internal_note: item.internalNote,
            treated_area: item.treatedArea,
            sort_order: items.length,
          },
        });
      } catch (err) {
        toast.error(mutationErrorMessage(err, "Failed to duplicate line item"));
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

  async function addService(svc: { name: string; id?: string; unit?: string; productionRate?: number | null; budgetMethod?: BudgetMethod; rateCents?: number | null; estimateDesc?: string | null; invoiceDesc?: string | null; visits?: number; packageId?: string | null; sortOrder?: number; budgetedHours?: number | null; lockRate?: boolean }) {
    const unit = svc.unit ?? null;
    const prodRate = svc.productionRate ?? null;
    let budgetMethod = svc.budgetMethod ?? "manual";

    // A production-rate service measured in sq ft starts from the client's
    // takeoff (e.g. Turf Sq. Ft.) so budgeted hours are real from the first
    // render, instead of qty 1 ÷ rate ≈ 0 hrs. Nothing is written to the client.
    const takeoffQty = budgetMethod === "production_rate" && isAreaUnit(unit)
      ? resolveTakeoffSqft(svc.name, takeoff)
      : null;
    // A package step's rate is a per-visit price (lockRate), not a per-sq-ft rate:
    // never multiply it by the client's takeoff.
    let qty = svc.lockRate ? 1 : (takeoffQty ?? 1);

    // Rate Matrix override: if this service has banded rows keyed off a
    // property custom field, and the estimate has a property with a value
    // for that field, the matched row's rate/hours/cost replace the flat
    // production_rate lookup entirely — snapshotted once at add-time (same
    // moment budgetMethod/productionRateSqftPerHr are normally snapshotted),
    // not re-resolved on every render. No property, no matrix rows, or no
    // value for the property → falls through to today's unchanged behavior.
    let calcType: 0 | 1 = 1;
    let effectiveRateCents = svc.rateCents ?? 0;
    const lineVisits = Math.max(1, Math.round(svc.visits ?? 1));
    let matrixBudgetedHours: number | null = svc.budgetedHours ?? null;
    let matrixCostCents: number | null = null;
    let matrixProductionRate: number | null = null;
    // A package step's own price (lockRate) is only the fallback: when the service
    // has Rate Matrix rows keyed off a property field (e.g. Turf Sq. Ft.) that the
    // estimate's property has a value for, the matched band prices the visit, so a
    // package honors custom fields the same as the service added on its own.
    if (svc.id && (propertyId || clientId)) {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: matrixRows } = await (supabase as any)
        .from("crm_service_rate_matrix")
        .select("*")
        .eq("service_id", svc.id)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });
      const rows = (matrixRows ?? []) as Record<string, unknown>[];
      const customFieldId = rows[0]?.custom_field_id as string | undefined;
      // Read the property's value for the lookup field STRAIGHT FROM THE DB
      // rather than from the usePropertyCustomFieldValues cache. That cache is
      // a closure capture with no isLoading gate, so adding a service in the
      // first few hundred ms after the estimate opened found an empty array,
      // silently skipped the matrix and priced the line at the service's flat
      // rate — indistinguishable, once saved, from a genuinely matrix-priced
      // line. The matrix rows are already being fetched here on the same
      // round trip; one more point lookup removes the race entirely instead of
      // just narrowing it.
      // Property value first (custom value, then the property's own takeoff
      // column), then the client's value for the same field — so a number
      // entered once on the client prices every estimate without a property,
      // and a property can override it.
      const propertyValue: number | null = customFieldId
        ? await fetchFieldValueWithClientFallback(supabase, customFieldId, propertyId ?? null, clientId ?? null)
        : null;
      if (rows.length > 0 && propertyValue != null) {
        const mapped: RateMatrixRow[] = rows.map((r) => ({
          id: r.id as string,
          orgId: r.org_id as string,
          serviceId: r.service_id as string,
          customFieldId: r.custom_field_id as string,
          calcType: r.calc_type as 0 | 1,
          fromVal: Number(r.from_val ?? 0),
          toVal: r.to_val != null ? Number(r.to_val) : null,
          rateCents: (r.rate_cents as number) ?? 0,
          budgetedHours: Number(r.budgeted_hours ?? 0),
          budgetedCostCents: (r.budgeted_cost_cents as number) ?? 0,
          sortOrder: (r.sort_order as number) ?? 0,
          isTailRow: (r.is_tail_row as boolean) ?? false,
          tailEveryQty: r.tail_every_qty != null ? Number(r.tail_every_qty) : null,
          tailOverQty: r.tail_over_qty != null ? Number(r.tail_over_qty) : null,
        }));
        let match = lookupRateMatrixMatch(mapped, propertyValue);
        // Past the end of the bands: the service's overflow rule ("every Y over
        // X adds $R") takes over from a tail row or the flat rate.
        if (!match || match.isTailRow) {
          const { data: tailSvc } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
            .from("crm_services")
            .select("matrix_tail_every_qty, matrix_tail_over_qty, matrix_tail_rate_cents, matrix_tail_hours, matrix_tail_cost_cents")
            .eq("id", svc.id)
            .maybeSingle();
          if (tailSvc) {
            match = applyMatrixTail(mapped, propertyValue, {
              everyQty: Number(tailSvc.matrix_tail_every_qty ?? 0),
              overQty: Number(tailSvc.matrix_tail_over_qty ?? 0),
              rateCents: tailSvc.matrix_tail_rate_cents ?? 0,
              hours: Number(tailSvc.matrix_tail_hours ?? 0),
              costCents: tailSvc.matrix_tail_cost_cents ?? 0,
            }) ?? match;
          }
        }
        // A package step with its own price under a per-unit band: the visit's quantity is the
        // client's takeoff, else the very value the band was matched on. With no quantity at
        // all, keep the step's locked price rather than one unit of a per-sq-ft rate.
        let packageBandQty: number | null = null;
        if (match && svc.lockRate && match.calcType === 1) {
          packageBandQty = (isAreaUnit(unit) ? resolveTakeoffSqft(svc.name, takeoff) : null)
            ?? (propertyValue > 0 ? propertyValue : null);
          if (packageBandQty == null) match = null;
        }
        if (match) {
          calcType = match.calcType;
          effectiveRateCents = match.rateCents;
          matrixCostCents = match.budgetedCostCents;
          // A per-unit matrix row's rate and cost are both per-unit, so
          // computeLineItem's calcType formula rescales them for free when the
          // qty changes later. Its hours don't get that treatment under the
          // 'manual' budget method, which used to leave hours frozen at
          // `match.budgetedHours × the add-time qty` — change the qty
          // afterwards and price moved while hours didn't, quietly breaking
          // the line's $/man-hour.
          //
          // A per-unit matrix row on an area line is exactly a production rate
          // expressed the other way up (hours per sq ft vs sq ft per hour), so
          // express it that way and let the production_rate branch re-derive
          // hours from qty on every recompute. Fixed ($) matrix rows genuinely
          // shouldn't scale with qty, and a per-unit row on a non-area unit
          // can't be stated as a sq ft/hr production rate at all — both keep
          // the manual snapshot.
          // A per-unit band on an area line prices per sq ft, so a package visit
          // (qty forced to 1 above) needs the client's takeoff as its quantity.
          if (packageBandQty != null) qty = packageBandQty;
          if (match.calcType === 1 && match.budgetedHours > 0 && isAreaUnit(unit)) {
            matrixProductionRate = 1 / match.budgetedHours;
            budgetMethod = "production_rate";
          } else {
            matrixBudgetedHours = match.calcType === 1 ? match.budgetedHours * qty : match.budgetedHours;
            budgetMethod = "manual";
          }
        }
      }
    }

    const computed = computeLineItem({
      calcType,
      qty,
      rateCents: effectiveRateCents,
      visits: lineVisits,
      budgetedHours: matrixBudgetedHours ?? 0, // derived from qty ÷ production rate (production_rate), a Rate Matrix match, or set manually
      costCents: matrixCostCents ?? 0,
      adjRateCents: null,
      unitType: unit,
      productionRateSqftPerHr: matrixProductionRate ?? prodRate,
      budgetMethod,
    }, breakevenRateCents);

    try {
      const added = await upsert({
        estimateId,
        item: {
          service_id: svc.id ?? null,
          service_name: svc.name,
          status: "quote",
          calc_type: calcType,
          qty,
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
          production_rate_sqft_per_hr: matrixProductionRate ?? prodRate,
          budget_method: budgetMethod,
          rate_cents: effectiveRateCents,
          visits: lineVisits,
          package_id: svc.packageId ?? null,
          cost_cents: computed.costCents,
          adj_rate_cents: null,
          sort_order: svc.sortOrder ?? items.length,
          total_cents: computed.totalCents,
          budgeted_hours: computed.budgetedHours,
          total_budgeted_hours: computed.totalBudgetedHours,
          total_cost_cents: computed.totalCostCents,
          margin_bps: computed.marginBps,
          markup_bps: computed.markupBps,
        },
      });
      // Pre-fill the service's default equipment (internal cost) onto the new line.
      if (svc.id && added?.id) {
        await applyEquipmentDefaults({ serviceId: svc.id, lineItemId: added.id, estimateId }).catch(() => {
          toast.error("Added the item, but couldn't pre-fill its default equipment");
        });
      }
      return true;
    } catch (err) {
      toast.error(mutationErrorMessage(err, "Failed to add item"));
      return false;
    }
  }

  /**
   * Adds a package as one tagged line per package service, in package order,
   * under a section header named after the package. Each line keeps the
   * package's own pricing (its per-visit rate, falling back to the service's
   * default) and its visit count (visitsIncluded), so the line math is the
   * ordinary qty x rate x visits. The package's "description on estimate" is stored on
   * the section header (with the package id), which is what the proposal, PDF
   * and portal print as the package's main wording.
   * Lines carry tier = null (all tiers), exactly like any other added line.
   */
  async function addPackage(pkg: CRMPackage) {
    // Two copies of one package share a package_id, which converts into a single package job
    // and confuses delete/fill-down; edit the visits of the existing one instead.
    if (everyItem.some((i) => !i.deletedAt && i.rowType === "section" && i.packageId === pkg.id)) {
      toast.error(`"${pkg.name}" is already on this estimate — change its visits instead of adding it again`);
      return;
    }
    const steps = [...(pkg.services ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    if (steps.length === 0) {
      toast.error(`"${pkg.name}" has no services — add them in CRM Settings → Packages`);
      return;
    }
    try {
      await upsert({
        estimateId,
        item: {
          row_type: "section",
          section_name: pkg.name,
          // Marks the section as a package group; its estimate_desc is the
          // package's client-facing wording.
          package_id: pkg.id,
          estimate_desc: pkg.descriptionOnEstimate ? stripHtml(pkg.descriptionOnEstimate) || null : null,
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
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        // The package step may reference its service by id or only by name
        // (older packages) — same fallback NewJobDialog.pickPackage uses.
        const match = activeServices.find((s) => s.id === step.serviceId)
          ?? activeServices.find((s) => s.name.trim().toLowerCase() === step.serviceName.trim().toLowerCase());
        const serviceDesc = match?.descriptionOnEstimate ? stripHtml(match.descriptionOnEstimate) : "";
        const rate = step.defaultRateCents || match?.defaultRateCents || 0;
        const ok = await addService({
          id: match?.id,
          name: step.serviceName,
          unit: match?.unit ?? undefined,
          productionRate: match?.productionRateSqftPerHr ?? null,
          budgetMethod: match?.budgetMethod,
          rateCents: rate,
          estimateDesc: serviceDesc || null,
          invoiceDesc: match?.invoiceDescription ?? null,
          visits: step.visitsIncluded || 1,
          packageId: pkg.id,
          sortOrder: items.length + 1 + i,
          budgetedHours: step.defaultBHrs ?? null,
          lockRate: !!step.defaultRateCents,
        });
        if (!ok) {
          toast.error(`Package added only up to "${step.serviceName}" — remove the partial package and try again`);
          return;
        }
      }
    } catch (err) {
      toast.error(mutationErrorMessage(err, "Failed to add package"));
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
    } catch (err) {
      toast.error(mutationErrorMessage(err, "Failed to add section"));
    }
  }

  const [addOpen, setAddOpen] = useState(false);
  const [pkgOpen, setPkgOpen] = useState(false);
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
    const selectable = items.filter((i) => i.rowType !== "section").map((i) => i.id);
    onSelectionChange(selectedIds.length === selectable.length ? [] : selectable);
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
          <ChevronDown className="ml-1 h-3 w-3 text-slate-400 dark:text-neutral-500" />
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
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">Services</div>
              {filteredServices.map((s) => (
                <button
                  key={s.id}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-muted/40"
                  onClick={() => {
                    addService({ id: s.id, name: s.name, unit: s.unit ?? undefined, productionRate: s.productionRateSqftPerHr, budgetMethod: s.budgetMethod, rateCents: s.defaultRateCents, estimateDesc: s.descriptionOnEstimate, invoiceDesc: s.invoiceDescription });
                    setAddOpen(false); setSearch("");
                  }}
                >
                  <span className="font-medium text-slate-900 dark:text-neutral-100">{s.name}</span>
                  {s.productionRateSqftPerHr && (
                    <span className="ml-2 shrink-0 text-[10px] text-slate-400 dark:text-neutral-500">
                      {s.productionRateSqftPerHr.toLocaleString()} sq ft/hr
                    </span>
                  )}
                </button>
              ))}
            </>
          )}
          {filteredProducts.length > 0 && (
            <>
              <div className="mt-1 border-t px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">Products / Materials</div>
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-muted/40"
                  onClick={() => {
                    addService({ name: p.name, unit: "each", rateCents: p.price });
                    setAddOpen(false); setSearch("");
                  }}
                >
                  <span className="font-medium text-slate-900 dark:text-neutral-100">{p.name}</span>
                  {p.price > 0 && (
                    <span className="ml-2 shrink-0 text-[10px] text-slate-400 dark:text-neutral-500">
                      ${(p.price / 100).toFixed(2)}
                    </span>
                  )}
                </button>
              ))}
            </>
          )}
          {filteredServices.length === 0 && filteredProducts.length === 0 && lc && (
            <div className="px-3 py-3 text-xs text-slate-400 dark:text-neutral-500">No results for &ldquo;{search}&rdquo;</div>
          )}
          {activeServices.length === 0 && !lc && (
            // A new org has no catalog yet: point at where services are set up.
            <a href="/crm/settings?tab=services" className="block px-3 py-2 text-xs text-brand-600 dark:text-brand-400 hover:underline">
              No services yet — add your services in Settings → Services
            </a>
          )}
          <div className="mt-1 border-t">
            <button
              className="flex w-full items-center px-3 py-1.5 text-xs text-muted-foreground hover:bg-slate-50 dark:hover:bg-muted/40"
              onClick={() => { addService({ name: "Custom Item" }); setAddOpen(false); setSearch(""); }}
            >
              <Plus className="mr-1.5 h-3 w-3" /> Blank line item
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );

  const packageButton = packages.length > 0 ? (
    <Popover open={pkgOpen} onOpenChange={setPkgOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs">
          <PackageIcon className="mr-1 h-3.5 w-3.5" /> Add Package
          <ChevronDown className="ml-1 h-3 w-3 text-slate-400 dark:text-neutral-500" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="max-h-72 overflow-y-auto py-1">
          {packages.map((p) => (
            <button
              key={p.id}
              className="flex w-full items-center justify-between px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-muted/40"
              onClick={() => { setPkgOpen(false); void addPackage(p); }}
            >
              <span className="font-medium text-slate-900 dark:text-neutral-100">{p.name}</span>
              <span className="ml-2 shrink-0 text-[10px] text-slate-400 dark:text-neutral-500">
                {(p.services ?? []).length} service{(p.services ?? []).length === 1 ? "" : "s"}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  ) : null;

  return (
    <div className="flex min-h-[250px] flex-col rounded-lg border bg-card shadow-sm">
      {/* Add Item toolbar — always visible at the top */}
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2 bg-slate-50 dark:bg-muted/40">
        {addItemButton}
        {packageButton}
        <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={addSection}>
          <Heading2 className="mr-1 h-3.5 w-3.5" /> Add Section
        </Button>
      </div>
      <div className="flex-1 overflow-x-auto pb-3">
        {/* DndContext sits outside <table>: its accessibility <div>s are invalid children of <tbody> */}
        <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <table className="w-full min-w-[1200px] text-xs">
          <thead className="text-white" style={{ backgroundColor: orgSettings?.brandColor ?? "#60ab45" }}>
            <tr>
              <th className="w-12 px-1 py-2 text-center">
                <input
                  type="checkbox"
                  checked={items.some((i) => i.rowType !== "section") && selectedIds.length === items.filter((i) => i.rowType !== "section").length}
                  onChange={toggleSelectAll}
                  className="h-3.5 w-3.5 rounded border-slate-300 dark:border-neutral-700"
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
                <td colSpan={tiersEnabled ? 18 : 17} className="py-8 text-center text-slate-400 dark:text-neutral-500 text-xs">
                  No line items yet — use Add Item above
                </td>
              </tr>
            )}
              <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                {items.map((item, idx) => {
                  const next = items[idx + 1];
                  const endsPackage = !!item.packageId && item.rowType !== "section" && next?.packageId !== item.packageId;
                  // The contiguous run of this package's lines ending here, priced like the
                  // estimate total: net of line discounts, plus priced sub-items.
                  let packageTotal = 0;
                  if (endsPackage) {
                    for (let j = idx; j >= 0; j--) {
                      const row = items[j];
                      if (row.rowType === "section" || row.packageId !== item.packageId) break;
                      if (row.status !== "quote" && row.status !== "won") continue;
                      packageTotal += Math.max(0, (row.totalCents ?? 0) - (row.discountCents ?? 0)) + (subitemTotals[row.id] ?? 0);
                    }
                  }
                  return (
                  <Fragment key={item.id}>
                  {item.rowType === "section" ? (
                    <SectionRow
                      key={item.id}
                      item={item}
                      estimateId={estimateId}
                      onDelete={handleDelete}
                      onFillDown={fillPackageDown}
                      tiersEnabled={tiersEnabled}
                    />
                  ) : (
                    <LineItemRow
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
                      takeoff={takeoff}
                    />
                  )}
                  {endsPackage && (
                    <tr className="border-b border-border bg-muted/40">
                      <td colSpan={tiersEnabled ? 18 : 17} className="px-3 py-1.5 text-right text-xs font-semibold">
                        Package subtotal: {formatCurrency(packageTotal)}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
              </SortableContext>
          </tbody>
        </table>
        </DndContext>
      </div>

      <AlertDialog open={packageDelete !== null} onOpenChange={(o) => { if (!o) setPackageDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete package?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{packageDelete?.name}&rdquo; and its {packageDelete?.lineIds.length} visit
              {packageDelete?.lineIds.length !== 1 ? "s" : ""} will be removed from this estimate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPackageDelete}>Delete package</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
