"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Cog,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  Truck,
  Upload,
  Users,
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApprovalFlowsPage } from "@/components/settings/ApprovalFlowsPage";
import { NotificationsPage } from "@/components/settings/NotificationsPage";
import { useSettingsStore } from "@/stores/settings-store";
import type { FieldRequirement } from "@/stores/settings-store";
import { COST_METHOD_LABELS, type CostMethod } from "@/lib/cost-methods";
import { useOrgSettings, useUpdateOrgSettings } from "@/lib/hooks/use-org-settings";
import { useWorkOrders, useBulkImportWorkOrders } from "@/lib/hooks/use-work-orders";
import { useAssets, useBulkImportAssets } from "@/lib/hooks/use-assets";
import { useVehicles, useBulkImportVehicles } from "@/lib/hooks/use-vehicles";
import { useParts, useBulkImportParts } from "@/lib/hooks/use-parts";
import { useVendors, useBulkImportVendors } from "@/lib/hooks/use-vendors";
import { useRequisitions, useBulkImportRequisitions } from "@/lib/hooks/use-requisitions";
import { usePurchaseOrders, useBulkImportPurchaseOrders } from "@/lib/hooks/use-purchase-orders";
import { useProducts, useBulkImportProducts } from "@/lib/hooks/use-products";
import { downloadCSV, readCSVFile } from "@/lib/csv";
import { autoMapColumns, remapRows } from "@/components/shared/ImportExportMenu";
import { formatCurrency } from "@/lib/utils";

// ── Shared helpers ────────────────────────────────────────────────────────────

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
        enabled ? "bg-brand-500" : "bg-slate-200"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          enabled ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function BrandColorPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [draft, setDraft] = useState(color);

  // Keep draft in sync when color changes from outside (e.g. store resets)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { setDraft(color); }, [color]);

  function commit(value: string) {
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      onChange(value);
    } else {
      setDraft(color); // revert to last valid
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={color}
        onChange={(e) => { onChange(e.target.value); setDraft(e.target.value); }}
        className="h-9 w-12 cursor-pointer rounded border border-slate-200 p-0.5"
        title="Pick a color"
      />
      <Input
        value={draft}
        maxLength={7}
        placeholder="#60ab45"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(draft); }}
        className="h-8 w-28 font-mono text-sm"
      />
      <div
        className="h-8 w-8 rounded border border-slate-200"
        style={{ backgroundColor: color }}
        title={color}
      />
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-8 py-4">
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        )}
      </div>
      <div className="w-48 shrink-0">{children}</div>
    </div>
  );
}

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

// ── GeneralTab ────────────────────────────────────────────────────────────────

function GeneralTab() {
  const {
    orgName,
    setOrgName,
    logoDataUrl,
    setLogoDataUrl,
    companyAddress,
    setCompanyAddress,
    taxRatePercent,
    setTaxRatePercent,
    brandColor,
    setBrandColor,
    portalEnabled,
    setPortalEnabled,
    loadFromRemote,
  } = useSettingsStore();

  const { data: remoteSettings } = useOrgSettings();
  const { mutate: updateOrgSettings, isPending: savingSettings } = useUpdateOrgSettings();
  const seeded = useRef(false);
  const [addressSaved, setAddressSaved] = useState(false);

  const [taxDraft, setTaxDraft] = useState(taxRatePercent);
  const [orgNameDraft, setOrgNameDraft] = useState(orgName);

  useEffect(() => {
    if (!remoteSettings || seeded.current) return;
    seeded.current = true;
    loadFromRemote({
      orgName: remoteSettings.name,
      brandColor: remoteSettings.brandColor,
      address: remoteSettings.address,
      taxRatePercent: remoteSettings.taxRatePercent,
      costMethod: remoteSettings.costMethod,
      portalEnabled: remoteSettings.portalEnabled,
      ...((remoteSettings.customizations as Record<string, unknown>) ?? {}),
    } as Parameters<typeof loadFromRemote>[0]);
    // Sync controlled draft inputs to the DB values on first load.
    setOrgNameDraft(remoteSettings.name);
    setTaxDraft(remoteSettings.taxRatePercent);
  }, [remoteSettings, loadFromRemote]);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setLogoDataUrl(result);
      updateOrgSettings({ customizations: { logoDataUrl: result } });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Organization */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Organization</h2>
          <p className="mt-0.5 text-xs text-slate-500">General settings for {orgName}</p>
        </div>
        <Separator />
        <div className="px-6">
          <SettingRow
            label="Organization Name"
            description="Your company name as it appears across the platform"
          >
            <div className="flex gap-2">
              <Input
                value={orgNameDraft}
                onChange={(e) => setOrgNameDraft(e.target.value)}
                className="h-8 text-sm"
              />
              <Button
                size="sm"
                className="h-8 shrink-0"
                disabled={orgNameDraft.trim() === orgName || !orgNameDraft.trim()}
                onClick={() => {
                  setOrgName(orgNameDraft.trim());
                  updateOrgSettings({ name: orgNameDraft.trim() });
                }}
              >
                Save
              </Button>
            </div>
          </SettingRow>
        </div>
      </div>

      {/* Branding */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Branding</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Logo and address used on printed purchase orders
          </p>
        </div>
        <Separator />
        <div className="px-6">
          {/* Logo upload */}
          <div className="flex items-start justify-between gap-8 py-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">Company Logo</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Displayed in the sidebar and on printed POs. Recommended: PNG or SVG with transparent
                background.
              </p>
            </div>
            <div className="flex w-64 shrink-0 flex-col gap-2">
              {logoDataUrl ? (
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-40 items-center justify-center rounded-md border bg-slate-50 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logoDataUrl}
                      alt="Company logo"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-xs"
                      onClick={() => logoInputRef.current?.click()}
                    >
                      <Upload className="h-3 w-3" /> Replace
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-xs text-red-500 hover:text-red-600"
                      onClick={() => { setLogoDataUrl(null); updateOrgSettings({ customizations: { logoDataUrl: null } }); }}
                    >
                      <Trash2 className="h-3 w-3" /> Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => logoInputRef.current?.click()}
                  className="flex h-20 w-full flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 transition-colors hover:border-brand-400 hover:text-brand-500"
                >
                  <Upload className="h-5 w-5" />
                  <span className="text-xs font-medium">Upload logo</span>
                </button>
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoUpload}
              />
            </div>
          </div>
          <Separator />
          {/* Brand Color */}
          <SettingRow
            label="Accent Color"
            description="Used on printed PO and WO PDFs"
          >
            <BrandColorPicker
              color={brandColor}
              onChange={(c) => { setBrandColor(c); updateOrgSettings({ brandColor: c }); }}
            />
          </SettingRow>
          <Separator />
          {/* Company address */}
          <div className="flex items-start justify-between gap-8 py-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">Company Address</p>
              <p className="mt-0.5 text-xs text-slate-500">Printed in the header of purchase orders</p>
            </div>
            <div className="flex w-64 shrink-0 flex-col gap-2">
              <Input
                placeholder="Street address"
                value={companyAddress.street}
                onChange={(e) => setCompanyAddress({ street: e.target.value })}
                className="h-8 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="City"
                  value={companyAddress.city}
                  onChange={(e) => setCompanyAddress({ city: e.target.value })}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="State"
                  value={companyAddress.state}
                  onChange={(e) => setCompanyAddress({ state: e.target.value })}
                  className="h-8 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="ZIP"
                  value={companyAddress.zip}
                  onChange={(e) => setCompanyAddress({ zip: e.target.value })}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="Phone"
                  value={companyAddress.phone}
                  onChange={(e) => setCompanyAddress({ phone: e.target.value })}
                  className="h-8 text-sm"
                />
              </div>
              <Button
                size="sm"
                className="h-8 w-full"
                disabled={savingSettings}
                onClick={() => {
                  setAddressSaved(false);
                  updateOrgSettings(
                    { address: companyAddress },
                    {
                      onSuccess: () => {
                        setAddressSaved(true);
                        setTimeout(() => setAddressSaved(false), 2000);
                      },
                    }
                  );
                }}
              >
                {savingSettings ? "Saving..." : addressSaved ? "Saved!" : "Save Address"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Finance */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Finance</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Tax and currency defaults applied to new requisitions and purchase orders
          </p>
        </div>
        <Separator />
        <div className="px-6">
          <SettingRow
            label="Default Sales Tax Rate"
            description="Applied to new POs and requisitions. Can be overridden per record."
          >
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={30}
                step={0.1}
                value={taxDraft}
                onChange={(e) => setTaxDraft(parseFloat(e.target.value) || 0)}
                className="w-20 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <span className="text-sm text-slate-500">%</span>
              <Button
                size="sm"
                className="h-8"
                disabled={taxDraft === taxRatePercent}
                onClick={() => {
                  setTaxRatePercent(taxDraft);
                  updateOrgSettings({ taxRatePercent: taxDraft });
                }}
              >
                Save
              </Button>
            </div>
          </SettingRow>
        </div>
      </div>

      {/* Requests Portal */}
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
          <SettingRow
            label="Accept Submissions"
            description="When disabled, the portal shows a closed message and no submissions are accepted."
          >
            <Toggle enabled={portalEnabled} onToggle={() => {
              setPortalEnabled(!portalEnabled);
              updateOrgSettings({ portalEnabled: !portalEnabled });
            }} />
          </SettingRow>
          <SettingRow
            label="Portal Link"
            description="Share this URL with anyone who should be able to submit requests."
          >
            <div className="flex items-center gap-2">
              <div className="flex h-8 flex-1 min-w-0 items-center rounded-md border bg-slate-50 px-3">
                <span className="truncate text-xs text-slate-600 font-mono">
                  {typeof window !== "undefined" ? window.location.origin : "https://yourapp.com"}/request
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0 gap-1.5 text-xs"
                onClick={() => {
                  const url = `${window.location.origin}/request`;
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
                onClick={() => window.open("/request", "_blank")}
              >
                <ExternalLink className="h-3 w-3" />
                Open
              </Button>
            </div>
          </SettingRow>
        </div>
      </div>
    </div>
  );
}

// ── CustomizationsTab ─────────────────────────────────────────────────────────

function CustomizationsTab() {
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
    requiredFields,
  } = useSettingsStore();
  const { mutate: updateOrgSettings, isPending: savingCustomizations } = useUpdateOrgSettings();

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <AccordionSection title="Locations" count={locations.length} defaultOpen={true}>
        <CategoryListEditor
          items={locations}
          onToggle={setLocationEnabled}
          onRename={setLocationLabel}
          onAdd={addLocation}
          onRemove={removeLocation}
          addPlaceholder="e.g. New York, NJ"
        />
      </AccordionSection>

      <AccordionSection title="Part Categories" count={partCategories.length}>
        <CategoryListEditor
          items={partCategories}
          onToggle={setPartCategoryEnabled}
          onRename={setPartCategoryLabel}
          onAdd={addPartCategory}
          onRemove={removePartCategory}
          addPlaceholder="e.g. Seals & Gaskets"
        />
      </AccordionSection>

      <AccordionSection title="Work Order Categories" count={woCategories.length}>
        <CategoryListEditor
          items={woCategories}
          onToggle={setWOCategoryEnabled}
          onRename={setWOCategoryLabel}
          onAdd={addWOCategory}
          onRemove={removeWOCategory}
          addPlaceholder="e.g. Welding"
        />
      </AccordionSection>

      <AccordionSection title="Asset Types" count={assetTypes.length}>
        <CategoryListEditor
          items={assetTypes}
          onToggle={setAssetTypeEnabled}
          onRename={setAssetTypeLabel}
          onAdd={addAssetType}
          onRemove={removeAssetType}
          addPlaceholder="e.g. Chainsaw"
        />
      </AccordionSection>

      <AccordionSection title="Fuel Types" count={fuelTypes.length}>
        <CategoryListEditor
          items={fuelTypes}
          onToggle={setFuelTypeEnabled}
          onRename={setFuelTypeLabel}
          onAdd={addFuelType}
          onRemove={removeFuelType}
          addPlaceholder="e.g. Propane"
        />
      </AccordionSection>

      <AccordionSection title="Vendor Types" count={vendorTypes.length}>
        <CategoryListEditor
          items={vendorTypes}
          onToggle={setVendorTypeEnabled}
          onRename={setVendorTypeLabel}
          onAdd={addVendorType}
          onRemove={removeVendorType}
          addPlaceholder="e.g. Subcontractor"
        />
      </AccordionSection>

      <AccordionSection title="Quick Reference Part # Fields" count={filterFields.length}>
        <CategoryListEditor
          items={filterFields}
          onToggle={setFilterFieldEnabled}
          onRename={setFilterFieldLabel}
          onAdd={addFilterField}
          onRemove={removeFilterField}
          addPlaceholder="e.g. Hydraulic Filter"
        />
      </AccordionSection>

      <div className="flex justify-end px-6 py-4">
        <Button
          size="sm"
          disabled={savingCustomizations}
          onClick={() =>
            updateOrgSettings({
              customizations: {
                woCategories,
                partCategories,
                assetTypes,
                fuelTypes,
                locations,
                vendorTypes,
                filterFields,
                requiredFields,
              },
            })
          }
        >
          {savingCustomizations ? "Saving…" : "Save Customizations"}
        </Button>
      </div>
    </div>
  );
}

// ── RequiredFieldsTab ─────────────────────────────────────────────────────────

const ENTITY_DISPLAY: { key: string; name: string }[] = [
  { key: "purchase_order", name: "Purchase Orders" },
  { key: "requisition",    name: "Requisitions" },
  { key: "work_order",     name: "Work Orders" },
  { key: "asset",          name: "Assets" },
  { key: "vehicle",        name: "Vehicles" },
];

function RequiredFieldsTab() {
  const { requiredFields, setFieldRequirement } = useSettingsStore();
  const { mutate: updateOrgSettings, isPending: saving } = useUpdateOrgSettings();

  function handleChange(entity: string, field: string, requirement: FieldRequirement) {
    setFieldRequirement(entity, field, requirement);
  }

  return (
    <div className="flex flex-col gap-6">
      {ENTITY_DISPLAY.map(({ key, name }) => {
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

function ImportExportTab() {
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

  const EXPORT_TILES: { label: string; icon: React.ReactNode }[] = [
    { label: "Work Orders",     icon: <ClipboardList className="h-6 w-6" /> },
    { label: "Assets",          icon: <Cog className="h-6 w-6" /> },
    { label: "Vehicles",        icon: <Truck className="h-6 w-6" /> },
    { label: "Parts",           icon: <Cog className="h-6 w-6" /> },
    { label: "Vendors",         icon: <Building2 className="h-6 w-6" /> },
    { label: "Requisitions",    icon: <FileText className="h-6 w-6" /> },
    { label: "Purchase Orders", icon: <ShoppingCart className="h-6 w-6" /> },
    { label: "Products",        icon: <ShoppingBag className="h-6 w-6" /> },
  ];

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
          <div className="grid grid-cols-4 gap-4">
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
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Work Orders",  icon: <ClipboardList className="h-6 w-6" />, onImport: (r: Record<string, string>[]) => bulkImportWorkOrders(r), templateColumns: ["title", "description", "priority", "status", "category", "assetName", "assignedToName", "dueDate"], required: ["title"] },
              { label: "Assets",       icon: <Cog className="h-6 w-6" />,           onImport: (r: Record<string, string>[]) => bulkImportAssets(r),     templateColumns: ["name", "assetTag", "equipmentNumber", "assetType", "make", "model", "year", "serialNumber", "location", "status", "purchaseVendorName", "purchaseDate", "purchasePrice", "paymentMethod", "financeInstitution"], required: ["name", "assetTag"] },
              { label: "Vehicles",     icon: <Truck className="h-6 w-6" />,         onImport: (r: Record<string, string>[]) => bulkImportVehicles(r),   templateColumns: ["name", "assetTag", "make", "model", "year", "licensePlate", "vin", "fuelType", "status", "assignedCrew", "purchaseVendorName", "purchaseDate", "purchasePrice", "paymentMethod", "financeInstitution"], required: ["name", "assetTag"] },
              { label: "Parts",        icon: <Cog className="h-6 w-6" />,            onImport: (r: Record<string, string>[]) => bulkImportParts(r),      templateColumns: ["name", "partNumber", "description", "category", "unitCost", "quantityOnHand", "minimumStock", "vendorName", "location"], required: ["name", "partNumber"] },
              { label: "Vendors",      icon: <Building2 className="h-6 w-6" />,     onImport: (r: Record<string, string>[]) => bulkImportVendors(r),    templateColumns: ["name", "contactName", "email", "phone", "address", "vendorType", "website", "notes"], required: ["name"] },
              { label: "Requisitions",    icon: <FileText className="h-6 w-6" />,      onImport: (r: Record<string, string>[]) => bulkImportRequisitions(r), templateColumns: ["title", "vendorName", "notes"], required: ["title"] },
              { label: "Products",        icon: <ShoppingBag className="h-6 w-6" />,  onImport: (r: Record<string, string>[]) => bulkImportProducts(r), templateColumns: ["name", "partNumber", "description", "category", "unitCost", "price", "quantityOnHand", "vendorName", "isInventory"], required: ["name", "partNumber", "category"] },
              { label: "Purchase Orders", icon: <ShoppingCart className="h-6 w-6" />,  onImport: (r: Record<string, string>[]) => bulkImportPurchaseOrders(r), templateColumns: ["vendorName", "poDate", "notes", "invoiceNumber"], required: ["vendorName"] },
            ].map((tile) => (
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

// ── Subscription tab ──────────────────────────────────────────────────────────

const MOCK_INVOICES = [
  { date: "03/02/2026", amount: "$157.97", status: "PAID" },
  { date: "02/02/2026", amount: "$157.97", status: "PAID" },
  { date: "01/02/2026", amount: "$157.97", status: "PAID" },
];

function SubscriptionTab() {
  const [showBankDetails, setShowBankDetails] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {/* Current Plan */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="flex items-start justify-between p-6">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Current Plan
            </p>
            <h2 className="text-2xl font-bold text-slate-900">Premium Plan</h2>
            <p className="mt-1 text-sm text-slate-500">
              Your next invoice is due on{" "}
              <span className="font-semibold text-slate-700">May 2nd</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button className="bg-brand-500 hover:bg-brand-600">Upgrade</Button>
            <p className="text-xl font-bold text-slate-900">$148.68</p>
            <p className="text-xs text-slate-400">$59 × 3 licenses × 1 month</p>
          </div>
        </div>
      </div>

      {/* Billing Period + Licenses */}
      <div className="grid grid-cols-2 gap-4">
        {/* Billing Period */}
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Billing Period
            </p>
            <Button size="sm" variant="outline">Switch to Annual</Button>
          </div>
          <p className="text-base font-semibold text-slate-900">Monthly Billing</p>
          <p className="mt-1 text-sm text-slate-500">
            Your plan can be billed either annually or monthly.
          </p>
        </div>

        {/* Licenses */}
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Licenses
            </p>
            <button className="text-xs font-medium text-brand-600 hover:text-brand-700">
              Manage
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-400" />
            <p className="text-base font-semibold text-slate-900">3 Licenses</p>
          </div>
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-full rounded-full bg-brand-500" />
            </div>
            <p className="mt-1.5 text-xs text-slate-500">3 of 3 seats used</p>
          </div>
        </div>
      </div>

      {/* Payment Method + Invoices */}
      <div className="grid grid-cols-2 gap-4">
        {/* Payment Method */}
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Payment Method
            </p>
            <button className="text-xs font-medium text-brand-600 hover:text-brand-700">
              Edit
            </button>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Billing Email</span>
              <span className="font-medium text-slate-900">
                brandonfusaro@twinslawnservice.com
              </span>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                ACH
              </span>
              <span className="font-medium text-slate-900">ACH Credit Transfer</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Bank Name:</span>
              <span className="text-slate-900">Wells Fargo</span>
            </div>
            {showBankDetails && (
              <div className="flex justify-between">
                <span className="text-slate-500">Account:</span>
                <span className="text-slate-900">••••• 4821</span>
              </div>
            )}
            <button
              onClick={() => setShowBankDetails(!showBankDetails)}
              className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              {showBankDetails ? "Hide details" : "Show details"}
              <ChevronDown
                className={`h-3 w-3 transition-transform ${showBankDetails ? "rotate-180" : ""}`}
              />
            </button>
            <p className="pt-1 text-xs text-slate-400">Next billing on May 2nd.</p>
          </div>
        </div>

        {/* Invoices */}
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Invoices
            </p>
            <button className="text-xs font-medium text-brand-600 hover:text-brand-700">
              View All
            </button>
          </div>
          <div className="flex flex-col divide-y">
            {MOCK_INVOICES.map((inv) => (
              <div key={inv.date} className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-700">{inv.date}</span>
                <span className="text-sm font-medium text-slate-900">{inv.amount}</span>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                    <Check className="h-3 w-3" />
                    {inv.status}
                  </span>
                  <button
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    title="Download invoice"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">All prices are in USD</p>
        </div>
      </div>

      {/* Plan features callout */}
      <div className="rounded-lg border border-brand-100 bg-brand-50 p-5">
        <div className="flex items-start gap-3">
          <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
          <div>
            <p className="text-sm font-semibold text-brand-800">
              Full billing management coming soon
            </p>
            <p className="mt-0.5 text-xs text-brand-600">
              Upgrade plans, add seats, and download invoices will be fully functional at
              launch. Contact{" "}
              <a href="mailto:billing@twinsOS.com" className="underline">
                billing@twinsOS.com
              </a>{" "}
              for changes in the meantime.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab label helper ──────────────────────────────────────────────────────────

function tabLabel(tab: string): string {
  switch (tab) {
    case "general":        return "General";
    case "subscription":   return "Subscription";
    case "customizations": return "Customizations";
    case "required_fields": return "Required Fields";
    case "approval_flows": return "Approval Flows";
    case "costing":        return "Costing";
    case "import_export":  return "Import / Export";
    case "notifications":  return "Notifications";
    default:               return tab;
  }
}

// ── Main SettingsPage component ───────────────────────────────────────────────

export default function SettingsPage() {
  const TAB_KEYS = [
    "general",
    "subscription",
    "customizations",
    "required_fields",
    "approval_flows",
    "costing",
    "import_export",
    "notifications",
  ] as const;

  // Suppress unused import warning for COST_METHOD_LABELS — it is used by CostingTab
  void COST_METHOD_LABELS;

  return (
    <div className="flex flex-col gap-0">
      <div className="px-6 pt-6 pb-0">
        <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your organization settings</p>
      </div>
      <Tabs defaultValue="general" className="mt-4">
        <div className="border-b px-6">
          <TabsList className="h-auto gap-0 rounded-none bg-transparent p-0">
            {TAB_KEYS.map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="rounded-none border-b-2 border-transparent px-4 py-3 text-sm font-medium text-slate-600 data-[state=active]:border-brand-500 data-[state=active]:bg-transparent data-[state=active]:text-brand-600 data-[state=active]:shadow-none"
              >
                {tabLabel(tab)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="p-6">
          <TabsContent value="general" className="mt-0">
            <GeneralTab />
          </TabsContent>

          <TabsContent value="subscription" className="mt-0">
            <SubscriptionTab />
          </TabsContent>

          <TabsContent value="customizations" className="mt-0">
            <CustomizationsTab />
          </TabsContent>

          <TabsContent value="required_fields" className="mt-0">
            <RequiredFieldsTab />
          </TabsContent>

          <TabsContent value="approval_flows" className="mt-0">
            <ApprovalFlowsPage />
          </TabsContent>

          <TabsContent value="costing" className="mt-0">
            <CostingTab />
          </TabsContent>

          <TabsContent value="import_export" className="mt-0">
            <ImportExportTab />
          </TabsContent>

          <TabsContent value="notifications" className="mt-0">
            <NotificationsPage hideHeader />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
