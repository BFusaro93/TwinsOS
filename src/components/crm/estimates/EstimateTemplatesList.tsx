"use client";

import { useEffect, useState } from "react";
import { useEstimateTemplates, useCreateEstimateTemplate, useDeleteEstimateTemplate, useUpsertTemplateItem, useDeleteTemplateItem } from "@/lib/hooks/use-estimate-templates";
import { useCRMServices } from "@/lib/hooks/use-crm-jobs";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { centsToDisplay } from "@/lib/estimate-calc";
import type { EstimateTemplate, EstimateTemplateItem } from "@/types/crm-estimates";

// ── template item row (inside edit dialog) ────────────────────────────────────

function TemplateItemRow({
  item,
  templateId,
}: {
  item: EstimateTemplateItem;
  templateId: string;
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
          rate_cents: row.rateCents,
          visits: row.visits,
          budgeted_hours: row.budgetedHours,
          sort_order: row.sortOrder,
        },
      });
      setDirty(false);
    } catch {
      toast.error("Failed to save");
    }
  }

  return (
    <tr className="group border-b border-slate-100 text-xs hover:bg-slate-50">
      <td className="px-3 py-1.5 font-medium text-slate-800">{row.serviceName}</td>
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
          value={row.qty}
          onChange={(e) => update("qty", Number(e.target.value))}
          onBlur={save}
          className="w-14 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs focus:outline-none"
        />
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
      <td className="px-3 py-1.5">
        <input
          type="number"
          value={row.visits}
          onChange={(e) => update("visits", Number(e.target.value))}
          onBlur={save}
          className="w-14 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs focus:outline-none"
        />
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
        {centsToDisplay(Math.round(row.qty * row.rateCents * row.visits))}
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
  const { mutateAsync: upsert } = useUpsertTemplateItem();
  const [showPicker, setShowPicker] = useState(false);

  async function addService(name: string, id?: string) {
    try {
      await upsert({
        templateId: template.id,
        item: {
          service_id: id ?? null,
          service_name: name,
          calc_type: 1,
          qty: 1,
          rate_cents: 0,
          visits: 1,
          budgeted_hours: 0,
          sort_order: (template.items ?? []).length,
        },
      });
      setShowPicker(false);
    } catch {
      toast.error("Failed to add item");
    }
  }

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

          {/* Line items grid */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[560px] text-xs">
              <thead className="bg-slate-700 text-white">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Service/Package</th>
                  <th className="px-3 py-2 text-center font-medium">Calc</th>
                  <th className="px-3 py-2 text-center font-medium">Qty</th>
                  <th className="px-3 py-2 text-center font-medium">Rate</th>
                  <th className="px-3 py-2 text-center font-medium">Visits</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-right font-medium">B. Hrs</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {(template.items ?? []).map((item) => (
                  <TemplateItemRow key={item.id} item={item} templateId={template.id} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Add item */}
          {showPicker ? (
            <div className="flex flex-wrap gap-2">
              {(services ?? []).map((s) => (
                <button
                  key={s.id}
                  onClick={() => addService(s.name, s.id)}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700"
                >
                  {s.name}
                </button>
              ))}
              <button
                onClick={() => addService("Custom Item")}
                className="rounded-md border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-500"
              >
                + Custom
              </button>
              <button onClick={() => setShowPicker(false)} className="px-2 text-xs text-slate-400">
                Cancel
              </button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-fit text-xs"
              onClick={() => setShowPicker(true)}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Item
            </Button>
          )}
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
