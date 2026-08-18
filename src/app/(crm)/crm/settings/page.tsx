"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Pencil,
  X,
  Eye,
  EyeOff,
  GripVertical,
  Users,
  UserPlus,
  FileText,
  Receipt,
  DollarSign,
  Ticket as TicketIcon,
  Wrench,
  CalendarDays,
  UserCog,
} from "lucide-react";
import {
  useCustomFieldDefs,
  useCreateCustomFieldDef,
  useUpdateCustomFieldDef,
  useDeleteCustomFieldDef,
  type CustomFieldDef,
} from "@/lib/hooks/use-client-custom-fields";
import { useOrgList, useAddOrgListItem, useDeleteOrgListItem } from "@/lib/hooks/use-org-lists";
import {
  useDiscounts,
  useCreateDiscount,
  useUpdateDiscount,
  useDeleteDiscount,
} from "@/lib/hooks/use-crm-discounts";
import type { DiscountType } from "@/types/crm-discounts";
import { formatCurrency } from "@/lib/utils";
import {
  Select as UISelect,
  SelectContent as UISelectContent,
  SelectItem as UISelectItem,
  SelectTrigger as UISelectTrigger,
  SelectValue as UISelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useOrgSettings, useUpdateOrgSettings } from "@/lib/hooks/use-org-settings";
import { useSettingsStore, type FieldRequirement } from "@/stores/settings-store";
import {
  useAllCRMServices,
  useCreateCRMService,
  useUpdateCRMService,
  useDeleteCRMService,
  useBulkImportCRMServices,
  useAllCRMSchedules,
  useBulkImportCRMSchedules,
} from "@/lib/hooks/use-crm-jobs";
import type { CRMService } from "@/types/crm-jobs";
import { RolesList } from "@/components/crm/roles/RolesList";
import { EstimateStagesEditor } from "@/components/crm/settings/EstimateStagesEditor";
import { OverheadSettingsEditor } from "@/components/crm/settings/OverheadSettingsEditor";
import { LaborRatesEditor } from "@/components/crm/settings/LaborRatesEditor";
import { ClientPortalTab } from "@/components/crm/settings/ClientPortalSettings";
import { SnowRoutesEditor } from "@/components/crm/settings/SnowRoutesEditor";
import { ChemicalTrackingTab } from "@/components/crm/settings/ChemicalTrackingSettings";
import { InvoiceTemplatesEditor } from "@/components/crm/settings/InvoiceTemplatesEditor";
import { useInvoicePDFTemplates } from "@/lib/hooks/use-invoice-pdf-templates";
import { ApprovalFlowsPage } from "@/components/settings/ApprovalFlowsPage";
import { BILLING_TERMS_OPTIONS } from "@/lib/constants";
import { downloadCSV, readCSVFile } from "@/lib/csv";
import { autoMapColumns, remapRows } from "@/components/shared/ImportExportMenu";
import { useClients, useLeads, useBulkImportClients, useBulkImportLeads } from "@/lib/hooks/use-clients";
import { useEstimates, useBulkImportEstimates } from "@/lib/hooks/use-estimates";
import { useEstimateStages } from "@/lib/hooks/use-estimate-stages";
import { useApprovalFlows } from "@/lib/hooks/use-approval-flows";
import { useInvoices, usePayments, useBulkImportInvoices, useBulkImportPayments } from "@/lib/hooks/use-invoices";
import { useTickets, useBulkImportTickets } from "@/lib/hooks/use-tickets";
import { useEmployees, useBulkImportEmployees } from "@/lib/hooks/use-employees";
import { NotificationsPage } from "@/components/settings/NotificationsPage";

// ── AccordionSection ──────────────────────────────────────────────────────────

function AccordionSection({
  title,
  count,
  children,
  defaultOpen = false,
  description,
}: {
  title: string;
  count?: number;
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
          {typeof count === "number" && (
            <span className="ml-2 text-xs text-slate-400">
              {count} item{count !== 1 ? "s" : ""}
            </span>
          )}
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

// ── Toggle ────────────────────────────────────────────────────────────────────

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

// ── GeneralTab ────────────────────────────────────────────────────────────────

function GeneralTab() {
  const { data: org, isLoading } = useOrgSettings();
  const { mutateAsync: updateOrg, isPending: saving } = useUpdateOrgSettings();

  const [orgName, setOrgName] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [phone, setPhone] = useState("");

  // Populate fields once org data loads
  useEffect(() => {
    if (!org) return;
    setOrgName(org.name ?? "");
    setStreet(org.address?.street ?? "");
    setCity(org.address?.city ?? "");
    setState(org.address?.state ?? "");
    setZip(org.address?.zip ?? "");
    setPhone(org.address?.phone ?? "");
  }, [org?.id]); // only fire once on load, not on every change

  async function handleSave() {
    try {
      await updateOrg({
        name: orgName.trim(),
        address: {
          street: street.trim(),
          city: city.trim(),
          state: state.trim(),
          zip: zip.trim(),
          phone: phone.trim(),
        },
      });
      toast.success("Company info saved");
    } catch {
      toast.error("Failed to save");
    }
  }

  if (isLoading) {
    return <div className="rounded-lg border bg-white shadow-sm p-6 text-sm text-slate-400">Loading…</div>;
  }

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <div className="px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Company Info</h2>
        <p className="mt-0.5 text-xs text-slate-500">General information about your organization</p>
      </div>
      <div className="border-t px-6 py-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label htmlFor="org-name">Organization Name</Label>
            <Input
              id="org-name"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Your company name"
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
            <Label htmlFor="street">Street Address</Label>
            <Input
              id="street"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
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
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
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
    } catch (err) { toast.error(`Failed to add: ${err instanceof Error ? err.message : JSON.stringify(err)}`); }
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

// ── Discounts editor (name + a real percent or flat-dollar rate) ───────────────

function DiscountsEditor() {
  const { data: discounts = [], isLoading } = useDiscounts();
  const { mutateAsync: createDiscount } = useCreateDiscount();
  const { mutateAsync: updateDiscount } = useUpdateDiscount();
  const { mutateAsync: deleteDiscount } = useDeleteDiscount();

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<DiscountType>("percent");
  const [newAmount, setNewAmount] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  function amountLabel(discountType: DiscountType, percentBps: number | null, flatCents: number | null) {
    return discountType === "percent"
      ? `${((percentBps ?? 0) / 100).toFixed(2)}%`
      : formatCurrency(flatCents ?? 0);
  }

  async function handleAdd() {
    const name = newName.trim();
    const amount = parseFloat(newAmount);
    if (!name) { toast.error("Enter a discount name"); return; }
    if (!amount || amount <= 0) {
      toast.error(newType === "percent" ? "Enter a rate greater than 0%" : "Enter an amount greater than $0");
      return;
    }
    try {
      await createDiscount({
        name,
        discountType: newType,
        percentBps: newType === "percent" ? Math.round(amount * 100) : null,
        flatCents: newType === "flat" ? Math.round(amount * 100) : null,
      });
      toast.success("Discount added");
      setNewName("");
      setNewAmount("");
      setNewType("percent");
      setAdding(false);
    } catch (err) {
      toast.error(`Failed to add discount: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  async function handleRemove(id: string) {
    if (!confirm("Remove this discount?")) return;
    try { await deleteDiscount(id); toast.success("Discount removed"); }
    catch { toast.error("Failed to remove discount"); }
  }

  function commitRename(id: string) {
    if (editName.trim()) void updateDiscount({ id, updates: { name: editName.trim() } });
    setEditingId(null);
  }

  if (isLoading) return <p className="text-sm text-slate-400 py-2">Loading…</p>;

  return (
    <div className="divide-y">
      {discounts.map((d) => (
        <div key={d.id} className="flex items-center gap-3 py-3">
          <div className="flex-1">
            {editingId === d.id ? (
              <input
                autoFocus
                className="rounded-md border border-brand-400 px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-400"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => commitRename(d.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(d.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
            ) : (
              <button
                className="text-left text-sm font-medium text-slate-800 hover:text-brand-600"
                onClick={() => { setEditingId(d.id); setEditName(d.name); }}
                title="Click to rename"
              >
                {d.name}
              </button>
            )}
            <p className="mt-0.5 text-xs text-slate-400">{amountLabel(d.discountType, d.percentBps, d.flatCents)} off</p>
          </div>

          <Toggle
            enabled={d.isActive}
            onToggle={() => void updateDiscount({ id: d.id, updates: { isActive: !d.isActive } })}
          />

          <button
            onClick={() => handleRemove(d.id)}
            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
            title="Remove"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      {discounts.length === 0 && !adding && (
        <p className="py-3 text-sm text-slate-400">No discounts yet.</p>
      )}

      {adding ? (
        <div className="flex items-center gap-2 py-3">
          <input
            autoFocus
            placeholder="e.g. Senior discount"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 rounded-md border border-brand-400 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          <UISelect value={newType} onValueChange={(v) => setNewType(v as DiscountType)}>
            <UISelectTrigger className="h-8 w-16 text-sm"><UISelectValue /></UISelectTrigger>
            <UISelectContent>
              <UISelectItem value="percent">%</UISelectItem>
              <UISelectItem value="flat">$</UISelectItem>
            </UISelectContent>
          </UISelect>
          <input
            type="number"
            min="0"
            step={newType === "percent" ? "0.1" : "0.01"}
            placeholder={newType === "percent" ? "10" : "5.00"}
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAdd();
              if (e.key === "Escape") { setAdding(false); setNewName(""); setNewAmount(""); }
            }}
            className="w-24 rounded-md border border-brand-400 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          <button onClick={() => void handleAdd()} className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600">Add</button>
          <button
            onClick={() => { setAdding(false); setNewName(""); setNewAmount(""); }}
            className="rounded p-1 text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="py-3">
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
            <Plus className="h-4 w-4" /> Add Discount
          </button>
        </div>
      )}
    </div>
  );
}

const INVOICE_FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "upon_completion", label: "Upon Completion" },
];

const INVOICE_DELIVERY_OPTIONS = [
  { value: "email", label: "Email" },
  { value: "print", label: "Print" },
  { value: "both", label: "Email & Print" },
];

function ClientDefaultsSection() {
  const { data: orgSettings } = useOrgSettings();
  const { mutate: updateOrgSettings, isPending: saving } = useUpdateOrgSettings();
  const seeded = useRef(false);

  const [prefix, setPrefix] = useState("");
  const [nextNumber, setNextNumber] = useState("1000");
  const [suffix, setSuffix] = useState("");
  const [billingTerms, setBillingTerms] = useState("due_on_receipt");
  const [invoiceFrequency, setInvoiceFrequency] = useState("daily");
  const [invoiceDelivery, setInvoiceDelivery] = useState("email");

  useEffect(() => {
    if (!orgSettings || seeded.current) return;
    seeded.current = true;
    setPrefix(orgSettings.accountNumberPrefix);
    setNextNumber(String(orgSettings.accountNumberNext));
    setSuffix(orgSettings.accountNumberSuffix);
    setBillingTerms(orgSettings.defaultBillingTerms);
    setInvoiceFrequency(orgSettings.defaultInvoiceFrequency);
    setInvoiceDelivery(orgSettings.defaultInvoiceDelivery);
  }, [orgSettings]);

  function handleSave() {
    const parsedNext = parseInt(nextNumber, 10);
    if (!Number.isFinite(parsedNext) || parsedNext < 1) {
      toast.error("Next account number must be a positive whole number");
      return;
    }
    updateOrgSettings(
      {
        accountNumberPrefix: prefix.trim(),
        accountNumberNext: parsedNext,
        accountNumberSuffix: suffix.trim(),
        defaultBillingTerms: billingTerms,
        defaultInvoiceFrequency: invoiceFrequency,
        defaultInvoiceDelivery: invoiceDelivery,
      },
      {
        onSuccess: () => toast.success("Client defaults saved"),
        onError: () => toast.error("Failed to save client defaults"),
      }
    );
  }

  const preview = `${prefix}${Number.isFinite(parseInt(nextNumber, 10)) ? nextNumber : "?"}${suffix}`;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-slate-800">Starting Account Number</p>
        <p className="text-xs text-slate-400">Auto-assigned to every new client. Next client will be: <span className="font-mono text-slate-600">{preview}</span></p>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Prefix</Label>
            <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="e.g. C-" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Next Number</Label>
            <Input
              type="number"
              min={1}
              value={nextNumber}
              onChange={(e) => setNextNumber(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Suffix</Label>
            <Input value={suffix} onChange={(e) => setSuffix(e.target.value)} placeholder="optional" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Default Billing Terms</Label>
          <UISelect value={billingTerms} onValueChange={setBillingTerms}>
            <UISelectTrigger><UISelectValue /></UISelectTrigger>
            <UISelectContent>
              {BILLING_TERMS_OPTIONS.map((o) => (
                <UISelectItem key={o.value} value={o.value}>{o.label}</UISelectItem>
              ))}
            </UISelectContent>
          </UISelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>When to Invoice</Label>
          <UISelect value={invoiceFrequency} onValueChange={setInvoiceFrequency}>
            <UISelectTrigger><UISelectValue /></UISelectTrigger>
            <UISelectContent>
              {INVOICE_FREQUENCY_OPTIONS.map((o) => (
                <UISelectItem key={o.value} value={o.value}>{o.label}</UISelectItem>
              ))}
            </UISelectContent>
          </UISelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Send Invoice By</Label>
          <UISelect value={invoiceDelivery} onValueChange={setInvoiceDelivery}>
            <UISelectTrigger><UISelectValue /></UISelectTrigger>
            <UISelectContent>
              {INVOICE_DELIVERY_OPTIONS.map((o) => (
                <UISelectItem key={o.value} value={o.value}>{o.label}</UISelectItem>
              ))}
            </UISelectContent>
          </UISelect>
        </div>
      </div>
      <p className="text-xs text-slate-400">These apply to new clients only — existing clients keep their current settings.</p>

      <div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Defaults"}
        </Button>
      </div>
    </div>
  );
}

function CRMTab() {
  const { data: cancellationReasons = [] } = useOrgList("cancellation_reasons");
  const { data: contactTypes = [] } = useOrgList("contact_types");
  const { data: clientSources = [] } = useOrgList("client_sources");
  const { data: clientTags = [] } = useOrgList("client_tags");
  const { data: ticketCategoryItems = [] } = useOrgList("ticket_categories");

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <AccordionSection
        title="Client Defaults"
        defaultOpen
        description="Account numbering and billing defaults applied to new clients"
      >
        <ClientDefaultsSection />
      </AccordionSection>
      <AccordionSection
        title="Cancellation Reasons"
        count={cancellationReasons.length}
      >
        <OrgListEditor listName="cancellation_reasons" addPlaceholder="e.g. Weather-related" />
      </AccordionSection>
      <AccordionSection title="Client Sources" count={clientSources.length}>
        <OrgListEditor listName="client_sources" addPlaceholder="e.g. Trade show" />
      </AccordionSection>
      <AccordionSection title="Contact Types" count={contactTypes.length}>
        <OrgListEditor listName="contact_types" addPlaceholder="e.g. Property manager" />
      </AccordionSection>
      <AccordionSection title="Ticket Categories" count={ticketCategoryItems.length}>
        <OrgListEditor listName="ticket_categories" addPlaceholder="e.g. Complaint" />
      </AccordionSection>
      <AccordionSection title="Tags" count={clientTags.length}>
        <OrgListEditor listName="client_tags" addPlaceholder="e.g. VIP" />
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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [saving, setSaving] = useState(false);

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

  function startEdit(def: CustomFieldDef) {
    setEditingId(def.id);
    setEditName(def.name);
    setEditUnit(def.unit ?? "");
  }

  async function handleSaveEdit() {
    if (!editName.trim()) { toast.error("Field name is required"); return; }
    if (!editingId) return;
    setSaving(true);
    try {
      await update({ id: editingId, name: editName.trim(), unit: editUnit.trim() || undefined });
      toast.success("Field updated");
      setEditingId(null);
    } catch {
      toast.error("Failed to update field");
    } finally {
      setSaving(false);
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
      {defs.map((def) =>
        editingId === def.id ? (
          <div key={def.id} className="flex items-end gap-2 py-3 flex-wrap">
            <div className="flex flex-col gap-1 flex-1 min-w-36">
              <label className="text-xs text-slate-500">Field Name</label>
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleSaveEdit(); if (e.key === "Escape") setEditingId(null); }}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </div>
            <div className="flex flex-col gap-1 w-28">
              <label className="text-xs text-slate-500">Unit (optional)</label>
              <input
                value={editUnit}
                onChange={(e) => setEditUnit(e.target.value)}
                placeholder="sq ft"
                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </div>
            <button
              onClick={() => void handleSaveEdit()}
              disabled={saving}
              className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setEditingId(null)} className="text-xs text-slate-400 hover:text-slate-700 px-1">
              Cancel
            </button>
          </div>
        ) : (
          <div key={def.id} className="flex items-center gap-3 py-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-800">{def.name}</p>
              <p className="text-xs text-slate-400">
                {def.fieldType === "number" ? "Number" : "Text"}
                {def.unit ? ` · ${def.unit}` : ""}
              </p>
            </div>
            <button
              onClick={() => startEdit(def)}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleDelete(def.id, def.name)}
              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
              title="Delete"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      )}

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
  const { data: estimateReasonItems = [] } = useOrgList("estimate_reasons");
  const { data: estimateStages = [] } = useEstimateStages();
  const { data: approvalFlows = [] } = useApprovalFlows();
  const estimateApprovalSteps = approvalFlows.find((f) => f.entityType === "crm_estimate")?.steps.length ?? 0;

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <AccordionSection title="Estimate Stages" count={estimateStages.length} defaultOpen>
        <EstimateStagesEditor />
      </AccordionSection>
      <AccordionSection
        title="Estimate Approval Flow"
        count={estimateApprovalSteps}
        description="Require manager sign-off before estimates above a dollar threshold can be sent to clients."
      >
        <ApprovalFlowsPage entityTypes={["crm_estimate"]} />
      </AccordionSection>
      <AccordionSection title="Won/Lost Reasons" count={estimateReasonItems.length}>
        <OrgListEditor listName="estimate_reasons" addPlaceholder="e.g. Seasonal" />
      </AccordionSection>
      <AccordionSection title="Labor Rates" count={0}>
        <LaborRatesEditor />
      </AccordionSection>
      <AccordionSection title="Overhead Recovery" count={0}>
        <OverheadSettingsEditor />
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
  const [codeDraft, setCodeDraft] = useState(service.code ?? "");
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
    if (!codeDraft.trim()) { toast.error("Service code is required"); return; }
    if (rateDraft !== "" && (isNaN(rateCents!) || rateCents! < 0)) {
      toast.error("Enter a valid rate"); return;
    }
    setSaving(true);
    try {
      await updateService({ id: service.id, patch: { name: nameDraft.trim(), code: codeDraft.trim().toUpperCase(), default_rate_cents: rateCents ?? null } });
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
      <div className="flex items-center gap-2 py-2 flex-wrap">
        <Input
          className="h-8 w-40 text-sm"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          placeholder="Service name"
        />
        <Input
          className="h-8 w-24 text-sm uppercase"
          value={codeDraft}
          onChange={(e) => setCodeDraft(e.target.value.toUpperCase())}
          placeholder="Code *"
          title="Short code, e.g. MOWING"
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
      {service.code && (
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-600">{service.code}</span>
      )}
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
  const [code, setCode] = useState("");
  const [rate, setRate] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!name.trim()) { toast.error("Service name is required"); return; }
    if (!code.trim()) { toast.error("Service code is required"); return; }
    const rateCents = rate !== "" ? Math.round(parseFloat(rate) * 100) : undefined;
    if (rate !== "" && (isNaN(rateCents!) || rateCents! < 0)) {
      toast.error("Enter a valid rate"); return;
    }
    setSaving(true);
    try {
      await createService({ name: name.trim(), code: code.trim().toUpperCase(), defaultRateCents: rateCents, productionRatePerManHour: undefined });
      toast.success("Service added");
      setName("");
      setCode("");
      setRate("");
      onAdded();
    } catch {
      toast.error("Failed to add service");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2 border-t pt-3 mt-1 flex-wrap">
      <Input
        className="h-8 w-40 text-sm"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Lawn Mowing"
      />
      <Input
        className="h-8 w-24 text-sm uppercase"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Code *"
        title="Short code, e.g. MOWING"
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
  const { data: serviceCategoryItems = [] } = useOrgList("service_categories");

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
      <AccordionSection title="Service Categories" count={serviceCategoryItems.length}>
        <OrgListEditor listName="service_categories" addPlaceholder="e.g. Hardscape" />
      </AccordionSection>
      <AccordionSection title="Snow Routes" description="Master Routes for the Snow Dispatch Board">
        <SnowRoutesEditor />
      </AccordionSection>
    </div>
  );
}

// ── AccountingTab ─────────────────────────────────────────────────────────────

function AccountingTab() {
  const { data: paymentMethods = [] } = useOrgList("payment_methods");
  const { data: discountsList = [] } = useDiscounts();
  const { data: invoiceTemplates = [] } = useInvoicePDFTemplates();
  const { data: orgSettings } = useOrgSettings();
  const { mutateAsync: updateOrg } = useUpdateOrgSettings();
  const [taxDraft, setTaxDraft] = useState<string>("");
  const [taxSaving, setTaxSaving] = useState(false);

  const [feeEnabledDraft, setFeeEnabledDraft] = useState(true);
  const [feePercentDraft, setFeePercentDraft] = useState<string>("");
  const [feeThresholdDraft, setFeeThresholdDraft] = useState<string>("");
  const [feeSaving, setFeeSaving] = useState(false);

  useEffect(() => {
    if (orgSettings) setTaxDraft(String(orgSettings.taxRatePercent ?? ""));
  }, [orgSettings?.taxRatePercent]);

  useEffect(() => {
    if (orgSettings) {
      setFeeEnabledDraft(orgSettings.ccProcessingFeeEnabled);
      setFeePercentDraft(String(orgSettings.ccProcessingFeePercent ?? ""));
      setFeeThresholdDraft(String(orgSettings.ccProcessingFeeThresholdDollars ?? ""));
    }
  }, [orgSettings?.ccProcessingFeeEnabled, orgSettings?.ccProcessingFeePercent, orgSettings?.ccProcessingFeeThresholdDollars]);

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

  const feeDraftDirty =
    feeEnabledDraft !== orgSettings?.ccProcessingFeeEnabled ||
    feePercentDraft !== String(orgSettings?.ccProcessingFeePercent ?? "") ||
    feeThresholdDraft !== String(orgSettings?.ccProcessingFeeThresholdDollars ?? "");

  async function saveProcessingFee() {
    const percent = parseFloat(feePercentDraft);
    const threshold = parseFloat(feeThresholdDraft);
    if (isNaN(percent) || percent < 0 || percent > 100) { toast.error("Enter a valid fee percent"); return; }
    if (isNaN(threshold) || threshold < 0) { toast.error("Enter a valid threshold"); return; }
    setFeeSaving(true);
    try {
      await updateOrg({
        ccProcessingFeeEnabled: feeEnabledDraft,
        ccProcessingFeePercent: percent,
        ccProcessingFeeThresholdDollars: threshold,
      });
      toast.success("Processing fee settings saved");
    } catch { toast.error("Failed to save processing fee settings"); }
    finally { setFeeSaving(false); }
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
        title="Credit Card Processing Fee"
        count={0}
        description="Optional surcharge added when a client pays an invoice by credit card, computed at the moment the card is charged — it never changes the invoice itself."
      >
        <div className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="cc-fee-enabled"
              checked={feeEnabledDraft}
              onCheckedChange={(v) => setFeeEnabledDraft(v === true)}
            />
            <Label htmlFor="cc-fee-enabled" className="font-normal">
              Automatically add a processing fee on card payments
            </Label>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1.5 w-48">
              <Label>Fee (%)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder="e.g. 3.50"
                value={feePercentDraft}
                onChange={(e) => setFeePercentDraft(e.target.value)}
                disabled={!feeEnabledDraft}
              />
            </div>
            <div className="flex flex-col gap-1.5 w-48">
              <Label>Applies above ($)</Label>
              <Input
                type="number"
                step="1"
                min="0"
                placeholder="e.g. 500"
                value={feeThresholdDraft}
                onChange={(e) => setFeeThresholdDraft(e.target.value)}
                disabled={!feeEnabledDraft}
              />
            </div>
            <Button size="sm" onClick={saveProcessingFee} disabled={feeSaving || !feeDraftDirty}>
              {feeSaving ? "Saving…" : "Save"}
            </Button>
          </div>
          <p className="text-xs text-slate-400">
            Staff can waive the fee on an individual invoice when charging a card from the invoice detail view.
          </p>
        </div>
      </AccordionSection>
      <AccordionSection
        title="Payment Methods"
        count={paymentMethods.length}
      >
        <OrgListEditor listName="payment_methods" addPlaceholder="e.g. Zelle" />
      </AccordionSection>
      <AccordionSection title="Discounts" count={discountsList.length} description="Each discount needs a default rate — a percent off or a flat dollar amount.">
        <DiscountsEditor />
      </AccordionSection>
      <AccordionSection
        title="Invoice Templates"
        count={invoiceTemplates.length}
        description="PDF layouts used when generating or printing an invoice. The starred template is the org default."
      >
        <InvoiceTemplatesEditor />
      </AccordionSection>
      <AccordionSection
        title="Invoice Email Templates"
        description="Email templates used when sending an invoice now live in Documents, alongside every other template type."
      >
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-slate-200 p-4">
          <p className="text-sm text-slate-600">
            Build and edit invoice email templates in <span className="font-medium">Documents</span> — create a
            document with type &quot;Invoice Email&quot;, and it&apos;ll show up in the template picker when
            emailing an invoice.
          </p>
          <Link href="/crm/settings/documents" className="w-fit">
            <Button size="sm" variant="outline" className="h-8 text-xs">
              Go to Documents
            </Button>
          </Link>
        </div>
      </AccordionSection>
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
  return (
    <div className="space-y-4">

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
      const message =
        err instanceof Error ? err.message :
        (err && typeof err === "object" && "message" in err && typeof err.message === "string") ? err.message :
        "Import failed.";
      setImportError(message);
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
                  <UISelect value={columnMapping[field] || "__skip__"} onValueChange={(v) => setColumnMapping((prev) => ({ ...prev, [field]: v === "__skip__" ? "" : v }))}>
                    <UISelectTrigger className="h-9 text-sm"><UISelectValue placeholder="Skip" /></UISelectTrigger>
                    <UISelectContent>
                      <UISelectItem value="__skip__"><span className="text-slate-400">— Skip —</span></UISelectItem>
                      {csvColumns.map((col) => (<UISelectItem key={col} value={col}>{col}</UISelectItem>))}
                    </UISelectContent>
                  </UISelect>
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
  const { data: clients } = useClients();
  const { data: leads } = useLeads();
  const { data: estimates } = useEstimates();
  const { data: invoices } = useInvoices();
  const { data: payments } = usePayments();
  const { data: tickets } = useTickets();
  const { data: services } = useAllCRMServices();
  const { data: schedules } = useAllCRMSchedules();
  const { data: employees } = useEmployees(false);

  // Bulk import hooks
  const { mutateAsync: bulkImportClients } = useBulkImportClients();
  const { mutateAsync: bulkImportLeads } = useBulkImportLeads();
  const { mutateAsync: bulkImportEstimates } = useBulkImportEstimates();
  const { mutateAsync: bulkImportInvoices } = useBulkImportInvoices();
  const { mutateAsync: bulkImportPayments } = useBulkImportPayments();
  const { mutateAsync: bulkImportTickets } = useBulkImportTickets();
  const { mutateAsync: bulkImportServices } = useBulkImportCRMServices();
  const { mutateAsync: bulkImportSchedules } = useBulkImportCRMSchedules();
  const { mutateAsync: bulkImportEmployees } = useBulkImportEmployees();

  function handleExport(label: string) {
    switch (label) {
      case "Clients":
        if (!clients?.length) return;
        downloadCSV("clients.csv",
          ["displayName", "accountType", "primaryPhone", "primaryEmail", "billingAddress", "billingCity", "billingState", "billingZip", "source", "accountNumber"],
          clients.map((c) => [c.displayName, c.accountType, c.primaryPhone ?? "", c.primaryEmail ?? "", c.billingAddress ?? "", c.billingCity ?? "", c.billingState ?? "", c.billingZip ?? "", c.source ?? "", c.accountNumber ?? ""]));
        break;
      case "Leads":
        if (!leads?.length) return;
        downloadCSV("leads.csv",
          ["displayName", "accountType", "primaryPhone", "primaryEmail", "billingAddress", "billingCity", "billingState", "billingZip", "source"],
          leads.map((c) => [c.displayName, c.accountType, c.primaryPhone ?? "", c.primaryEmail ?? "", c.billingAddress ?? "", c.billingCity ?? "", c.billingState ?? "", c.billingZip ?? "", c.source ?? ""]));
        break;
      case "Estimates":
        if (!estimates?.length) return;
        downloadCSV("estimates.csv",
          ["clientName", "description", "estimateDate", "validUntilDate", "poNumber", "stage"],
          estimates.map((e) => [e.clientName ?? "", e.description, e.estimateDate, e.validUntilDate ?? "", e.poNumber ?? "", e.stage]));
        break;
      case "Invoices":
        if (!invoices?.length) return;
        downloadCSV("invoices.csv",
          ["clientName", "description", "invoiceDate", "dueDate", "poNumber", "status", "amount", "taxAmount"],
          invoices.map((inv) => [inv.clientName ?? "", inv.description, inv.invoiceDate, inv.dueDate ?? "", inv.poNumber ?? "", inv.status, (inv.subtotalCents / 100).toFixed(2), (inv.taxCents / 100).toFixed(2)]));
        break;
      case "Payments":
        if (!payments?.length) return;
        downloadCSV("payments.csv",
          ["clientName", "amount", "paymentDate", "method", "reference", "memo", "invoiceNumber"],
          payments.map((p) => [p.clientName ?? "", (p.amountCents / 100).toFixed(2), p.paymentDate, p.method, p.reference ?? "", p.memo ?? "", p.invoiceNumber != null ? String(p.invoiceNumber) : ""]));
        break;
      case "Tickets":
        if (!tickets?.length) return;
        downloadCSV("tickets.csv",
          ["subject", "clientName", "type", "status", "priority", "category", "body", "dueDate"],
          tickets.map((t) => [t.subject ?? "", t.clientName ?? "", t.type, t.status, t.priority, t.category ?? "", t.body ?? "", t.dueDate ?? ""]));
        break;
      case "Services":
        if (!services?.length) return;
        downloadCSV("services.csv",
          ["name", "code", "category", "unit", "defaultRate", "productionRate", "isActive"],
          services.map((s) => [s.name, s.code ?? "", s.category, s.unit, s.defaultRateCents != null ? (s.defaultRateCents / 100).toFixed(2) : "", s.productionRateSqftPerHr != null ? String(s.productionRateSqftPerHr) : "", s.isActive ? "yes" : "no"]));
        break;
      case "Schedules":
        if (!schedules?.length) return;
        downloadCSV("schedules.csv",
          ["name", "frequency", "dayOfWeek", "weekPattern", "anchorDate", "seasonStart", "seasonEnd", "weekOfMonth"],
          schedules.map((s) => [s.name, s.frequency, s.dayOfWeek, s.weekPattern ?? "", s.anchorDate ?? "", s.seasonStart ?? "", s.seasonEnd ?? "", s.weekOfMonth ?? ""]));
        break;
      case "Employees":
        if (!employees?.length) return;
        downloadCSV("employees.csv",
          ["firstName", "lastName", "email", "phone", "cellPhone", "address", "city", "state", "zip", "dateHired", "resourceCode", "hourlyRate"],
          employees.map((e) => [e.firstName, e.lastName, e.email ?? "", e.phone ?? "", e.cellPhone ?? "", e.address ?? "", e.city ?? "", e.state ?? "", e.zip ?? "", e.dateHired ?? "", e.resourceCode ?? "", e.hourlyRateCents != null ? (e.hourlyRateCents / 100).toFixed(2) : ""]));
        break;
      default:
        break;
    }
  }

  const EXPORT_TILES: { label: string; icon: React.ReactNode }[] = [
    { label: "Clients",   icon: <Users className="h-6 w-6" /> },
    { label: "Leads",     icon: <UserPlus className="h-6 w-6" /> },
    { label: "Estimates", icon: <FileText className="h-6 w-6" /> },
    { label: "Invoices",  icon: <Receipt className="h-6 w-6" /> },
    { label: "Payments",  icon: <DollarSign className="h-6 w-6" /> },
    { label: "Tickets",   icon: <TicketIcon className="h-6 w-6" /> },
    { label: "Services",  icon: <Wrench className="h-6 w-6" /> },
    { label: "Schedules", icon: <CalendarDays className="h-6 w-6" /> },
    { label: "Employees", icon: <UserCog className="h-6 w-6" /> },
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
              { label: "Clients",   icon: <Users className="h-6 w-6" />,       onImport: (r: Record<string, string>[]) => bulkImportClients(r),   templateColumns: ["displayName", "accountType", "primaryPhone", "primaryEmail", "billingAddress", "billingCity", "billingState", "billingZip", "serviceAddress", "serviceCity", "serviceState", "serviceZip", "source", "accountNumber"], required: ["displayName"] },
              { label: "Leads",     icon: <UserPlus className="h-6 w-6" />,    onImport: (r: Record<string, string>[]) => bulkImportLeads(r),      templateColumns: ["displayName", "accountType", "primaryPhone", "primaryEmail", "billingAddress", "billingCity", "billingState", "billingZip", "source"], required: ["displayName"] },
              { label: "Estimates", icon: <FileText className="h-6 w-6" />,    onImport: (r: Record<string, string>[]) => bulkImportEstimates(r),  templateColumns: ["clientName", "description", "estimateDate", "validUntilDate", "poNumber", "stage"], required: ["clientName", "description"] },
              { label: "Invoices",  icon: <Receipt className="h-6 w-6" />,     onImport: (r: Record<string, string>[]) => bulkImportInvoices(r),   templateColumns: ["clientName", "description", "invoiceDate", "dueDate", "poNumber", "status", "amount", "taxAmount"], required: ["clientName", "description", "amount"] },
              { label: "Payments",  icon: <DollarSign className="h-6 w-6" />,  onImport: (r: Record<string, string>[]) => bulkImportPayments(r),   templateColumns: ["clientName", "amount", "paymentDate", "method", "reference", "memo", "invoiceNumber"], required: ["clientName", "amount"] },
              { label: "Tickets",   icon: <TicketIcon className="h-6 w-6" />,  onImport: (r: Record<string, string>[]) => bulkImportTickets(r),    templateColumns: ["subject", "clientName", "type", "status", "priority", "category", "body", "dueDate"], required: ["subject"] },
              { label: "Services",  icon: <Wrench className="h-6 w-6" />,      onImport: (r: Record<string, string>[]) => bulkImportServices(r),   templateColumns: ["name", "code", "category", "unit", "defaultRate", "productionRate", "isActive"], required: ["name"] },
              { label: "Schedules", icon: <CalendarDays className="h-6 w-6" />, onImport: (r: Record<string, string>[]) => bulkImportSchedules(r), templateColumns: ["name", "frequency", "dayOfWeek", "weekPattern", "anchorDate", "seasonStart", "seasonEnd", "weekOfMonth"], required: ["name", "frequency", "dayOfWeek"] },
              { label: "Employees", icon: <UserCog className="h-6 w-6" />,     onImport: (r: Record<string, string>[]) => bulkImportEmployees(r),  templateColumns: ["firstName", "lastName", "email", "phone", "cellPhone", "address", "city", "state", "zip", "dateHired", "resourceCode", "hourlyRate"], required: ["firstName", "lastName"] },
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

// ── Required Fields tab ───────────────────────────────────────────────────────
// Reuses the same requiredFields store as CMMS/PO settings (organizations
// .customizations.requiredFields) — just scoped to CRM entities here.

const CRM_ENTITY_DISPLAY: { key: string; name: string }[] = [
  { key: "client",   name: "Clients" },
  { key: "ticket",   name: "Tickets" },
  { key: "estimate", name: "Estimates" },
  { key: "job",      name: "Jobs" },
];

function CRMRequiredFieldsTab() {
  const { requiredFields, setFieldRequirement } = useSettingsStore();
  const { mutate: updateOrgSettings, isPending: saving } = useUpdateOrgSettings();

  return (
    <div className="flex flex-col gap-6">
      {CRM_ENTITY_DISPLAY.map(({ key, name }) => {
        const fields = requiredFields[key] ?? [];
        return (
          <div key={key} className="rounded-lg border bg-white shadow-sm">
            <div className="px-6 py-4">
              <h2 className="text-sm font-semibold text-slate-900">{name}</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Set which fields are required, optional, or hidden when creating a {name.toLowerCase().replace(/s$/, "")}
              </p>
            </div>
            <Separator />
            <table className="w-full">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="px-6 py-2 text-left text-xs font-medium text-slate-500">Field</th>
                  <th className="px-6 py-2 text-right text-xs font-medium text-slate-500">Requirement</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {fields.map((f) => (
                  <tr key={f.field}>
                    <td className="px-6 py-3 text-sm text-slate-800">{f.label}</td>
                    <td className="px-6 py-3 text-right">
                      <UISelect
                        value={f.requirement}
                        onValueChange={(val) => setFieldRequirement(key, f.field, val as FieldRequirement)}
                      >
                        <UISelectTrigger className="ml-auto h-8 w-32 text-xs"><UISelectValue /></UISelectTrigger>
                        <UISelectContent>
                          <UISelectItem value="required">Required</UISelectItem>
                          <UISelectItem value="optional">Optional</UISelectItem>
                          <UISelectItem value="hidden">Hidden</UISelectItem>
                        </UISelectContent>
                      </UISelect>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      <div className="flex justify-end">
        <Button size="sm" disabled={saving} onClick={() => updateOrgSettings({ customizations: { requiredFields } })}>
          {saving ? "Saving…" : "Save Required Fields"}
        </Button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TAB_KEYS = [
  "general",
  "users",
  "crm",
  "estimates",
  "notifications",
  "services",
  "accounting",
  "chemical_tracking",
  "required_fields",
  "import_export",
  "integrations",
  "client_portal",
] as const;

type TabKey = (typeof TAB_KEYS)[number];

function tabLabel(tab: TabKey): string {
  switch (tab) {
    case "general":           return "General";
    case "users":             return "Users & Roles";
    case "crm":               return "CRM";
    case "estimates":         return "Estimates";
    case "notifications":     return "Notifications";
    case "services":          return "Services";
    case "accounting":        return "Accounting";
    case "chemical_tracking": return "Chemical Tracking";
    case "required_fields":  return "Required Fields";
    case "import_export":     return "Import / Export";
    case "integrations":      return "Integrations";
    case "client_portal":     return "Client Portal";
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
          <TabsContent value="notifications" className="mt-0">
            <NotificationsPage hideHeader scope="crm" />
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
          <TabsContent value="required_fields" className="mt-0">
            <CRMRequiredFieldsTab />
          </TabsContent>
          <TabsContent value="import_export" className="mt-0">
            <ImportExportTab />
          </TabsContent>
          <TabsContent value="integrations" className="mt-0">
            <IntegrationsTab />
          </TabsContent>
          <TabsContent value="client_portal" className="mt-0">
            <ClientPortalTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
