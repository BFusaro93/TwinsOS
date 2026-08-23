"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Cog,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  BookOpen,
  ShoppingCart,
  Truck,
  X,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ApprovalFlowsPage } from "@/components/settings/ApprovalFlowsPage";
import { NotificationsPage } from "@/components/settings/NotificationsPage";
import { Toggle } from "@/components/settings/settings-ui";
import { useSettingsStore } from "@/stores/settings-store";
import type { FieldRequirement } from "@/stores/settings-store";
import type { Part } from "@/types/cmms";
import { type CostMethod } from "@/lib/cost-methods";
import { useOrgSettings, useUpdateOrgSettings } from "@/lib/hooks/use-org-settings";
import { useModuleAccess } from "@/lib/hooks/use-module-access";
import { useIntegration, useUpsertIntegration } from "@/lib/hooks/use-integrations";
import { useWorkOrders, useBulkImportWorkOrders } from "@/lib/hooks/use-work-orders";
import { useAssets, useBulkImportAssets } from "@/lib/hooks/use-assets";
import { useVehicles, useBulkImportVehicles } from "@/lib/hooks/use-vehicles";
import { useParts, useBulkImportParts, useMergePartCategory } from "@/lib/hooks/use-parts";
import { useVendors, useBulkImportVendors } from "@/lib/hooks/use-vendors";
import { useRequisitions, useBulkImportRequisitions } from "@/lib/hooks/use-requisitions";
import { usePurchaseOrders, useBulkImportPurchaseOrders } from "@/lib/hooks/use-purchase-orders";
import { useProducts, useBulkImportProducts } from "@/lib/hooks/use-products";
import { downloadCSV, readCSVFile } from "@/lib/csv";
import { autoMapColumns, remapRows } from "@/components/shared/ImportExportMenu";
import { cn, formatCurrency } from "@/lib/utils";

// ── CostingTab ────────────────────────────────────────────────────────────────

const COST_METHOD_OPTIONS: { value: CostMethod; label: string; description: string }[] = [
  {
    value: "manual",
    label: "Manual",
    description:
      "Unit cost is set directly on the product or part catalog record and never updated automatically.",
  },
  {
    value: "wac",
    label: "Weighted Average Cost (WAC)",
    description:
      "After each goods receipt, the catalog unit cost is recalculated as a weighted average across all inventory layers. Future line items pre-fill with this average.",
  },
  {
    value: "fifo",
    label: "First In, First Out (FIFO)",
    description:
      "Future line items pre-fill with the cost of the oldest on-hand inventory batch. Inventory layers are tracked per receipt and consumed in order.",
  },
];

function CostingTab() {
  const { costMethod, setCostMethod } = useSettingsStore();
  const { mutate: updateOrgSettings } = useUpdateOrgSettings();

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <div className="px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Inventory Costing Method</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Controls how unit costs are pre-filled when adding items to Requisitions, Purchase Orders,
          and Work Orders. Historical line items are never affected by this setting.
        </p>
      </div>
      <Separator />
      <div className="divide-y px-6">
        {COST_METHOD_OPTIONS.map((opt) => {
          const active = costMethod === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setCostMethod(opt.value); updateOrgSettings({ costMethod: opt.value }); }}
              className={`flex w-full items-start gap-4 py-4 text-left transition-colors hover:bg-slate-50 ${active ? "bg-brand-50 hover:bg-brand-50" : ""}`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  active ? "border-brand-500 bg-brand-500" : "border-slate-300 bg-white"
                }`}
              >
                {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
              <div className="flex-1">
                <p className={`text-sm font-medium ${active ? "text-brand-700" : "text-slate-900"}`}>
                  {opt.label}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">{opt.description}</p>
              </div>
            </button>
          );
        })}
      </div>
      <Separator />
      <div className="px-6 py-4">
        <p className="text-xs text-slate-400">
          <strong className="font-medium text-slate-500">Note:</strong> Changing the costing method
          takes effect immediately for new line items. Existing Requisitions, Purchase Orders, and
          Work Orders are not modified.
        </p>
      </div>
    </div>
  );
}

// ── RequestPortalTab ──────────────────────────────────────────────────────────

function RequestPortalTab() {
  const { portalEnabled, setPortalEnabled } = useSettingsStore();
  const { data: remoteSettings } = useOrgSettings();
  const { mutate: updateOrgSettings } = useUpdateOrgSettings();
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <div className="px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Maintenance Request Portal</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          A public link where anyone — employees, contractors, or guests — can submit a
          maintenance request without logging in.
        </p>
      </div>
      <Separator />
      <div className="px-6">
        <div className="flex flex-col gap-2 py-4 md:flex-row md:items-start md:justify-between md:gap-8">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-900">Accept Submissions</p>
            <p className="mt-0.5 text-xs text-slate-500">
              When disabled, the portal shows a closed message and no submissions are accepted.
            </p>
          </div>
          <div className="w-full md:w-48 md:shrink-0">
            <Toggle enabled={portalEnabled} onToggle={() => {
              setPortalEnabled(!portalEnabled);
              updateOrgSettings({ portalEnabled: !portalEnabled });
            }} />
          </div>
        </div>
        <div className="flex flex-col gap-2 py-4 md:flex-row md:items-start md:justify-between md:gap-8">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-900">Portal Link</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Share this URL with anyone who should be able to submit requests.
            </p>
          </div>
          <div className="flex w-full items-center gap-2 md:w-80 md:shrink-0">
            <div className="flex h-8 flex-1 min-w-0 items-center rounded-md border bg-slate-50 px-3">
              <span className="truncate text-xs text-slate-600 font-mono">
                {typeof window !== "undefined" ? window.location.origin : "https://yourapp.com"}/request/{remoteSettings?.slug ?? ""}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0 gap-1.5 text-xs"
              onClick={() => {
                const url = `${window.location.origin}/request/${remoteSettings?.slug ?? ""}`;
                navigator.clipboard.writeText(url).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-600" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0 gap-1.5 text-xs"
              onClick={() => window.open(`/request/${remoteSettings?.slug ?? ""}`, "_blank")}
            >
              <ExternalLink className="h-3 w-3" />
              Open
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AccordionSection ──────────────────────────────────────────────────────────

function AccordionSection({
  title,
  count,
  children,
  defaultOpen = false,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-slate-50"
      >
        <div>
          <span className="text-sm font-semibold text-slate-900">{title}</span>
          <span className="ml-2 text-xs text-slate-400">
            {count} item{count !== 1 ? "s" : ""}
          </span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        )}
      </button>
      {open && <div className="px-6 pb-4">{children}</div>}
    </div>
  );
}

// ── CategoryListEditor ────────────────────────────────────────────────────────

interface CategoryListItem {
  id: string;
  label: string;
  enabled: boolean;
  isBuiltIn: boolean;
}

interface CategoryListEditorProps {
  items: CategoryListItem[];
  onToggle: (id: string, enabled: boolean) => void;
  onRename: (id: string, label: string) => void;
  onAdd: (label: string) => void;
  onRemove: (id: string) => void;
  addPlaceholder?: string;
}

function CategoryListEditor({
  items,
  onToggle,
  onRename,
  onAdd,
  onRemove,
  addPlaceholder = "New item label",
}: CategoryListEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [newItemLabel, setNewItemLabel] = useState("");

  function commitRename(id: string) {
    if (labelDraft.trim()) onRename(id, labelDraft.trim());
    setEditingId(null);
  }

  function commitAdd() {
    if (newItemLabel.trim()) {
      onAdd(newItemLabel.trim());
      setNewItemLabel("");
      setAddingItem(false);
    }
  }

  return (
    <div className="divide-y">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-3 py-3">
          <div className="flex-1">
            {editingId === item.id ? (
              <input
                autoFocus
                className="rounded-md border border-brand-400 px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-400"
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                onBlur={() => commitRename(item.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(item.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
            ) : (
              <button
                className="text-left text-sm font-medium text-slate-800 hover:text-brand-600"
                onClick={() => {
                  setEditingId(item.id);
                  setLabelDraft(item.label);
                }}
                title="Click to rename"
              >
                {item.label}
              </button>
            )}
            <p className="mt-0.5 text-xs text-slate-400">{item.isBuiltIn ? "Built-in" : "Custom"}</p>
          </div>

          <Toggle
            enabled={item.enabled}
            onToggle={() => onToggle(item.id, !item.enabled)}
          />

          {!item.isBuiltIn ? (
            <button
              onClick={() => onRemove(item.id)}
              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
              title="Remove"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <div className="w-6" />
          )}
        </div>
      ))}

      {addingItem ? (
        <div className="flex items-center gap-3 py-3">
          <input
            autoFocus
            placeholder={addPlaceholder}
            value={newItemLabel}
            onChange={(e) => setNewItemLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitAdd();
              if (e.key === "Escape") {
                setAddingItem(false);
                setNewItemLabel("");
              }
            }}
            className="flex-1 rounded-md border border-brand-400 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          <button
            onClick={commitAdd}
            className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
          >
            Add
          </button>
          <button
            onClick={() => {
              setAddingItem(false);
              setNewItemLabel("");
            }}
            className="rounded p-1 text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="py-3">
          <button
            onClick={() => setAddingItem(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            <Plus className="h-4 w-4" />
            Add Item
          </button>
        </div>
      )}
    </div>
  );
}

// ── CustomPartCategoriesCleanup ────────────────────────────────────────────────
// Surfaces category strings stored on parts that don't match any saved label —
// e.g. leftover custom entries or ones orphaned by a prior rename — so they can
// be merged into a saved category or promoted into one.

function CustomPartCategoriesCleanup({
  parts,
  savedLabels,
  onMerge,
  onPromote,
  isMerging,
}: {
  parts: Part[] | undefined;
  savedLabels: string[];
  onMerge: (from: string, to: string) => void;
  onPromote: (label: string) => void;
  isMerging: boolean;
}) {
  const savedSet = new Set(savedLabels);
  const counts = new Map<string, number>();
  for (const part of parts ?? []) {
    const cats = part.categories?.length ? part.categories : part.category ? [part.category] : [];
    for (const c of cats) {
      if (!c || savedSet.has(c)) continue;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  const customLabels = Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const [targets, setTargets] = useState<Record<string, string>>({});

  if (customLabels.length === 0) return null;

  return (
    <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs font-semibold text-amber-800">
        Custom categories in use ({customLabels.length})
      </p>
      <p className="mt-0.5 text-xs text-amber-700">
        These part categories aren&apos;t in the saved list above. Merge each into an
        existing category, or save it as a new one.
      </p>
      <div className="mt-2 divide-y divide-amber-200/60">
        {customLabels.map(([label, count]) => (
          <div key={label} className="flex items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{label}</p>
              <p className="text-xs text-slate-500">
                {count} part{count !== 1 ? "s" : ""}
              </p>
            </div>
            <select
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
              value={targets[label] ?? ""}
              onChange={(e) => setTargets((t) => ({ ...t, [label]: e.target.value }))}
            >
              <option value="">Merge into…</option>
              {savedLabels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <button
              disabled={!targets[label] || isMerging}
              onClick={() => onMerge(label, targets[label])}
              className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40"
            >
              Merge
            </button>
            <button
              disabled={isMerging}
              onClick={() => onPromote(label)}
              className="whitespace-nowrap rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              Save as category
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CustomizationsTab ─────────────────────────────────────────────────────────

function CustomizationsTab({ hasEquipt }: { hasEquipt: boolean }) {
  const {
    locations,
    setLocationEnabled,
    setLocationLabel,
    addLocation,
    removeLocation,
    partCategories,
    setPartCategoryEnabled,
    setPartCategoryLabel,
    addPartCategory,
    removePartCategory,
    woCategories,
    setWOCategoryEnabled,
    setWOCategoryLabel,
    addWOCategory,
    removeWOCategory,
    assetTypes,
    setAssetTypeEnabled,
    setAssetTypeLabel,
    addAssetType,
    removeAssetType,
    fuelTypes,
    setFuelTypeEnabled,
    setFuelTypeLabel,
    addFuelType,
    removeFuelType,
    vendorTypes,
    setVendorTypeEnabled,
    setVendorTypeLabel,
    addVendorType,
    removeVendorType,
    filterFields,
    setFilterFieldEnabled,
    setFilterFieldLabel,
    addFilterField,
    removeFilterField,
  } = useSettingsStore();
  const { mutate: updateOrgSettings, isPending: savingCustomizations } = useUpdateOrgSettings();
  const { data: parts } = useParts();
  const { mutate: mergePartCategory, isPending: isMergingPartCategory } = useMergePartCategory();

  // Auto-save status
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reads fresh state from Zustand (synchronous) and persists to DB.
  // Always called via debouncedPersist so rapid edits coalesce into one write.
  function persistCustomizations() {
    const s = useSettingsStore.getState();
    setSaveError(null);
    updateOrgSettings(
      {
        customizations: {
          woCategories: s.woCategories,
          partCategories: s.partCategories,
          assetTypes: s.assetTypes,
          fuelTypes: s.fuelTypes,
          locations: s.locations,
          vendorTypes: s.vendorTypes,
          filterFields: s.filterFields,
          requiredFields: s.requiredFields,
        },
      },
      {
        onSuccess: () => {
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2500);
        },
        onError: (err) => {
          setSaveStatus("error");
          setSaveError(err instanceof Error ? err.message : "Failed to save. Please try again.");
        },
      }
    );
  }

  function debouncedPersist() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persistCustomizations, 800);
  }

  // Wraps a store action so that after it runs, we schedule a debounced save.
  // Zustand state updates are synchronous, so getState() in persistCustomizations
  // will always see the latest accumulated state.
  function act<T extends unknown[]>(storeFn: (...args: T) => void): (...args: T) => void {
    return (...args: T) => {
      storeFn(...args);
      debouncedPersist();
    };
  }

  // Renaming a part category must also rewrite the label already stored on
  // every part tagged with the old name — otherwise the rename only changes
  // this config, parts keep the old string, and reverting the label "undoes"
  // what looked like a merge.
  function renamePartCategory(id: string, newLabel: string) {
    const oldLabel = partCategories.find((c) => c.id === id)?.label;
    setPartCategoryLabel(id, newLabel);
    debouncedPersist();
    if (oldLabel && oldLabel !== newLabel) {
      mergePartCategory({ from: oldLabel, to: newLabel });
    }
  }

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      {/* Auto-save status bar */}
      <div className="flex items-center justify-end gap-2 border-b px-6 py-3 text-xs">
        {savingCustomizations && (
          <span className="flex items-center gap-1.5 text-slate-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving…
          </span>
        )}
        {!savingCustomizations && saveStatus === "saved" && (
          <span className="flex items-center gap-1 text-emerald-600">
            <Check className="h-3 w-3" /> Saved
          </span>
        )}
        {!savingCustomizations && saveStatus === "error" && (
          <span className="text-red-500">
            {saveError ?? "Save failed — please retry"}
          </span>
        )}
        {!savingCustomizations && saveStatus === "idle" && (
          <span className="text-slate-400">Changes save automatically</span>
        )}
      </div>

      {hasEquipt && (
        <>
          <AccordionSection title="Locations" count={locations.length} defaultOpen={true}>
            <CategoryListEditor
              items={locations}
              onToggle={act(setLocationEnabled)}
              onRename={act(setLocationLabel)}
              onAdd={act(addLocation)}
              onRemove={act(removeLocation)}
              addPlaceholder="e.g. New York, NJ"
            />
          </AccordionSection>

          <AccordionSection title="Part Categories" count={partCategories.length}>
            <CategoryListEditor
              items={partCategories}
              onToggle={act(setPartCategoryEnabled)}
              onRename={renamePartCategory}
              onAdd={act(addPartCategory)}
              onRemove={act(removePartCategory)}
              addPlaceholder="e.g. Seals & Gaskets"
            />
            <CustomPartCategoriesCleanup
              parts={parts}
              savedLabels={partCategories.map((c) => c.label)}
              onMerge={(from, to) => mergePartCategory({ from, to })}
              onPromote={act(addPartCategory)}
              isMerging={isMergingPartCategory}
            />
          </AccordionSection>

          <AccordionSection title="Work Order Categories" count={woCategories.length}>
            <CategoryListEditor
              items={woCategories}
              onToggle={act(setWOCategoryEnabled)}
              onRename={act(setWOCategoryLabel)}
              onAdd={act(addWOCategory)}
              onRemove={act(removeWOCategory)}
              addPlaceholder="e.g. Welding"
            />
          </AccordionSection>

          <AccordionSection title="Asset Types" count={assetTypes.length}>
            <CategoryListEditor
              items={assetTypes}
              onToggle={act(setAssetTypeEnabled)}
              onRename={act(setAssetTypeLabel)}
              onAdd={act(addAssetType)}
              onRemove={act(removeAssetType)}
              addPlaceholder="e.g. Chainsaw"
            />
          </AccordionSection>

          <AccordionSection title="Fuel Types" count={fuelTypes.length}>
            <CategoryListEditor
              items={fuelTypes}
              onToggle={act(setFuelTypeEnabled)}
              onRename={act(setFuelTypeLabel)}
              onAdd={act(addFuelType)}
              onRemove={act(removeFuelType)}
              addPlaceholder="e.g. Propane"
            />
          </AccordionSection>
        </>
      )}

      <AccordionSection title="Vendor Types" count={vendorTypes.length} defaultOpen={!hasEquipt}>
        <CategoryListEditor
          items={vendorTypes}
          onToggle={act(setVendorTypeEnabled)}
          onRename={act(setVendorTypeLabel)}
          onAdd={act(addVendorType)}
          onRemove={act(removeVendorType)}
          addPlaceholder="e.g. Subcontractor"
        />
      </AccordionSection>

      {hasEquipt && (
        <AccordionSection title="Quick Reference Part # Fields" count={filterFields.length}>
          <CategoryListEditor
            items={filterFields}
            onToggle={act(setFilterFieldEnabled)}
            onRename={act(setFilterFieldLabel)}
            onAdd={act(addFilterField)}
            onRemove={act(removeFilterField)}
            addPlaceholder="e.g. Hydraulic Filter"
          />
        </AccordionSection>
      )}
    </div>
  );
}

// ── RequiredFieldsTab ─────────────────────────────────────────────────────────

const ENTITY_DISPLAY: { key: string; name: string; equiptOnly?: boolean }[] = [
  { key: "purchase_order", name: "Purchase Orders" },
  { key: "requisition",    name: "Requisitions" },
  { key: "work_order",     name: "Work Orders", equiptOnly: true },
  { key: "asset",          name: "Assets", equiptOnly: true },
  { key: "vehicle",        name: "Vehicles", equiptOnly: true },
];

function RequiredFieldsTab({ hasEquipt }: { hasEquipt: boolean }) {
  const { requiredFields, setFieldRequirement } = useSettingsStore();
  const { mutate: updateOrgSettings, isPending: saving } = useUpdateOrgSettings();

  function handleChange(entity: string, field: string, requirement: FieldRequirement) {
    setFieldRequirement(entity, field, requirement);
  }

  const entities = hasEquipt ? ENTITY_DISPLAY : ENTITY_DISPLAY.filter((e) => !e.equiptOnly);

  return (
    <div className="flex flex-col gap-6">
      {entities.map(({ key, name }) => {
        const fields = requiredFields[key] ?? [];
        return (
          <div key={key} className="rounded-lg border bg-white shadow-sm">
            <div className="px-6 py-4">
              <h2 className="text-sm font-semibold text-slate-900">{name}</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Set which fields are required, optional, or hidden
              </p>
            </div>
            <Separator />
            <table className="w-full">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="px-6 py-2 text-left text-xs font-medium text-slate-500">Field</th>
                  <th className="px-6 py-2 text-right text-xs font-medium text-slate-500">
                    Requirement
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {fields.map((f) => (
                  <tr key={f.field}>
                    <td className="px-6 py-3 text-sm text-slate-800">{f.label}</td>
                    <td className="px-6 py-3 text-right">
                      <Select
                        value={f.requirement}
                        onValueChange={(val) =>
                          handleChange(key, f.field, val as FieldRequirement)
                        }
                      >
                        <SelectTrigger className="ml-auto h-8 w-32 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="required">Required</SelectItem>
                          <SelectItem value="optional">Optional</SelectItem>
                          <SelectItem value="hidden">Hidden</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={saving}
          onClick={() => updateOrgSettings({ customizations: { requiredFields } })}
        >
          {saving ? "Saving…" : "Save Required Fields"}
        </Button>
      </div>
    </div>
  );
}

// ── Import tile (renders as icon+label tile, opens file picker → mapping dialog) ─

function ImportTile({
  label,
  icon,
  onImport,
  templateColumns,
  requiredColumns,
  onStatus,
}: {
  label: string;
  icon: React.ReactNode;
  onImport: (rows: Record<string, string>[]) => Promise<unknown>;
  templateColumns: string[];
  requiredColumns: string[];
  onStatus: (s: { type: "success" | "error"; message: string }) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const rows = await readCSVFile(file);
      if (rows.length === 0) { onStatus({ type: "error", message: "CSV file is empty." }); return; }
      const cols = Object.keys(rows[0]);
      setCsvColumns(cols);
      setRawRows(rows);
      const mapping = autoMapColumns(cols, templateColumns);
      setColumnMapping(mapping);
      const allMapped = templateColumns.every((f) => mapping[f]);
      if (allMapped) { proceedToPreview(rows, mapping); } else { setMappingOpen(true); }
    } catch { onStatus({ type: "error", message: "Failed to read CSV file." }); }
  }

  function proceedToPreview(rows: Record<string, string>[], mapping: Record<string, string>) {
    const remapped = remapRows(rows, mapping);
    const mappedFields = new Set(Object.keys(mapping).filter((k) => mapping[k] && mapping[k] !== "__skip__"));
    const missing = requiredColumns.filter((c) => !mappedFields.has(c));
    if (missing.length) {
      setImportError(`Missing required field mapping: ${missing.join(", ")}`);
      setParsedRows([]);
      setMappingOpen(false);
      setPreviewOpen(true);
      return;
    }
    setImportError(null);
    setParsedRows(remapped);
    setMappingOpen(false);
    setPreviewOpen(true);
  }

  async function handleConfirm() {
    setImporting(true);
    setImportError(null);
    try {
      await onImport(parsedRows);
      setPreviewOpen(false);
      onStatus({ type: "success", message: `Successfully imported ${parsedRows.length} ${label.toLowerCase()}.` });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed.");
    } finally { setImporting(false); }
  }

  function resetAll() { setMappingOpen(false); setPreviewOpen(false); setRawRows([]); setCsvColumns([]); setColumnMapping({}); setParsedRows([]); setImportError(null); }

  const fieldLabel = (f: string) => f.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();

  return (
    <>
      <button
        onClick={() => fileRef.current?.click()}
        className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 p-5 text-slate-500 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600"
      >
        {icon}
        <span className="text-sm">{label}</span>
      </button>
      <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />

      {/* Mapping dialog */}
      <Dialog open={mappingOpen} onOpenChange={(o) => { if (!o) resetAll(); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Map Columns — {label}</DialogTitle>
            <DialogDescription>{rawRows.length} rows found. Match your CSV columns to the expected fields.</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto">
            <div className="flex flex-col gap-3">
              {templateColumns.map((field) => (
                <div key={field} className="grid grid-cols-2 items-center gap-3">
                  <label className="text-sm font-medium text-slate-700">
                    {fieldLabel(field)}
                    {requiredColumns.includes(field) && <span className="text-red-500"> *</span>}
                  </label>
                  <Select value={columnMapping[field] || "__skip__"} onValueChange={(v) => setColumnMapping((prev) => ({ ...prev, [field]: v === "__skip__" ? "" : v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Skip" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__skip__"><span className="text-slate-400">— Skip —</span></SelectItem>
                      {csvColumns.map((col) => (<SelectItem key={col} value={col}>{col}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetAll}>Cancel</Button>
            <Button onClick={() => proceedToPreview(rawRows, columnMapping)}>Continue to Preview</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={(o) => { if (!o) resetAll(); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{importError ? "Import Error" : `Import ${label}`}</DialogTitle>
            <DialogDescription>{importError ?? `${parsedRows.length} rows ready to import.`}</DialogDescription>
          </DialogHeader>
          {!importError && parsedRows.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-md border text-xs">
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>{Object.keys(parsedRows[0]).map((col) => (<th key={col} className="border-b px-3 py-2 text-left font-semibold text-slate-600">{fieldLabel(col)}</th>))}</tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 5).map((row, i) => (<tr key={i} className="border-b last:border-0">{Object.keys(parsedRows[0]).map((col) => (<td key={col} className="px-3 py-1.5 text-slate-700">{row[col] || "—"}</td>))}</tr>))}
                </tbody>
              </table>
            </div>
          )}
          {importError && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{importError}</div>}
          <DialogFooter>
            <Button variant="outline" onClick={resetAll}>Cancel</Button>
            {!importError && <Button onClick={handleConfirm} disabled={importing}>{importing ? "Importing..." : `Import ${parsedRows.length} Rows`}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── ImportExportTab ───────────────────────────────────────────────────────────

function ImportExportTab({ hasEquipt }: { hasEquipt: boolean }) {
  const [importStatus, setImportStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Data hooks for exports
  const { data: workOrders } = useWorkOrders();
  const { data: assets } = useAssets();
  const { data: vehicles } = useVehicles();
  const { data: parts } = useParts();
  const { data: vendors } = useVendors();
  const { data: requisitions } = useRequisitions();
  const { data: purchaseOrders } = usePurchaseOrders();
  const { data: products } = useProducts();

  // Bulk import hooks
  const { mutateAsync: bulkImportWorkOrders, isPending: importingWO } = useBulkImportWorkOrders();
  const { mutateAsync: bulkImportAssets, isPending: importingAssets } = useBulkImportAssets();
  const { mutateAsync: bulkImportVehicles, isPending: importingVehicles } = useBulkImportVehicles();
  const { mutateAsync: bulkImportParts, isPending: importingParts } = useBulkImportParts();
  const { mutateAsync: bulkImportVendors, isPending: importingVendors } = useBulkImportVendors();
  const { mutateAsync: bulkImportRequisitions, isPending: importingReqs } = useBulkImportRequisitions();
  const { mutateAsync: bulkImportProducts, isPending: importingProducts } = useBulkImportProducts();
  const { mutateAsync: bulkImportPurchaseOrders, isPending: importingPOs } = useBulkImportPurchaseOrders();

  // Export handlers
  function handleExport(label: string) {
    switch (label) {
      case "Work Orders":
        if (!workOrders?.length) return;
        downloadCSV("work-orders.csv",
          ["workOrderNumber", "title", "description", "status", "priority", "woType", "assetName", "assignedToName", "dueDate", "category"],
          workOrders.map((wo) => [wo.workOrderNumber, wo.title, wo.description ?? "", wo.status, wo.priority, wo.woType ?? "", wo.assetName ?? "", wo.assignedToName ?? "", wo.dueDate ?? "", wo.category ?? ""]));
        break;
      case "Assets":
        if (!assets?.length) return;
        downloadCSV("assets.csv",
          ["name", "assetTag", "equipmentNumber", "assetType", "status", "make", "model", "year", "serialNumber", "location", "assignedCrew"],
          assets.map((a) => [a.name, a.assetTag, a.equipmentNumber ?? "", a.assetType, a.status, a.make ?? "", a.model ?? "", a.year ?? "", a.serialNumber ?? "", a.location ?? "", a.assignedCrew ?? ""]));
        break;
      case "Vehicles":
        if (!vehicles?.length) return;
        downloadCSV("vehicles.csv",
          ["name", "assetTag", "make", "model", "year", "status", "licensePlate", "vin", "fuelType", "assignedCrew", "location"],
          vehicles.map((v) => [v.name, v.assetTag, v.make ?? "", v.model ?? "", v.year ?? "", v.status, v.licensePlate ?? "", v.vin ?? "", v.fuelType ?? "", v.assignedCrew ?? "", v.location ?? ""]));
        break;
      case "Parts":
        if (!parts?.length) return;
        downloadCSV("parts.csv",
          ["name", "partNumber", "description", "category", "quantityOnHand", "minimumStock", "unitCost", "vendorName"],
          parts.map((p) => [p.name, p.partNumber, p.description ?? "", p.category, p.quantityOnHand, p.minimumStock, formatCurrency(p.unitCost), p.vendorName ?? ""]));
        break;
      case "Vendors":
        if (!vendors?.length) return;
        downloadCSV("vendors.csv",
          ["name", "contactName", "email", "phone", "address", "website", "vendorType", "isActive", "w9Status"],
          vendors.map((v) => [v.name, v.contactName, v.email, v.phone, v.address, v.website ?? "", v.vendorType ?? "", v.isActive, v.w9Status]));
        break;
      case "Requisitions":
        if (!requisitions?.length) return;
        downloadCSV("requisitions.csv",
          ["requisitionNumber", "title", "status", "requestedByName", "vendorName", "grandTotal", "notes"],
          requisitions.map((r) => [r.requisitionNumber, r.title, r.status, r.requestedByName, r.vendorName ?? "", formatCurrency(r.grandTotal), r.notes ?? ""]));
        break;
      case "Purchase Orders":
        if (!purchaseOrders?.length) return;
        downloadCSV("purchase-orders.csv",
          ["poNumber", "poDate", "status", "vendorName", "invoiceNumber", "grandTotal", "notes"],
          purchaseOrders.map((po) => [po.poNumber, po.poDate ?? "", po.status, po.vendorName, po.invoiceNumber ?? "", formatCurrency(po.grandTotal), po.notes ?? ""]));
        break;
      case "Products":
        if (!products?.length) return;
        downloadCSV("products.csv",
          ["name", "partNumber", "description", "category", "unitCost", "price", "quantityOnHand", "vendorName", "isInventory"],
          products.map((p) => [p.name, p.partNumber, p.description ?? "", p.category, formatCurrency(p.unitCost), formatCurrency(p.price), String(p.quantityOnHand), p.vendorName ?? "", p.isInventory ? "yes" : "no"]));
        break;
      default:
        break;
    }
  }

  const EXPORT_TILES: { label: string; icon: React.ReactNode; equiptOnly?: boolean }[] = [
    { label: "Work Orders",     icon: <ClipboardCheck className="h-6 w-6" />, equiptOnly: true },
    { label: "Assets",          icon: <Cog className="h-6 w-6" />, equiptOnly: true },
    { label: "Vehicles",        icon: <Truck className="h-6 w-6" />, equiptOnly: true },
    { label: "Parts",           icon: <Cog className="h-6 w-6" />, equiptOnly: true },
    { label: "Vendors",         icon: <Building2 className="h-6 w-6" /> },
    { label: "Requisitions",    icon: <FileText className="h-6 w-6" /> },
    { label: "Products",        icon: <BookOpen className="h-6 w-6" /> },
    { label: "Purchase Orders", icon: <ShoppingCart className="h-6 w-6" /> },
  ].filter((t) => hasEquipt || !t.equiptOnly);

  return (
    <div className="flex flex-col gap-6">
      {/* Status banner */}
      {importStatus && (
        <div className={`rounded-md border px-4 py-3 text-sm ${
          importStatus.type === "success"
            ? "border-green-200 bg-green-50 text-green-700"
            : "border-red-200 bg-red-50 text-red-700"
        }`}>
          {importStatus.message}
          <button className="ml-2 font-medium underline" onClick={() => setImportStatus(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Export */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Export Data</h2>
          <p className="mt-0.5 text-xs text-slate-500">Download your data as a CSV file</p>
        </div>
        <Separator />
        <div className="p-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {EXPORT_TILES.map(({ label, icon }) => (
              <button
                key={label}
                onClick={() => handleExport(label)}
                className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 p-5 text-slate-500 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600"
              >
                {icon}
                <span className="text-sm">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Import */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Import Data</h2>
          <p className="mt-0.5 text-xs text-slate-500">Upload a CSV to bulk-import records</p>
        </div>
        <Separator />
        <div className="p-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: "Work Orders",  icon: <ClipboardCheck className="h-6 w-6" />, onImport: (r: Record<string, string>[]) => bulkImportWorkOrders(r), templateColumns: ["workOrderNumber", "title", "description", "priority", "status", "category", "assetName", "assignedToName", "dueDate", "createdAt"], required: ["title"], equiptOnly: true },
              { label: "Assets",       icon: <Cog className="h-6 w-6" />,           onImport: (r: Record<string, string>[]) => bulkImportAssets(r),     templateColumns: ["name", "assetTag", "equipmentNumber", "assetType", "make", "model", "year", "serialNumber", "location", "status", "purchaseVendorName", "purchaseDate", "purchasePrice", "paymentMethod", "financeInstitution"], required: ["name", "assetTag"], equiptOnly: true },
              { label: "Vehicles",     icon: <Truck className="h-6 w-6" />,         onImport: (r: Record<string, string>[]) => bulkImportVehicles(r),   templateColumns: ["name", "assetTag", "make", "model", "year", "licensePlate", "vin", "fuelType", "status", "assignedCrew", "purchaseVendorName", "purchaseDate", "purchasePrice", "paymentMethod", "financeInstitution"], required: ["name", "assetTag"], equiptOnly: true },
              { label: "Parts",        icon: <Cog className="h-6 w-6" />,            onImport: (r: Record<string, string>[]) => bulkImportParts(r),      templateColumns: ["name", "partNumber", "description", "category", "unitCost", "quantityOnHand", "minimumStock", "vendorName", "location"], required: ["name", "partNumber"], equiptOnly: true },
              { label: "Vendors",      icon: <Building2 className="h-6 w-6" />,     onImport: (r: Record<string, string>[]) => bulkImportVendors(r),    templateColumns: ["name", "contactName", "email", "phone", "address", "vendorType", "website", "notes"], required: ["name"] },
              { label: "Requisitions",    icon: <FileText className="h-6 w-6" />,      onImport: (r: Record<string, string>[]) => bulkImportRequisitions(r), templateColumns: ["title", "vendorName", "notes"], required: ["title"] },
              { label: "Products",        icon: <BookOpen className="h-6 w-6" />,     onImport: (r: Record<string, string>[]) => bulkImportProducts(r), templateColumns: ["name", "partNumber", "description", "category", "unitCost", "price", "quantityOnHand", "vendorName", "isInventory"], required: ["name", "partNumber", "category"] },
              { label: "Purchase Orders", icon: <ShoppingCart className="h-6 w-6" />,  onImport: (r: Record<string, string>[]) => bulkImportPurchaseOrders(r), templateColumns: ["Purchase Order #", "Vendor", "Status", "Created On", "Approved On", "Completed On", "Due Date", "Line Type", "Line Name", "Part Number", "Unit Cost", "Ordered Quantity", "Ordered Cost"], required: [] as string[] },
            ].filter((tile) => hasEquipt || !tile.equiptOnly).map((tile) => (
              <ImportTile
                key={tile.label}
                label={tile.label}
                icon={tile.icon}
                onImport={tile.onImport}
                templateColumns={tile.templateColumns}
                requiredColumns={tile.required}
                onStatus={setImportStatus}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab label helper ──────────────────────────────────────────────────────────

function tabLabel(tab: string): string {
  switch (tab) {
    case "customizations": return "Customizations";
    case "required_fields": return "Required Fields";
    case "approval_flows": return "Approval Flows";
    case "costing":        return "Costing";
    case "import_export":  return "Import / Export";
    case "notifications":  return "Notifications";
    case "integrations":   return "Integrations";
    case "request_portal": return "Request Portal";
    default:               return tab;
  }
}

// ── IntegrationsTab ───────────────────────────────────────────────────────────

function IntegrationsTab() {
  const { data: samsara, refetch } = useIntegration("samsara");
  const { mutate: upsertIntegration, isPending: saving } = useUpsertIntegration();

  const [apiKey, setApiKey]         = useState("");
  const [showKey, setShowKey]       = useState(false);
  const [syncing, setSyncing]       = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [keySaved, setKeySaved]     = useState(false);

  // Seed the field once remote data loads
  const seeded = useRef(false);
  useEffect(() => {
    if (samsara === undefined || seeded.current) return;
    seeded.current = true;
    setApiKey(samsara?.apiKey ?? "");
  }, [samsara]);

  function handleSaveKey() {
    upsertIntegration(
      { provider: "samsara", apiKey: apiKey.trim() || null },
      {
        onSuccess: () => {
          setKeySaved(true);
          setTimeout(() => setKeySaved(false), 3000);
        },
      }
    );
  }

  async function handleManualSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/integrations/samsara/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncResult(`Error: ${data.error ?? "Unknown error"}`);
      } else {
        const orgResult = data.synced?.[0];
        if (orgResult) {
          const summary = `Synced ${orgResult.readings} reading(s) across ${orgResult.matched} vehicle(s) (${orgResult.fetched} fetched from Samsara).`;
          const details = (orgResult.detail as string[] | undefined)?.length
            ? "\n" + (orgResult.detail as string[]).join("\n")
            : "";
          setSyncResult(summary + details);
        } else {
          setSyncResult(data.message ?? "Sync complete.");
        }
      }
      refetch();
    } catch (err) {
      setSyncResult(`Network error: ${err}`);
    } finally {
      setSyncing(false);
    }
  }

  const lastSync   = samsara?.lastSyncAt;
  const lastStatus = samsara?.lastSyncStatus;

  return (
    <div className="max-w-2xl space-y-8">
      {/* Samsara */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b px-6 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f5a623]/10">
            {/* Samsara brand icon placeholder */}
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-[#f5a623]">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Samsara</p>
            <p className="text-xs text-slate-500">Automatically sync vehicle odometer readings daily at 6 AM ET</p>
          </div>
          {lastStatus && (
            <span className={cn(
              "ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium",
              lastStatus === "ok"      && "bg-green-100 text-green-700",
              lastStatus === "partial" && "bg-amber-100 text-amber-700",
              lastStatus === "error"   && "bg-red-100 text-red-700",
            )}>
              {lastStatus === "ok" ? "Connected" : lastStatus === "partial" ? "Partial" : "Error"}
            </span>
          )}
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* API key */}
          <div className="space-y-1.5">
            <Label htmlFor="samsara-key">API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="samsara-key"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="samsara_api_…"
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showKey ? (
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              <Button
                size="sm"
                disabled={saving}
                onClick={handleSaveKey}
                className="shrink-0"
              >
                {keySaved ? "Saved ✓" : saving ? "Saving…" : "Save"}
              </Button>
            </div>
            <p className="text-xs text-slate-400">
              Generate a read-only API key in your Samsara dashboard under Settings → API Tokens.
            </p>
          </div>

          {/* Vehicle matching note */}
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-medium text-slate-700">How vehicle matching works</p>
            <p className="mt-1 text-xs text-slate-500">
              Samsara vehicles are matched to Equipt vehicles by <strong>Samsara Vehicle ID</strong> first,
              then by <strong>exact name</strong>. Set the Samsara Vehicle ID on a vehicle&apos;s detail page
              for the most reliable match. A reading is only written if the new odometer value is greater
              than the current value (odometers don&apos;t go backwards).
            </p>
          </div>

          {/* Last sync status */}
          {lastSync && (
            <div className="text-xs text-slate-500">
              Last synced: {new Date(lastSync).toLocaleString()}
              {lastStatus && (
                <span className={cn(
                  "ml-2 font-medium",
                  lastStatus === "ok"      && "text-green-600",
                  lastStatus === "partial" && "text-amber-600",
                  lastStatus === "error"   && "text-red-600",
                )}>
                  ({lastStatus})
                </span>
              )}
            </div>
          )}

          {/* Manual sync */}
          <div className="flex items-center gap-3 border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={syncing || !samsara?.apiKey}
              onClick={handleManualSync}
            >
              {syncing ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Syncing…</>
              ) : (
                "Sync Now"
              )}
            </Button>
            {syncResult && (
              <pre className={cn(
                "max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border p-3 text-xs leading-relaxed",
                syncResult.startsWith("Error") ? "border-red-200 bg-red-50 text-red-600" : "border-slate-200 bg-slate-50 text-slate-700"
              )}>
                {syncResult}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main EquiptSettingsTabs component ─────────────────────────────────────────
// Rendered both at /settings/equipt (top-level Settings hub) and at /settings
// inside Equipt's own dashboard shell — same component, same UI, no drift.

const TAB_KEYS = [
  "customizations",
  "required_fields",
  "approval_flows",
  "costing",
  "import_export",
  "notifications",
  "integrations",
  "request_portal",
] as const;

export function EquiptSettingsTabs() {
  // Requisitions/POs, Vendors, and Products are shared with Landscapt-only
  // orgs (no Equipt module) — this whole page is still reachable to them
  // (nothing here is module-gated), but "Equipt Settings" reads as "not for
  // me" and makes the approval-flow/costing tabs they DO need look hidden.
  const { allowed: hasEquipt } = useModuleAccess("equipt");
  // Integrations (Samsara vehicle sync) and the Maintenance Request Portal are
  // entirely CMMS-only — hide them outright rather than showing an empty/dead
  // feature to an org that has no vehicles or work orders.
  const visibleTabs = hasEquipt
    ? TAB_KEYS
    : TAB_KEYS.filter((t) => t !== "integrations" && t !== "request_portal");

  return (
    <div className="flex flex-col gap-0">
      <div className="px-4 pt-4 pb-0 md:px-6 md:pt-6">
        <h1 className="text-xl font-semibold text-slate-900">
          {hasEquipt ? "Equipt Settings" : "Purchasing Settings"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {hasEquipt
            ? "CMMS & purchasing configuration"
            : "Vendors, requisition & PO approval flows, and inventory costing"}
        </p>
      </div>
      <Tabs defaultValue="customizations" className="mt-4">
        <div className="border-b px-4 md:px-6">
          <TabsList className="h-auto flex-wrap gap-0 rounded-none bg-transparent p-0">
            {visibleTabs.map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs font-medium text-slate-600 md:px-4 md:py-3 md:text-sm data-[state=active]:border-brand-500 data-[state=active]:bg-transparent data-[state=active]:text-brand-600 data-[state=active]:shadow-none"
              >
                {tabLabel(tab)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="p-4 md:p-6">
          <TabsContent value="customizations" className="mt-0">
            <CustomizationsTab hasEquipt={hasEquipt} />
          </TabsContent>

          <TabsContent value="required_fields" className="mt-0">
            <RequiredFieldsTab hasEquipt={hasEquipt} />
          </TabsContent>

          <TabsContent value="approval_flows" className="mt-0">
            <ApprovalFlowsPage />
          </TabsContent>

          <TabsContent value="costing" className="mt-0">
            <CostingTab />
          </TabsContent>

          <TabsContent value="import_export" className="mt-0">
            <ImportExportTab hasEquipt={hasEquipt} />
          </TabsContent>

          <TabsContent value="notifications" className="mt-0">
            <NotificationsPage hideHeader />
          </TabsContent>

          {hasEquipt && (
            <TabsContent value="integrations" className="mt-0">
              <IntegrationsTab />
            </TabsContent>
          )}

          {hasEquipt && (
            <TabsContent value="request_portal" className="mt-0">
              <RequestPortalTab />
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  );
}
