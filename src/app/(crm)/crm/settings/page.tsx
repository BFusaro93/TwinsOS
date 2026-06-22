"use client";

import React, { useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  Eye,
  EyeOff,
  GripVertical,
} from "lucide-react";
import {
  useCustomFieldDefs,
  useCreateCustomFieldDef,
  useUpdateCustomFieldDef,
  useDeleteCustomFieldDef,
} from "@/lib/hooks/use-client-custom-fields";
import { useOrgList, useAddOrgListItem, useDeleteOrgListItem } from "@/lib/hooks/use-org-lists";
import {
  Select as UISelect,
  SelectContent as UISelectContent,
  SelectItem as UISelectItem,
  SelectTrigger as UISelectTrigger,
  SelectValue as UISelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useOrgSettings, useUpdateOrgSettings } from "@/lib/hooks/use-org-settings";
import {
  useAllCRMServices,
  useCreateCRMService,
  useUpdateCRMService,
  useDeleteCRMService,
} from "@/lib/hooks/use-crm-jobs";
import type { CRMService } from "@/types/crm-jobs";
import { RolesList } from "@/components/crm/roles/RolesList";

// ── AccordionSection ──────────────────────────────────────────────────────────

function AccordionSection({
  title,
  count,
  children,
  defaultOpen = false,
  description,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  description?: string;
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
          {description && (
            <p className="mt-0.5 text-xs text-slate-500">{description}</p>
          )}
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

function useCategoryList(defaults: string[], builtIn = true) {
  const [items, setItems] = useState<CategoryListItem[]>(
    defaults.map((label, i) => ({
      id: `builtin-${i}`,
      label,
      enabled: true,
      isBuiltIn: builtIn,
    }))
  );

  function onToggle(id: string, enabled: boolean) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, enabled } : item)));
  }

  function onRename(id: string, label: string) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, label } : item)));
  }

  function onAdd(label: string) {
    setItems((prev) => [
      ...prev,
      { id: `custom-${Date.now()}`, label, enabled: true, isBuiltIn: false },
    ]);
  }

  function onRemove(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  return { items, onToggle, onRename, onAdd, onRemove };
}

interface CategoryListEditorProps {
  items: CategoryListItem[];
  onToggle: (id: string, enabled: boolean) => void;
  onRename: (id: string, label: string) => void;
  onAdd: (label: string) => void;
  onRemove: (id: string) => void;
  addPlaceholder?: string;
}

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
  const [orgName, setOrgName] = useState("Twins Lawn Service");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  function handleSave() {
    toast.success("Saved");
  }

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <div className="px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Company Info</h2>
        <p className="mt-0.5 text-xs text-slate-500">General information about your organization</p>
      </div>
      <div className="border-t px-6 py-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-name">Organization Name</Label>
            <Input
              id="org-name"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Your company name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@yourcompany.com"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 000-0000"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="address">Street Address</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="NJ"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="zip">ZIP</Label>
              <Input
                id="zip"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                placeholder="07001"
              />
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <Button onClick={handleSave}>Save Changes</Button>
        </div>
      </div>
    </div>
  );
}

// ── UsersTab ──────────────────────────────────────────────────────────────────

function UsersTab() {
  return <RolesList />;
}

// ── CRMTab ────────────────────────────────────────────────────────────────────

function OrgListEditor({ listName, addPlaceholder }: { listName: string; addPlaceholder?: string }) {
  const { data: items = [], isLoading } = useOrgList(listName);
  const { mutateAsync: addItem } = useAddOrgListItem();
  const { mutateAsync: deleteItem } = useDeleteOrgListItem();
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState("");

  async function handleAdd() {
    if (!newValue.trim()) return;
    try {
      await addItem({ listName, value: newValue.trim() });
      toast.success("Added");
      setNewValue("");
      setAdding(false);
    } catch { toast.error("Failed to add"); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this option?")) return;
    try { await deleteItem({ id, listName }); toast.success("Removed"); }
    catch { toast.error("Failed to remove"); }
  }

  if (isLoading) return <p className="text-sm text-slate-400 py-2">Loading…</p>;

  return (
    <div className="divide-y">
      {items.map((item: import("@/lib/hooks/use-org-lists").OrgListOption) => (
        <div key={item.id} className="flex items-center gap-3 py-3">
          <span className="flex-1 text-sm text-slate-800">{item.value}</span>
          <button onClick={() => handleDelete(item.id)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500" title="Remove">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {adding ? (
        <div className="flex items-center gap-3 py-3">
          <input
            autoFocus
            placeholder={addPlaceholder ?? "New value"}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); if (e.key === "Escape") { setAdding(false); setNewValue(""); } }}
            className="flex-1 rounded-md border border-brand-400 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          <button onClick={() => void handleAdd()} className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600">Add</button>
          <button onClick={() => { setAdding(false); setNewValue(""); }} className="rounded p-1 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <div className="py-3">
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
            <Plus className="h-4 w-4" /> Add Item
          </button>
        </div>
      )}
    </div>
  );
}

function CRMTab() {
  const cancellationReasons = useCategoryList([
    "Price",
    "Moved",
    "Unhappy with service",
    "No longer needs service",
  ]);
  const contactTypes = useCategoryList([
    "Owner",
    "Billing contact",
    "Site manager",
    "Decision maker",
    "Other",
  ]);
  const ticketCategories = useCategoryList([
    "Uncategorized",
    "Estimate",
    "Billing",
    "Client Portal Message",
    "Need to Contact Customer",
  ]);
  const tags = useCategoryList([], false);

  const { data: clientSources = [] } = useOrgList("client_sources");

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <AccordionSection
        title="Cancellation Reasons"
        count={cancellationReasons.items.length}
        defaultOpen
      >
        <CategoryListEditor {...cancellationReasons} addPlaceholder="e.g. Weather-related" />
      </AccordionSection>
      <AccordionSection title="Client Sources" count={clientSources.length}>
        <OrgListEditor listName="client_sources" addPlaceholder="e.g. Trade show" />
      </AccordionSection>
      <AccordionSection title="Contact Types" count={contactTypes.items.length}>
        <CategoryListEditor {...contactTypes} addPlaceholder="e.g. Property manager" />
      </AccordionSection>
      <AccordionSection title="Ticket Categories" count={ticketCategories.items.length}>
        <CategoryListEditor {...ticketCategories} addPlaceholder="e.g. Complaint" />
      </AccordionSection>
      <AccordionSection title="Tags" count={tags.items.length}>
        <CategoryListEditor {...tags} addPlaceholder="e.g. VIP" />
      </AccordionSection>
      <AccordionSection title="Custom Client Fields" count={0} defaultOpen={false} description="Define takeoff fields and custom data points collected on every client (used in estimate rate matrices)">
        <CustomFieldDefsEditor />
      </AccordionSection>
    </div>
  );
}

// ── CustomFieldDefsEditor ─────────────────────────────────────────────────────

function CustomFieldDefsEditor() {
  const { data: defs = [], isLoading } = useCustomFieldDefs();
  const { mutateAsync: create, isPending: creating } = useCreateCustomFieldDef();
  const { mutateAsync: update } = useUpdateCustomFieldDef();
  const { mutateAsync: remove } = useDeleteCustomFieldDef();

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"text" | "number">("number");
  const [newUnit, setNewUnit] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    if (!newName.trim()) { toast.error("Field name is required"); return; }
    try {
      await create({ name: newName.trim(), fieldType: newType, unit: newUnit.trim() || undefined });
      toast.success("Custom field added");
      setNewName("");
      setNewUnit("");
      setAdding(false);
    } catch {
      toast.error("Failed to add field");
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete custom field "${name}"? Existing values on clients will be lost.`)) return;
    try {
      await remove(id);
      toast.success("Field deleted");
    } catch {
      toast.error("Failed to delete field");
    }
  }

  if (isLoading) return <p className="text-sm text-slate-400 py-2">Loading…</p>;

  return (
    <div className="divide-y">
      {/* Built-in read-only list */}
      <div className="pb-3">
        <p className="text-xs text-slate-400 mb-2">Built-in takeoffs (always available, stored on the client record)</p>
        {["Turf Sq. Ft.", "Mulch Bed Sq. Ft.", "Gross Sq. Ft.", "Linear Ft. Perimeter", "Linear Ft. Edging", "Yards of Mulch"].map((f) => (
          <div key={f} className="flex items-center gap-2 py-1.5 text-sm text-slate-600">
            <GripVertical className="h-3.5 w-3.5 text-slate-200" />
            <span className="flex-1">{f}</span>
            <span className="text-xs text-slate-300">Built-in</span>
          </div>
        ))}
      </div>

      {/* User-defined fields */}
      {defs.map((def) => (
        <div key={def.id} className="flex items-center gap-3 py-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-800">{def.name}</p>
            <p className="text-xs text-slate-400">
              {def.fieldType === "number" ? "Number" : "Text"}
              {def.unit ? ` · ${def.unit}` : ""}
            </p>
          </div>
          <button
            onClick={() => handleDelete(def.id, def.name)}
            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
            title="Delete"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      {/* Add new */}
      {adding ? (
        <div className="pt-3 space-y-2">
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex flex-col gap-1 flex-1 min-w-36">
              <label className="text-xs text-slate-500">Field Name</label>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Parking Lot Sq. Ft."
                onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); if (e.key === "Escape") setAdding(false); }}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </div>
            <div className="flex flex-col gap-1 w-28">
              <label className="text-xs text-slate-500">Type</label>
              <UISelect value={newType} onValueChange={(v) => setNewType(v as "text" | "number")}>
                <UISelectTrigger className="h-9 text-sm"><UISelectValue /></UISelectTrigger>
                <UISelectContent>
                  <UISelectItem value="number">Number</UISelectItem>
                  <UISelectItem value="text">Text</UISelectItem>
                </UISelectContent>
              </UISelect>
            </div>
            <div className="flex flex-col gap-1 w-28">
              <label className="text-xs text-slate-500">Unit (optional)</label>
              <input
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                placeholder="sq ft"
                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleAdd()}
              disabled={creating}
              className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {creating ? "Adding…" : "Add Field"}
            </button>
            <button onClick={() => setAdding(false)} className="text-xs text-slate-400 hover:text-slate-700">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="pt-3">
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            <Plus className="h-4 w-4" />
            Add Custom Field
          </button>
        </div>
      )}
    </div>
  );
}

// ── EstimatesTab ──────────────────────────────────────────────────────────────

function EstimatesTab() {
  const estimateStages = useCategoryList([
    "Draft",
    "Quote",
    "Sent",
    "Approved",
    "Won",
    "Lost",
    "Invoiced",
  ]);
  const estimateReasons = useCategoryList([
    "New service",
    "Upsell",
    "Renewal",
    "Referral",
  ]);

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <AccordionSection
        title="Estimate Stages"
        count={estimateStages.items.length}
        defaultOpen
      >
        <CategoryListEditor {...estimateStages} addPlaceholder="e.g. Pending Review" />
      </AccordionSection>
      <AccordionSection title="Estimate Reasons" count={estimateReasons.items.length}>
        <CategoryListEditor {...estimateReasons} addPlaceholder="e.g. Seasonal" />
      </AccordionSection>
      <AccordionSection title="Templates" count={0}>
        <p className="text-sm text-slate-500">
          <Link
            href="/crm/settings/estimates"
            className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
          >
            Manage estimate templates →
          </Link>
        </p>
      </AccordionSection>
    </div>
  );
}

// ── ServicesTab ───────────────────────────────────────────────────────────────

function ServiceRow({
  service,
  onSaved,
}: {
  service: CRMService;
  onSaved: () => void;
}) {
  const { mutateAsync: updateService } = useUpdateCRMService();
  const { mutateAsync: deleteService } = useDeleteCRMService();
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(service.name);
  const [rateDraft, setRateDraft] = useState(
    service.defaultRateCents != null
      ? String((service.defaultRateCents / 100).toFixed(2))
      : ""
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    const rateCents = rateDraft !== "" ? Math.round(parseFloat(rateDraft) * 100) : null;
    if (!nameDraft.trim()) { toast.error("Service name is required"); return; }
    if (rateDraft !== "" && (isNaN(rateCents!) || rateCents! < 0)) {
      toast.error("Enter a valid rate"); return;
    }
    setSaving(true);
    try {
      await updateService({ id: service.id, patch: { name: nameDraft.trim(), default_rate_cents: rateCents ?? null } });
      toast.success("Service updated");
      setEditing(false);
      onSaved();
    } catch {
      toast.error("Failed to update service");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteService(service.id);
      toast.success("Service deleted");
      onSaved();
    } catch {
      toast.error("Failed to delete service");
    } finally {
      setDeleting(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Input
          className="h-8 w-48 text-sm"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          placeholder="Service name"
        />
        <Input
          className="h-8 w-28 text-sm"
          type="number"
          min="0"
          step="0.01"
          value={rateDraft}
          onChange={(e) => setRateDraft(e.target.value)}
          placeholder="Rate ($/hr)"
        />
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="flex-1 text-sm text-slate-800">{service.name}</span>
      {service.defaultRateCents != null && (
        <span className="text-xs text-slate-500">
          ${(service.defaultRateCents / 100).toFixed(2)}/hr
        </span>
      )}
      {service.productionRateSqftPerHr != null && (
        <span className="text-xs text-slate-400">
          {service.productionRateSqftPerHr} sq ft/man-hr
        </span>
      )}
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(true)}>
        Edit
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs text-red-500 hover:text-red-600"
        onClick={handleDelete}
        disabled={deleting}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function AddServiceForm({ onAdded }: { onAdded: () => void }) {
  const { mutateAsync: createService } = useCreateCRMService();
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!name.trim()) { toast.error("Service name is required"); return; }
    const rateCents = rate !== "" ? Math.round(parseFloat(rate) * 100) : undefined;
    if (rate !== "" && (isNaN(rateCents!) || rateCents! < 0)) {
      toast.error("Enter a valid rate"); return;
    }
    setSaving(true);
    try {
      await createService({ name: name.trim(), defaultRateCents: rateCents, productionRatePerManHour: undefined });
      toast.success("Service added");
      setName("");
      setRate("");
      onAdded();
    } catch {
      toast.error("Failed to add service");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2 border-t pt-3 mt-1">
      <Input
        className="h-8 w-48 text-sm"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Lawn Mowing"
      />
      <Input
        className="h-8 w-28 text-sm"
        type="number"
        min="0"
        step="0.01"
        value={rate}
        onChange={(e) => setRate(e.target.value)}
        placeholder="Rate ($/hr)"
      />
      <Button size="sm" onClick={handleAdd} disabled={saving}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        {saving ? "Adding…" : "Add Service"}
      </Button>
    </div>
  );
}

function ServicesTab() {
  const { data: services = [], refetch } = useAllCRMServices();
  const salesReps = useCategoryList(["Brandon Fusaro", "Michael Fusaro", "Pam Fusaro"]);
  const masterPackages = useCategoryList([], false);
  const snowRoutes = useCategoryList([], false);

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <AccordionSection
        title="Services"
        count={services.length}
        defaultOpen
        description="Define the services you offer"
      >
        <div className="divide-y px-1">
          {services.map((svc) => (
            <ServiceRow key={svc.id} service={svc} onSaved={refetch} />
          ))}
          {services.length === 0 && (
            <p className="py-3 text-sm text-slate-400">No services yet. Add one below.</p>
          )}
          <AddServiceForm onAdded={refetch} />
        </div>
      </AccordionSection>
      <AccordionSection title="Sales Reps" count={salesReps.items.length}>
        <CategoryListEditor {...salesReps} addPlaceholder="e.g. John Smith" />
      </AccordionSection>
      <AccordionSection title="Master Packages" count={masterPackages.items.length}>
        <CategoryListEditor {...masterPackages} addPlaceholder="e.g. Gold Maintenance" />
      </AccordionSection>
      <AccordionSection title="Snow Routes" count={snowRoutes.items.length}>
        <CategoryListEditor {...snowRoutes} addPlaceholder="e.g. Route A" />
      </AccordionSection>
    </div>
  );
}

// ── AccountingTab ─────────────────────────────────────────────────────────────

function AccountingTab() {
  const paymentMethods = useCategoryList([
    "ACH/E-Check",
    "AR Write-off",
    "AutoPay",
    "Cash",
    "Check",
    "Credit Card- AmEx",
    "Credit Card- Discover",
    "Credit Card- MasterCard",
    "Credit Card- Visa",
    "Other",
  ]);
  const discounts = useCategoryList([], false);
  const { data: orgSettings } = useOrgSettings();
  const { mutateAsync: updateOrg } = useUpdateOrgSettings();
  const [taxDraft, setTaxDraft] = useState<string>("");
  const [taxSaving, setTaxSaving] = useState(false);

  useEffect(() => {
    if (orgSettings) setTaxDraft(String(orgSettings.taxRatePercent ?? ""));
  }, [orgSettings?.taxRatePercent]);

  async function saveTaxRate() {
    const val = parseFloat(taxDraft);
    if (isNaN(val) || val < 0) { toast.error("Enter a valid tax rate"); return; }
    setTaxSaving(true);
    try {
      await updateOrg({ taxRatePercent: val });
      toast.success("Default tax rate saved");
    } catch { toast.error("Failed to save tax rate"); }
    finally { setTaxSaving(false); }
  }

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <AccordionSection title="Sales Tax" count={0} defaultOpen description="Org-wide default tax rate applied to new invoices. Can be overridden per client.">
        <div className="space-y-4 p-4">
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1.5 w-48">
              <Label>Default Tax Rate (%)</Label>
              <Input
                type="number"
                step="0.25"
                min="0"
                max="30"
                placeholder="e.g. 7.00"
                value={taxDraft}
                onChange={(e) => setTaxDraft(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              onClick={saveTaxRate}
              disabled={taxSaving || taxDraft === String(orgSettings?.taxRatePercent ?? "")}
            >
              {taxSaving ? "Saving…" : "Save"}
            </Button>
          </div>
          <p className="text-xs text-slate-400">
            This rate is used as the default for new invoices. Each client can have their own tax rate set on their profile — that takes priority over this org default.
          </p>
        </div>
      </AccordionSection>
      <AccordionSection
        title="Payment Methods"
        count={paymentMethods.items.length}
      >
        <CategoryListEditor {...paymentMethods} addPlaceholder="e.g. Zelle" />
      </AccordionSection>
      <AccordionSection title="Discounts" count={discounts.items.length}>
        <CategoryListEditor {...discounts} addPlaceholder="e.g. Senior discount" />
      </AccordionSection>
    </div>
  );
}

// ── ChemicalTrackingTab ───────────────────────────────────────────────────────

function ChemicalTrackingTab() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border bg-white py-20 shadow-sm">
      <p className="text-sm text-slate-500">Chemical tracking configuration coming soon</p>
    </div>
  );
}

// ── IntegrationsTab ───────────────────────────────────────────────────────────

function IntegrationCard({
  title,
  description,
  status,
  children,
}: {
  title: string;
  description: string;
  status: "connected" | "not_connected" | "coming_soon";
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <div className="flex items-start justify-between px-6 py-4 border-b">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
          status === "connected"
            ? "bg-green-100 text-green-700"
            : status === "coming_soon"
            ? "bg-slate-100 text-slate-500"
            : "bg-yellow-100 text-yellow-700"
        }`}>
          {status === "connected" ? "Connected" : status === "coming_soon" ? "Coming Soon" : "Not Connected"}
        </span>
      </div>
      {children && <div className="px-6 py-4">{children}</div>}
    </div>
  );
}

function GoogleMapsCard() {
  const { data: orgSettings } = useOrgSettings();
  const updateOrg = useUpdateOrgSettings();
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (orgSettings?.googleMapsApiKey) setApiKey(orgSettings.googleMapsApiKey);
  }, [orgSettings?.googleMapsApiKey]);

  const isConfigured = !!orgSettings?.googleMapsApiKey;

  async function handleSave() {
    if (!apiKey.trim()) return;
    try {
      await updateOrg.mutateAsync({ googleMapsApiKey: apiKey.trim() });
      toast.success("Google Maps API key saved");
    } catch {
      toast.error("Failed to save API key");
    }
  }

  async function handleRemove() {
    try {
      await updateOrg.mutateAsync({ googleMapsApiKey: null });
      setApiKey("");
      toast.success("API key removed");
    } catch {
      toast.error("Failed to remove API key");
    }
  }

  async function handleTest() {
    if (!apiKey.trim()) return;
    setTesting(true);
    try {
      const res = await fetch("/api/crm/route-optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitIds: ["test-ping"] }),
      });
      const data = await res.json() as { error?: string };
      // A 422 with "Not enough visits" means the key was found — good
      // A 422 with "not configured" means key was not saved yet
      if (data.error?.includes("not configured")) {
        toast.error("Save the key first, then test.");
      } else if (data.error?.includes("Google Maps API error")) {
        toast.error(`Key rejected by Google: ${data.error}`);
      } else {
        toast.success("API key is valid and reachable");
      }
    } catch {
      toast.error("Could not reach the route-optimize endpoint");
    } finally {
      setTesting(false);
    }
  }

  return (
    <IntegrationCard
      title="Google Maps — Route Optimization"
      description="Optimize crew routes on the Dispatch Board using the Distance Matrix API. Requires a Google Maps Platform API key with Distance Matrix enabled."
      status={isConfigured ? "connected" : "not_connected"}
    >
      <div className="space-y-4">
        <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-800">
          <p className="font-semibold mb-1">Setup instructions</p>
          <ol className="list-decimal ml-4 space-y-0.5">
            <li>Go to <span className="font-mono">console.cloud.google.com</span> → APIs &amp; Services</li>
            <li>Enable <strong>Distance Matrix API</strong> and <strong>Directions API</strong></li>
            <li>Create an API key and restrict it to those two APIs</li>
            <li>Paste the key below and click Save</li>
          </ol>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">API Key</Label>
          <div className="relative">
            <Input
              className="h-8 font-mono text-xs pr-10"
              type={showKey ? "text" : "password"}
              placeholder="AIzaSy…"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <button
              type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              onClick={() => setShowKey((s) => !s)}
            >
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={handleSave}
            disabled={!apiKey.trim() || updateOrg.isPending}
          >
            {updateOrg.isPending ? "Saving…" : "Save Key"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={handleTest}
            disabled={testing || !apiKey.trim()}
          >
            {testing ? "Testing…" : "Test Connection"}
          </Button>
          {isConfigured && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-red-500 hover:text-red-700"
              onClick={handleRemove}
              disabled={updateOrg.isPending}
            >
              Remove Key
            </Button>
          )}
        </div>
      </div>
    </IntegrationCard>
  );
}

function IntegrationsTab() {
  const [stripePublishable, setStripePublishable] = useState("");
  const [stripeSecret, setStripeSecret] = useState("");
  const [stripeWebhook, setStripeWebhook] = useState("");

  function handleStripeConnect() {
    toast.info("Stripe integration coming soon — API keys will be stored securely in environment variables.");
  }

  return (
    <div className="space-y-4">

      {/* Stripe / Card Processing */}
      <IntegrationCard
        title="Stripe — Credit Card & ACH Processing"
        description="Accept credit cards (Visa, MasterCard, AmEx, Discover) and ACH/bank transfers directly from client invoices and the client portal."
        status="not_connected"
      >
        <div className="space-y-3">
          <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-800">
            <p className="font-semibold mb-1">Setup required</p>
            <p>Once connected, clients can pay invoices online via credit card or ACH. AutoPay will charge stored cards automatically on the billing day. Requires a Stripe account.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Publishable Key</Label>
              <Input
                className="h-8 font-mono text-xs"
                type="text"
                placeholder="pk_live_…"
                value={stripePublishable}
                onChange={(e) => setStripePublishable(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Secret Key</Label>
              <Input
                className="h-8 font-mono text-xs"
                type="password"
                placeholder="sk_live_…"
                value={stripeSecret}
                onChange={(e) => setStripeSecret(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <Label className="text-xs">Webhook Secret</Label>
              <Input
                className="h-8 font-mono text-xs"
                type="password"
                placeholder="whsec_…"
                value={stripeWebhook}
                onChange={(e) => setStripeWebhook(e.target.value)}
              />
            </div>
          </div>
          <Button size="sm" className="h-8 text-xs" onClick={handleStripeConnect}>
            Connect Stripe
          </Button>
        </div>
      </IntegrationCard>

      {/* QuickBooks */}
      <IntegrationCard
        title="QuickBooks Online"
        description="Sync invoices, payments, and clients with QuickBooks for seamless bookkeeping."
        status="coming_soon"
      />

      {/* DocuSign */}
      <IntegrationCard
        title="DocuSign"
        description="Send contracts for e-signature directly from the Contracts module."
        status="coming_soon"
      />

      {/* Google Maps */}
      <GoogleMapsCard />

    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TAB_KEYS = [
  "general",
  "users",
  "crm",
  "estimates",
  "services",
  "accounting",
  "chemical_tracking",
  "integrations",
] as const;

type TabKey = (typeof TAB_KEYS)[number];

function tabLabel(tab: TabKey): string {
  switch (tab) {
    case "general":           return "General";
    case "users":             return "Users & Roles";
    case "crm":               return "CRM";
    case "estimates":         return "Estimates";
    case "services":          return "Services";
    case "accounting":        return "Accounting";
    case "chemical_tracking": return "Chemical Tracking";
    case "integrations":      return "Integrations";
  }
}

export default function CRMSettingsPage() {
  return (
    <div className="flex flex-col gap-0">
      <div className="px-4 pt-4 pb-0 md:px-6 md:pt-6">
        <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your CRM configuration</p>
      </div>
      <Tabs defaultValue="general" className="mt-4">
        <div className="border-b px-4 md:px-6">
          <TabsList className="h-auto flex-wrap gap-0 rounded-none bg-transparent p-0">
            {TAB_KEYS.map((tab) => (
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
          <TabsContent value="general" className="mt-0">
            <GeneralTab />
          </TabsContent>
          <TabsContent value="users" className="mt-0">
            <UsersTab />
          </TabsContent>
          <TabsContent value="crm" className="mt-0">
            <CRMTab />
          </TabsContent>
          <TabsContent value="estimates" className="mt-0">
            <EstimatesTab />
          </TabsContent>
          <TabsContent value="services" className="mt-0">
            <ServicesTab />
          </TabsContent>
          <TabsContent value="accounting" className="mt-0">
            <AccountingTab />
          </TabsContent>
          <TabsContent value="chemical_tracking" className="mt-0">
            <ChemicalTrackingTab />
          </TabsContent>
          <TabsContent value="integrations" className="mt-0">
            <IntegrationsTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
