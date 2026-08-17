"use client";

import { useEffect, useState } from "react";
import { useEstimateTemplates, useCreateEstimateTemplate, useUpdateEstimateTemplate, useDeleteEstimateTemplate, useUpsertTemplateItem, useDeleteTemplateItem } from "@/lib/hooks/use-estimate-templates";
import { EstimateDisplaySettingsPanel } from "./EstimateDisplaySettingsPanel";
import { useCRMServices } from "@/lib/hooks/use-crm-jobs";
import { useProducts } from "@/lib/hooks/use-products";
import { useDiscounts } from "@/lib/hooks/use-crm-discounts";
import { LineItemDiscountPopover, type LineItemDiscountPatch } from "@/components/shared/LineItemDiscountPopover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { centsToDisplay } from "@/lib/estimate-calc";
import type { CRMDiscount } from "@/types/crm-discounts";
import type { EstimateTemplate, EstimateTemplateItem } from "@/types/crm-estimates";
import type { BudgetMethod } from "@/types/crm-jobs";

// ── template item row (inside edit dialog) ────────────────────────────────────

function TemplateItemRow({
  item,
  templateId,
  discounts,
}: {
  item: EstimateTemplateItem;
  templateId: string;
  discounts: CRMDiscount[];
}) {
  const [row, setRow] = useState(item);
  const [dirty, setDirty] = useState(false);
  const { mutateAsync: upsert } = useUpsertTemplateItem();
  const { mutateAsync: remove } = useDeleteTemplateItem();

  useEffect(() => {
    if (!dirty) setRow(item);
  }, [item, dirty]);

  function update<K extends keyof EstimateTemplateItem>(k: K, v: EstimateTemplateItem[K]) {
    setRow((p) => ({ ...p, [k]: v }));
    setDirty(true);
  }

  async function save() {
    if (!dirty) return;
    try {
      await upsert({
        templateId,
        item: {
          id: row.id,
          service_id: row.serviceId,
          service_name: row.serviceName,
          calc_type: row.calcType,
          qty: row.qty,
          unit_type: row.unitType,
          rate_cents: row.rateCents,
          visits: row.visits,
          budgeted_hours: row.budgetedHours,
          sort_order: row.sortOrder,
          discount_cents: row.discountCents,
          discount_type: row.discountType,
          discount_value: row.discountValue,
          applied_discount_id: row.appliedDiscountId,
        },
      });
      setDirty(false);
    } catch {
      toast.error("Failed to save");
    }
  }

  async function saveDiscount(patch: LineItemDiscountPatch) {
    setRow((p) => ({
      ...p,
      discountCents: patch.discountCents,
      discountType: patch.discountType,
      discountValue: patch.discountValue,
      appliedDiscountId: patch.appliedDiscountId,
    }));
    try {
      await upsert({
        templateId,
        item: {
          id: row.id,
          discount_cents: patch.discountCents,
          discount_type: patch.discountType,
          discount_value: patch.discountValue,
          applied_discount_id: patch.appliedDiscountId,
        },
      });
    } catch {
      toast.error("Failed to save discount");
    }
  }

  const grossCents = Math.round(row.qty * row.rateCents * row.visits);

  return (
    <tr className="group border-b border-slate-100 text-xs hover:bg-slate-50">
      <td className="px-3 py-1.5 font-medium text-slate-800">{row.serviceName}</td>
      <td className="px-3 py-1.5">
        <input
          type="number"
          value={row.visits}
          onChange={(e) => update("visits", Number(e.target.value))}
          onBlur={save}
          className="w-14 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs focus:outline-none"
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          type="number"
          value={row.qty}
          onChange={(e) => update("qty", Number(e.target.value))}
          onBlur={save}
          className="w-14 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs focus:outline-none"
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          type="text"
          value={row.unitType ?? ""}
          onChange={(e) => update("unitType", e.target.value || null)}
          onBlur={save}
          placeholder="—"
          className="w-14 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-center text-xs focus:outline-none"
        />
      </td>
      <td className="px-3 py-1.5">
        <select
          value={row.calcType}
          onChange={(e) => update("calcType", Number(e.target.value) as 0 | 1)}
          onBlur={save}
          className="rounded border border-slate-200 bg-white px-1 py-0.5 text-xs focus:outline-none"
        >
          <option value={1}>1</option>
          <option value={0}>0</option>
        </select>
      </td>
      <td className="px-3 py-1.5">
        <input
          type="number"
          value={row.rateCents / 100}
          onChange={(e) => update("rateCents", Math.round((Number(e.target.value) || 0) * 100))}
          onBlur={save}
          className="w-20 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs focus:outline-none"
        />
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
        {centsToDisplay(grossCents - row.discountCents)}
      </td>
      <td className="px-3 py-1.5">
        <input
          type="number"
          value={row.budgetedHours}
          onChange={(e) => update("budgetedHours", Number(e.target.value))}
          onBlur={save}
          className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs focus:outline-none"
        />
      </td>
      <td className="px-3 py-1.5">
        <LineItemDiscountPopover
          discountCents={row.discountCents}
          discountType={row.discountType}
          discountValue={row.discountValue}
          appliedDiscountId={row.appliedDiscountId}
          lineTotalCents={grossCents}
          discounts={discounts}
          onSave={saveDiscount}
        />
      </td>
      <td className="px-3 py-1.5">
        <button
          onClick={() => remove(row.id)}
          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

// ── edit template dialog ──────────────────────────────────────────────────────

function EditTemplateDialog({
  template,
  open,
  onOpenChange,
}: {
  template: EstimateTemplate;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data: services } = useCRMServices();
  const { data: productCatalog = [] } = useProducts();
  const materialProducts = productCatalog.filter(
    (p) => p.category === "stocked_material" || p.category === "project_material"
  );
  const { data: discounts = [] } = useDiscounts();
  const activeDiscounts = discounts.filter((d) => d.isActive);
  const { mutateAsync: upsert } = useUpsertTemplateItem();
  const { mutateAsync: updateTemplate } = useUpdateEstimateTemplate();
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");

  async function addItem(input: {
    name: string;
    id?: string;
    unit?: string;
    rateCents?: number | null;
    budgetMethod?: BudgetMethod;
    productionRateSqftPerHr?: number | null;
  }) {
    try {
      await upsert({
        templateId: template.id,
        item: {
          service_id: input.id ?? null,
          service_name: input.name,
          calc_type: 1,
          qty: 1,
          unit_type: input.unit ?? null,
          rate_cents: input.rateCents ?? 0,
          visits: 1,
          budgeted_hours: 0,
          sort_order: (template.items ?? []).length,
          budget_method: input.budgetMethod ?? "manual",
          production_rate_sqft_per_hr: input.productionRateSqftPerHr ?? null,
        },
      });
      setAddOpen(false);
      setSearch("");
    } catch {
      toast.error("Failed to add item");
    }
  }

  const activeServices = (services ?? []).filter((s) => s.isActive);
  const lc = search.toLowerCase();
  const filteredServices = lc
    ? activeServices.filter((s) => s.name.toLowerCase().includes(lc))
    : activeServices;
  const filteredProducts = lc
    ? materialProducts.filter((p) => p.name.toLowerCase().includes(lc))
    : materialProducts;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit Template — {template.name}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex flex-col gap-1">
              <Label className="text-slate-500">Show when creating</Label>
              <span className="capitalize text-slate-800">{template.showWhen}</span>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-slate-500">Est. Document</Label>
              <span className="text-slate-800">{template.estDocument}</span>
            </div>
          </div>

          <EstimateDisplaySettingsPanel
            title="Client view defaults"
            description="Applied to an estimate's display settings when this template is selected."
            settings={template.displaySettings}
            onChange={(next) => {
              updateTemplate({ id: template.id, patch: { display_settings: next } }).catch(() =>
                toast.error("Failed to save")
              );
            }}
          />

          {/* Line items grid */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[680px] text-xs">
              <thead className="bg-primary text-primary-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Service/Package</th>
                  <th className="px-3 py-2 text-center font-medium">Visits</th>
                  <th className="px-3 py-2 text-center font-medium">Qty</th>
                  <th className="px-3 py-2 text-center font-medium">Unit</th>
                  <th className="px-3 py-2 text-center font-medium">Calc</th>
                  <th className="px-3 py-2 text-center font-medium">Rate</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-right font-medium">B. Hrs</th>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {(template.items ?? []).map((item) => (
                  <TemplateItemRow key={item.id} item={item} templateId={template.id} discounts={activeDiscounts} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Add item */}
          <Popover open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setSearch(""); }}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 w-fit text-xs">
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
                        onClick={() => addItem({ id: s.id, name: s.name, unit: s.unit ?? undefined, rateCents: s.defaultRateCents, budgetMethod: s.budgetMethod, productionRateSqftPerHr: s.productionRateSqftPerHr })}
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
                        onClick={() => addItem({ name: p.name, unit: "each", rateCents: p.price })}
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
                    onClick={() => addItem({ name: "Custom Item" })}
                  >
                    <Plus className="mr-1.5 h-3 w-3" /> Blank line item
                  </button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── main templates list ───────────────────────────────────────────────────────

export function EstimateTemplatesList() {
  const { data: templates, isLoading } = useEstimateTemplates();
  const { mutateAsync: createTemplate, isPending: creating } = useCreateEstimateTemplate();
  const { mutateAsync: deleteTemplate } = useDeleteEstimateTemplate();
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const editTarget = (templates ?? []).find((t) => t.id === editTargetId) ?? null;
  const [newName, setNewName] = useState("");
  const [showNew, setShowNew] = useState(false);

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      await createTemplate({ name: newName.trim() });
      setNewName("");
      setShowNew(false);
      toast.success("Template created");
    } catch {
      toast.error("Failed to create template");
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">
            {isLoading ? "…" : `${(templates ?? []).length} template${(templates ?? []).length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={() => setShowNew(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add Template
        </Button>
      </div>

      {/* New template inline */}
      {showNew && (
        <div className="flex items-center gap-2 rounded-lg border bg-white p-3 shadow-sm">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Template name…"
            className="h-8 max-w-xs text-sm"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
          />
          <Button size="sm" className="h-8 text-xs" onClick={handleCreate} disabled={creating}>
            {creating ? "Creating…" : "Create"}
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setShowNew(false)}>
            Cancel
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="w-10 px-4 py-3" />
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Date Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 5 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : (templates ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="py-16 text-center text-sm text-slate-400">
                  No templates yet — create one to pre-populate estimates
                </td>
              </tr>
            ) : (
              (templates ?? []).map((t) => (
                <tr key={t.id} className="group border-b hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setEditTargetId(t.id)}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setEditTargetId(t.id)}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {t.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-500 capitalize">
                    {t.showWhen === "both" ? "Both" : t.showWhen === "estimates" ? "EstimateTemplate" : "JobTemplate"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {new Date(t.createdAt).toLocaleDateString("en-US", {
                      month: "2-digit", day: "2-digit", year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={async () => {
                        if (confirm(`Delete "${t.name}"?`)) {
                          try {
                            await deleteTemplate(t.id);
                            toast.success("Template deleted");
                          } catch {
                            toast.error("Failed to delete");
                          }
                        }
                      }}
                      className="text-slate-300 opacity-0 group-hover:opacity-100 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit dialog */}
      {editTarget && (
        <EditTemplateDialog
          template={editTarget}
          open={!!editTarget}
          onOpenChange={(o) => !o && setEditTargetId(null)}
        />
      )}
    </div>
  );
}
