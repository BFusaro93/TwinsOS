"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  useClients,
  useOrgTags,
  useBulkCancelClients,
  useBulkActivateClients,
  useBulkUpdateClients,
} from "@/lib/hooks/use-clients";
import { useOrgList } from "@/lib/hooks/use-org-lists";
import { useCRMServices } from "@/lib/hooks/use-crm-jobs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BulkTagDialog } from "@/components/crm/BulkTagDialog";
import { ColumnSelector, type ColumnDef } from "@/components/crm/shared/ColumnSelector";
import { useColumnPrefs } from "@/lib/hooks/use-column-prefs";
import {
  Search, Building2, Home, Maximize2, Tag, X, ChevronDown,
  SlidersHorizontal, Ban, CheckCircle, Pencil,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import type { Client, ClientStatus, AccountType } from "@/types/crm";
import { ACCOUNT_TYPE_COLOR } from "@/lib/account-type-colors";

// ── Column visibility ─────────────────────────────────────────────────────────

const CLIENT_COLUMNS: ColumnDef[] = [
  { key: "tags",          label: "Tags" },
  { key: "type",          label: "Type" },
  { key: "status",        label: "Status" },
  { key: "phone",         label: "Phone" },
  { key: "email",         label: "Email" },
  { key: "city",          label: "City" },
  { key: "zip",           label: "Zip" },
  { key: "balance",       label: "Balance" },
  { key: "source",        label: "Source" },
  { key: "clientSince",   label: "Client Since" },
  { key: "accountNumber", label: "Account #" },
];

// Default view = every column already shown today, plus Email.
const CLIENT_DEFAULT_VISIBLE: Record<string, boolean> = {
  tags: true, type: true, status: true, phone: true, email: true, city: true, balance: true,
  source: false, clientSince: false, accountNumber: false, zip: false,
};

// ── Filter query builder types ────────────────────────────────────────────────

type FilterOperator = "eq" | "neq" | "contains" | "starts_with" | "lt" | "gt" | "lte" | "gte";
type FilterFieldType = "text" | "select" | "number" | "date" | "boolean";

interface FilterFieldDef {
  value: string;
  label: string;
  type: FilterFieldType;
  options?: { v: string; l: string }[];
}

interface FilterRow {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}

function operatorsFor(type: FilterFieldType): { value: FilterOperator; label: string }[] {
  switch (type) {
    case "text":    return [{ value: "contains", label: "Contains" }, { value: "starts_with", label: "Starts With" }, { value: "eq", label: "= Equal To" }];
    case "select":  return [{ value: "eq", label: "= Equal To" }, { value: "neq", label: "≠ Does Not Equal" }];
    case "number":
    case "date":    return [{ value: "lt", label: "< Less Than" }, { value: "gt", label: "> Greater Than" }, { value: "eq", label: "= Equal To" }, { value: "lte", label: "≤ Less Than Or Equal To" }, { value: "gte", label: "≥ Greater Than Or Equal To" }];
    case "boolean": return [{ value: "eq", label: "= Equal To" }];
  }
}

function defaultOperator(type: FilterFieldType): FilterOperator {
  switch (type) {
    case "text":    return "contains";
    case "number":
    case "date":    return "lt";
    default:        return "eq";
  }
}

const STATUS_COLOR: Record<string, string> = {
  active:    "bg-green-100 text-green-700",
  inactive:  "bg-slate-100 text-slate-500",
  lead:      "bg-yellow-100 text-yellow-700",
  cancelled: "bg-red-100 text-red-600",
  lost:      "bg-orange-100 text-orange-700",
};

// ── Cancel dialog ─────────────────────────────────────────────────────────────

function BulkCancelDialog({
  open, onOpenChange, count, onConfirm,
}: { open: boolean; onOpenChange: (o: boolean) => void; count: number; onConfirm: (reason: string) => Promise<void> }) {
  const { data: reasons = [] } = useOrgList("cancellation_reasons");
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);

  const BUILTIN = ["Price", "Moved", "Unhappy with service", "No longer needs service"];
  const allReasons = [...BUILTIN, ...reasons.map((r) => r.value)];

  async function confirm() {
    const finalReason = reason === "__custom__" ? custom.trim() : reason;
    if (!finalReason) { toast.error("Select a reason"); return; }
    setSaving(true);
    try {
      await onConfirm(finalReason);
      onOpenChange(false);
    } catch { toast.error("Failed to cancel clients"); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Cancel {count} Client{count !== 1 ? "s" : ""}</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-600">Select a cancellation reason. This is required and drives cancellation reporting.</p>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Reason <span className="text-red-500">*</span></Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select reason…" /></SelectTrigger>
              <SelectContent>
                {allReasons.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                <SelectItem value="__custom__">Other (type below)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {reason === "__custom__" && (
            <Input
              placeholder="Describe reason…"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={confirm} disabled={saving}>
            {saving ? "Cancelling…" : `Cancel ${count} Client${count !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Bulk Edit dialog ──────────────────────────────────────────────────────────

function BulkEditDialog({
  open, onOpenChange, count, onConfirm,
}: { open: boolean; onOpenChange: (o: boolean) => void; count: number; onConfirm: (patch: Record<string, unknown>) => Promise<void> }) {
  const [field, setField] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const FIELDS = [
    { key: "status",       label: "Status",       options: ["active", "inactive", "lead", "cancelled", "lost"] },
    { key: "account_type", label: "Account Type", options: ["residential", "commercial"] },
    { key: "source",       label: "Source",       options: [] },
    { key: "priority",     label: "Priority",     options: ["low", "normal", "high"] },
    { key: "ok_to_email",  label: "OK to Email",  options: ["true", "false"] },
    { key: "do_not_market", label: "Do Not Market", options: ["true", "false"] },
  ];

  const selected = FIELDS.find((f) => f.key === field);

  async function confirm() {
    if (!field || !value) { toast.error("Choose a field and value"); return; }
    setSaving(true);
    let parsedValue: unknown = value;
    if (field === "ok_to_email" || field === "do_not_market") parsedValue = value === "true";
    try {
      await onConfirm({ [field]: parsedValue });
      onOpenChange(false);
      setField(""); setValue("");
    } catch { toast.error("Failed to update clients"); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Bulk Edit — {count} Client{count !== 1 ? "s" : ""}</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-600">Choose one field to update across all selected clients.</p>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Field</Label>
            <Select value={field} onValueChange={(v) => { setField(v); setValue(""); }}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select field…" /></SelectTrigger>
              <SelectContent>
                {FIELDS.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {selected && (
            <div>
              <Label className="text-xs">New Value</Label>
              {selected.options.length > 0 ? (
                <Select value={value} onValueChange={setValue}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select value…" /></SelectTrigger>
                  <SelectContent>
                    {selected.options.map((o) => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input className="mt-1" value={value} onChange={(e) => setValue(e.target.value)} placeholder={`New ${selected.label.toLowerCase()}…`} />
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={confirm} disabled={saving || !field || !value}>
            {saving ? "Updating…" : `Update ${count} Client${count !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main table ────────────────────────────────────────────────────────────────

interface Props {
  onSelect?: (client: Client) => void;
}

export function ClientsTable({ onSelect }: Props) {
  const { data: clients, isLoading } = useClients();
  const orgTags = useOrgTags();
  const { mutateAsync: bulkCancel } = useBulkCancelClients();
  const { mutateAsync: bulkActivate } = useBulkActivateClients();
  const { mutateAsync: bulkUpdate } = useBulkUpdateClients();

  const { data: crmServices = [] } = useCRMServices();

  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterRows, setFilterRows] = useState<FilterRow[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [fieldSearch, setFieldSearch] = useState("");

  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const router = useRouter();

  const { visible: cols, toggle: toggleCol } = useColumnPrefs("crm-clients-table-columns", CLIENT_DEFAULT_VISIBLE);
  // +checkbox +name +actions
  const visibleColumnCount = 3 + CLIENT_COLUMNS.filter((c) => cols[c.key] ?? true).length;

  // Derived options for dynamic select fields
  const uniqueSources = useMemo(() =>
    Array.from(new Set((clients ?? []).map((c) => c.source).filter((s): s is string => !!s))),
    [clients]
  );
  const uniqueSalesReps = useMemo(() =>
    Array.from(
      new Map(
        (clients ?? [])
          .filter((c) => c.salesRepId && c.salesRepName)
          .map((c) => [c.salesRepId!, { id: c.salesRepId!, name: c.salesRepName! }])
      ).values()
    ),
    [clients]
  );
  const serviceNames = useMemo(() =>
    Array.from(new Set(crmServices.map((s: { name?: string }) => s.name).filter((n): n is string => !!n))),
    [crmServices]
  );

  const FILTER_FIELDS: FilterFieldDef[] = useMemo(() => [
    { value: "status",         label: "Status",           type: "select",
      options: [{ v: "active", l: "Active" }, { v: "lead", l: "Lead" }, { v: "inactive", l: "Inactive" }, { v: "cancelled", l: "Cancelled" }, { v: "lost", l: "Lost" }] },
    { value: "account_type",   label: "Account Type",     type: "select",
      options: [{ v: "residential", l: "Residential" }, { v: "commercial", l: "Commercial" }] },
    { value: "balance",        label: "Balance",          type: "number" },
    { value: "city",           label: "City",             type: "text" },
    { value: "service_city",   label: "Service City",     type: "text" },
    { value: "source",         label: "Client Source",    type: "select",
      options: uniqueSources.map((s) => ({ v: s, l: s })) },
    { value: "sales_rep",      label: "Sales Rep",        type: "select",
      options: uniqueSalesReps.map((r) => ({ v: r.id, l: r.name })) },
    { value: "priority",       label: "Priority",         type: "select",
      options: [{ v: "low", l: "Low" }, { v: "normal", l: "Normal" }, { v: "high", l: "High" }] },
    { value: "client_since",   label: "Client Since Date", type: "date" },
    { value: "tags",           label: "Tags",             type: "select",
      options: orgTags.map((t) => ({ v: t, l: t })) },
    { value: "active_service", label: "Active Service",   type: "select",
      options: serviceNames.map((n) => ({ v: n, l: n })) },
    { value: "referred_by",    label: "Referred By",      type: "boolean" },
    { value: "do_not_market",  label: "Do Not Market",    type: "boolean" },
    { value: "taxable",        label: "Taxable",          type: "boolean" },
    { value: "ok_to_email",    label: "OK to Email",      type: "boolean" },
  ], [uniqueSources, uniqueSalesReps, orgTags, serviceNames]);

  function addFilterRow() {
    setFilterRows((prev) => [...prev, { id: crypto.randomUUID(), field: "status", operator: "eq", value: "" }]);
  }
  function removeFilterRow(id: string) {
    setFilterRows((prev) => prev.filter((r) => r.id !== id));
  }
  function updateFilterRow(id: string, patch: Partial<FilterRow>) {
    setFilterRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }
  function clearFilters() { setFilterRows([]); }

  const activeFilterCount = filterRows.filter((r) => r.value !== "").length;

  const filtered = useMemo(() => {
    const base = (clients ?? []).filter((c) => {
      // search
      const q = search.toLowerCase();
      if (q && !(
        c.displayName.toLowerCase().includes(q) ||
        (c.primaryEmail ?? "").toLowerCase().includes(q) ||
        (c.primaryPhone ?? "").includes(q) ||
        (c.billingCity ?? "").toLowerCase().includes(q) ||
        (c.tags ?? []).some((t) => t.toLowerCase().includes(q))
      )) return false;

      // filter rows
      for (const row of filterRows) {
        if (!row.value) continue;
        const op = row.operator;
        switch (row.field) {
          case "status":
            if (op === "eq" && c.status !== row.value) return false;
            if (op === "neq" && c.status === row.value) return false;
            break;
          case "account_type":
            if (op === "eq" && c.accountType !== row.value) return false;
            if (op === "neq" && c.accountType === row.value) return false;
            break;
          case "balance": {
            const bal = (c.balanceOutstandingCents ?? 0) / 100;
            const val = parseFloat(row.value);
            if (isNaN(val)) break;
            if (op === "eq"  && bal !== val) return false;
            if (op === "lt"  && bal >= val)  return false;
            if (op === "gt"  && bal <= val)  return false;
            if (op === "lte" && bal > val)   return false;
            if (op === "gte" && bal < val)   return false;
            break;
          }
          case "city": {
            const city = (c.billingCity ?? "").toLowerCase();
            const val = row.value.toLowerCase();
            if (op === "contains"    && !city.includes(val))    return false;
            if (op === "starts_with" && !city.startsWith(val))  return false;
            if (op === "eq"          && city !== val)           return false;
            break;
          }
          case "service_city": {
            const city = (c.serviceCity ?? "").toLowerCase();
            const val = row.value.toLowerCase();
            if (op === "contains"    && !city.includes(val))    return false;
            if (op === "starts_with" && !city.startsWith(val))  return false;
            if (op === "eq"          && city !== val)           return false;
            break;
          }
          case "source":
            if (op === "eq"  && c.source !== row.value) return false;
            if (op === "neq" && c.source === row.value) return false;
            break;
          case "sales_rep":
            if (op === "eq"  && c.salesRepId !== row.value) return false;
            if (op === "neq" && c.salesRepId === row.value) return false;
            break;
          case "priority": {
            const pri = c.priority ?? "normal";
            if (op === "eq"  && pri !== row.value) return false;
            if (op === "neq" && pri === row.value) return false;
            break;
          }
          case "client_since": {
            if (!c.clientSince) return false;
            const cDate = c.clientSince.slice(0, 10);
            const val   = row.value;
            if (op === "eq"  && cDate !== val)  return false;
            if (op === "lt"  && cDate >= val)   return false;
            if (op === "gt"  && cDate <= val)   return false;
            if (op === "lte" && cDate > val)    return false;
            if (op === "gte" && cDate < val)    return false;
            break;
          }
          case "tags":
            if (op === "eq"  && !(c.tags ?? []).includes(row.value)) return false;
            if (op === "neq" && (c.tags ?? []).includes(row.value))  return false;
            break;
          case "active_service":
            // Future: join against crm_jobs; skip filtering for now
            break;
          case "referred_by":
            if (op === "eq" && row.value === "yes" && !c.referredBy) return false;
            if (op === "eq" && row.value === "no"  && !!c.referredBy) return false;
            break;
          case "do_not_market":
            if (op === "eq" && row.value === "yes" && !c.doNotMarket) return false;
            if (op === "eq" && row.value === "no"  && c.doNotMarket)  return false;
            break;
          case "taxable":
            if (op === "eq" && row.value === "yes" && !c.isTaxable) return false;
            if (op === "eq" && row.value === "no"  && c.isTaxable)  return false;
            break;
          case "ok_to_email":
            if (op === "eq" && row.value === "yes" && !c.okToEmail) return false;
            if (op === "eq" && row.value === "no"  && c.okToEmail)  return false;
            break;
        }
      }
      return true;
    });
    return base;
  }, [clients, search, filterRows]);

  const allSelected = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));
  const someSelected = filtered.some((c) => selectedIds.has(c.id)) && !allSelected;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds((prev) => { const next = new Set(prev); filtered.forEach((c) => next.delete(c.id)); return next; });
    } else {
      setSelectedIds((prev) => { const next = new Set(prev); filtered.forEach((c) => next.add(c.id)); return next; });
    }
  }
  function toggleOne(id: string) {
    setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  const selectedCount = selectedIds.size;
  const selectedClientIds = Array.from(selectedIds);

  function clearSelection() { setSelectedIds(new Set()); }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            className="h-8 pl-8 text-sm"
            placeholder="Search clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn("h-8 gap-1.5", activeFilterCount > 0 && "border-brand-500 text-brand-600")}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <Badge className="ml-0.5 h-4 min-w-4 rounded-full px-1 text-[10px]">{activeFilterCount}</Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[540px] p-0">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b bg-[#4a4a4a] rounded-t-md">
              <span className="text-sm font-semibold text-white">Filters</span>
              {filterRows.length > 0 && (
                <button onClick={clearFilters} className="text-xs text-white/70 hover:text-white underline">
                  Clear all
                </button>
              )}
            </div>
            {/* Filter rows */}
            <div className="p-3 space-y-2 max-h-[60vh] overflow-y-auto">
              {filterRows.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">No filters applied. Click &ldquo;+ Add Filter&rdquo; to start.</p>
              )}
              {filterRows.map((row) => {
                const fieldDef = FILTER_FIELDS.find((f) => f.value === row.field) ?? FILTER_FIELDS[0];
                const ops = operatorsFor(fieldDef.type);
                return (
                  <div key={row.id} className="flex items-center gap-1.5">
                    {/* Field selector */}
                    <div className="relative w-44 shrink-0">
                      <Select
                        value={row.field}
                        onValueChange={(v) => {
                          const def = FILTER_FIELDS.find((f) => f.value === v) ?? FILTER_FIELDS[0];
                          updateFilterRow(row.id, { field: v, operator: defaultOperator(def.type), value: "" });
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          <div className="px-2 py-1.5 sticky top-0 bg-white border-b">
                            <Input
                              className="h-6 text-xs"
                              placeholder="Filter: Enter keywords"
                              value={fieldSearch}
                              onChange={(e) => setFieldSearch(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            />
                          </div>
                          {FILTER_FIELDS
                            .filter((f) => !fieldSearch || f.label.toLowerCase().includes(fieldSearch.toLowerCase()))
                            .map((f) => (
                              <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Operator selector */}
                    <Select
                      value={row.operator}
                      onValueChange={(v) => updateFilterRow(row.id, { operator: v as FilterOperator, value: "" })}
                    >
                      <SelectTrigger className="h-7 text-xs w-44 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ops.map((op) => (
                          <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* Value input */}
                    <div className="flex-1 min-w-0">
                      {fieldDef.type === "boolean" ? (
                        <Select value={row.value} onValueChange={(v) => updateFilterRow(row.id, { value: v })}>
                          <SelectTrigger className="h-7 text-xs w-full">
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="yes" className="text-xs">Yes</SelectItem>
                            <SelectItem value="no"  className="text-xs">No</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : fieldDef.type === "select" && fieldDef.options && fieldDef.options.length > 0 ? (
                        <Select value={row.value} onValueChange={(v) => updateFilterRow(row.id, { value: v })}>
                          <SelectTrigger className="h-7 text-xs w-full">
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent className="max-h-48">
                            {fieldDef.options.map((opt) => (
                              <SelectItem key={opt.v} value={opt.v} className="text-xs">{opt.l}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : fieldDef.type === "date" ? (
                        <Input
                          type="date"
                          className="h-7 text-xs w-full"
                          value={row.value}
                          onChange={(e) => updateFilterRow(row.id, { value: e.target.value })}
                        />
                      ) : fieldDef.type === "number" ? (
                        <Input
                          type="number"
                          className="h-7 text-xs w-full"
                          placeholder="0.00"
                          value={row.value}
                          onChange={(e) => updateFilterRow(row.id, { value: e.target.value })}
                        />
                      ) : (
                        <Input
                          className="h-7 text-xs w-full"
                          placeholder="Enter value…"
                          value={row.value}
                          onChange={(e) => updateFilterRow(row.id, { value: e.target.value })}
                        />
                      )}
                    </div>
                    {/* Remove row */}
                    <button
                      onClick={() => removeFilterRow(row.id)}
                      className="shrink-0 text-slate-400 hover:text-red-500 p-0.5"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
            {/* Footer */}
            <div className="border-t px-3 py-2">
              <button
                onClick={addFilterRow}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                + Add Filter
              </button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {filterRows.filter((r) => r.value).map((row) => {
              const fieldDef = FILTER_FIELDS.find((f) => f.value === row.field);
              const fieldLabel = fieldDef?.label ?? row.field;
              const opLabels: Record<string, string> = {
                eq: "=", neq: "≠", contains: "~", starts_with: "^",
                lt: "<", gt: ">", lte: "≤", gte: "≥",
              };
              const opLabel = opLabels[row.operator] ?? row.operator;
              const valLabel = fieldDef?.options?.find((o) => o.v === row.value)?.l ?? row.value;
              return (
                <Badge
                  key={row.id}
                  variant="secondary"
                  className="gap-1 pr-1 text-xs cursor-pointer"
                  onClick={() => removeFilterRow(row.id)}
                >
                  {fieldLabel} {opLabel} {valLabel}
                  <X className="h-2.5 w-2.5" />
                </Badge>
              );
            })}
          </div>
        )}

        <ColumnSelector columns={CLIENT_COLUMNS} visible={cols} onToggle={toggleCol} />

        {/* Bulk Actions */}
        {selectedCount > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5 ml-auto">
                Actions ({selectedCount})
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs text-slate-400 font-normal">{selectedCount} selected</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <button className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-slate-50 rounded" onClick={() => setBulkTagOpen(true)}>
                <Tag className="h-3.5 w-3.5 text-slate-400" />
                Add / Remove Tags
              </button>
              <button className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-slate-50 rounded" onClick={() => setBulkEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5 text-slate-400" />
                Bulk Edit Field
              </button>
              <DropdownMenuSeparator />
              <button
                className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-slate-50 rounded text-green-700"
                onClick={async () => {
                  try {
                    await bulkActivate(selectedClientIds);
                    toast.success(`${selectedCount} client${selectedCount !== 1 ? "s" : ""} activated`);
                    clearSelection();
                  } catch { toast.error("Failed to activate"); }
                }}
              >
                <CheckCircle className="h-3.5 w-3.5" />
                Activate Clients
              </button>
              <button className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-slate-50 rounded text-red-600" onClick={() => setBulkCancelOpen(true)}>
                <Ban className="h-3.5 w-3.5" />
                Cancel Clients
              </button>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="ml-auto text-sm text-slate-400">
            {isLoading ? "…" : `${filtered.length} client${filtered.length !== 1 ? "s" : ""}`}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-3 py-3">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                  className={cn(someSelected && "opacity-70")}
                />
              </th>
              <th className="px-4 py-3">Name</th>
              {cols.tags && <th className="px-4 py-3">Tags</th>}
              {cols.type && <th className="px-4 py-3">Type</th>}
              {cols.status && <th className="px-4 py-3">Status</th>}
              {cols.phone && <th className="px-4 py-3">Phone</th>}
              {cols.email && <th className="px-4 py-3">Email</th>}
              {cols.city && <th className="px-4 py-3">City</th>}
              {cols.zip && <th className="px-4 py-3">Zip</th>}
              {cols.balance && <th className="px-4 py-3 text-right">Balance</th>}
              {cols.source && <th className="px-4 py-3">Source</th>}
              {cols.clientSince && <th className="px-4 py-3">Client Since</th>}
              {cols.accountNumber && <th className="px-4 py-3">Account #</th>}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: visibleColumnCount }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={visibleColumnCount} className="py-16 text-center text-sm text-slate-400">
                  {search || activeFilterCount > 0 ? "No clients match your filters" : "No clients yet"}
                </td>
              </tr>
            ) : (
              filtered.map((client) => {
                const isChecked = selectedIds.has(client.id);
                const tags = client.tags ?? [];
                return (
                  <tr
                    key={client.id}
                    className={cn("group cursor-pointer border-b hover:bg-slate-50", isChecked && "bg-brand-50")}
                    onClick={() => onSelect?.(client)}
                  >
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={isChecked} onCheckedChange={() => toggleOne(client.id)} aria-label={`Select ${client.displayName}`} />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {client.accountType === "commercial"
                          ? <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          : <Home className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                        <span className="font-medium text-brand-600">{client.displayName}</span>
                        {client.doNotMarket && <span className="text-[9px] text-slate-400 border rounded px-1">DNM</span>}
                      </div>
                    </td>
                    {cols.tags && (
                      <td className="px-4 py-2.5">
                        {tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {tags.map((tag) => (
                              <span key={tag} className="rounded-full px-1.5 py-0 text-[10px] font-medium bg-slate-100 text-slate-500">
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                    )}
                    {cols.type && (
                      <td className="px-4 py-2.5">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", ACCOUNT_TYPE_COLOR[client.accountType] ?? "bg-slate-100 text-slate-500")}>
                          {client.accountType}
                        </span>
                      </td>
                    )}
                    {cols.status && (
                      <td className="px-4 py-2.5">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", STATUS_COLOR[client.status] ?? "bg-slate-100 text-slate-500")}>
                          {client.status}
                        </span>
                      </td>
                    )}
                    {cols.phone && <td className="px-4 py-2.5 text-slate-600">{client.primaryPhone ?? "—"}</td>}
                    {cols.email && <td className="px-4 py-2.5 text-slate-600">{client.primaryEmail ?? "—"}</td>}
                    {cols.city && (
                      <td className="px-4 py-2.5 text-slate-500">
                        {[client.serviceAddress, client.serviceCity, client.serviceState].filter(Boolean).join(", ") || "—"}
                      </td>
                    )}
                    {cols.zip && <td className="px-4 py-2.5 text-slate-500">{client.serviceZip || client.billingZip || "—"}</td>}
                    {cols.balance && (
                      <td className="px-4 py-2.5 text-right">
                        {client.balanceOutstandingCents > 0
                          ? <span className="font-semibold text-red-600">{formatCurrency(client.balanceOutstandingCents)}</span>
                          : <span className="text-slate-400">—</span>}
                      </td>
                    )}
                    {cols.source && <td className="px-4 py-2.5 text-slate-500">{client.source ?? "—"}</td>}
                    {cols.clientSince && (
                      <td className="px-4 py-2.5 text-xs text-slate-400">
                        {client.clientSince
                          ? new Date(client.clientSince + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                          : "—"}
                      </td>
                    )}
                    {cols.accountNumber && <td className="px-4 py-2.5 text-slate-500">{client.accountNumber ?? "—"}</td>}
                    <td className="px-4 py-2.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/crm/clients/${client.id}`); }}
                        className="opacity-0 group-hover:opacity-100 rounded p-1 hover:bg-slate-200 transition-opacity"
                        title="Open full screen"
                      >
                        <Maximize2 className="h-3.5 w-3.5 text-slate-400" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <BulkTagDialog
        open={bulkTagOpen}
        onOpenChange={(o) => { setBulkTagOpen(o); if (!o) clearSelection(); }}
        clientIds={selectedClientIds}
      />
      <BulkCancelDialog
        open={bulkCancelOpen}
        onOpenChange={setBulkCancelOpen}
        count={selectedCount}
        onConfirm={async (reason) => {
          await bulkCancel({ clientIds: selectedClientIds, reason });
          toast.success(`${selectedCount} client${selectedCount !== 1 ? "s" : ""} cancelled`);
          clearSelection();
        }}
      />
      <BulkEditDialog
        open={bulkEditOpen}
        onOpenChange={(o) => { setBulkEditOpen(o); if (!o) clearSelection(); }}
        count={selectedCount}
        onConfirm={async (patch) => {
          await bulkUpdate({ clientIds: selectedClientIds, patch });
          toast.success(`${selectedCount} client${selectedCount !== 1 ? "s" : ""} updated`);
          clearSelection();
        }}
      />
    </div>
  );
}
