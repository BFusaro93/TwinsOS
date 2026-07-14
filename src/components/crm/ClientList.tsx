"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useClients, useOrgTags } from "@/lib/hooks/use-clients";
import { useCRMServices } from "@/lib/hooks/use-crm-jobs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Building2, Home, Maximize2, SlidersHorizontal, X } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { Client } from "@/types/crm";

const STATUS_COLOR: Record<string, string> = {
  active:    "bg-green-100 text-green-700",
  inactive:  "bg-slate-100 text-slate-500",
  lead:      "bg-yellow-100 text-yellow-700",
  cancelled: "bg-red-100 text-red-600",
};

// ── Filter query builder types ─────────────────────────────────────────────────

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
    case "text":  return "contains";
    case "number":
    case "date":  return "lt";
    default:      return "eq";
  }
}

interface Props {
  selectedId: string | null;
  onSelect: (client: Client) => void;
}

export function ClientList({ selectedId, onSelect }: Props) {
  const { data: clients, isLoading } = useClients();
  const orgTags = useOrgTags();
  const { data: crmServices = [] } = useCRMServices();
  const [search, setSearch] = useState("");
  const [filterRows, setFilterRows] = useState<FilterRow[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [fieldSearch, setFieldSearch] = useState("");
  const router = useRouter();

  const uniqueSources = useMemo(() =>
    Array.from(new Set((clients ?? []).map((c) => c.source).filter(Boolean) as string[])).sort(),
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
    { value: "status",         label: "Status",            type: "select",
      options: [{ v: "active", l: "Active" }, { v: "lead", l: "Lead" }, { v: "inactive", l: "Inactive" }, { v: "cancelled", l: "Cancelled" }] },
    { value: "account_type",   label: "Account Type",      type: "select",
      options: [{ v: "residential", l: "Residential" }, { v: "commercial", l: "Commercial" }] },
    { value: "balance",        label: "Balance",           type: "number" },
    { value: "city",           label: "City",              type: "text" },
    { value: "service_city",   label: "Service City",      type: "text" },
    { value: "source",         label: "Client Source",     type: "select",
      options: uniqueSources.map((s) => ({ v: s, l: s })) },
    { value: "sales_rep",      label: "Sales Rep",         type: "select",
      options: uniqueSalesReps.map((r) => ({ v: r.id, l: r.name })) },
    { value: "priority",       label: "Priority",          type: "select",
      options: [{ v: "low", l: "Low" }, { v: "normal", l: "Normal" }, { v: "high", l: "High" }] },
    { value: "client_since",   label: "Client Since Date", type: "date" },
    { value: "tags",           label: "Tags",              type: "select",
      options: orgTags.map((t) => ({ v: t, l: t })) },
    { value: "active_service", label: "Active Service",    type: "select",
      options: serviceNames.map((n) => ({ v: n, l: n })) },
    { value: "referred_by",    label: "Referred By",       type: "boolean" },
    { value: "do_not_market",  label: "Do Not Market",     type: "boolean" },
    { value: "taxable",        label: "Taxable",           type: "boolean" },
    { value: "ok_to_email",    label: "OK to Email",       type: "boolean" },
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
  function clearAll() { setFilterRows([]); }

  const activeFilterCount = filterRows.filter((r) => r.value !== "").length;

  const filtered = useMemo(() => {
    return (clients ?? []).filter((c) => {
      const q = search.toLowerCase();
      if (q && !(
        c.displayName.toLowerCase().includes(q) ||
        (c.primaryEmail ?? "").toLowerCase().includes(q) ||
        (c.primaryPhone ?? "").includes(q) ||
        (c.billingCity ?? "").toLowerCase().includes(q) ||
        (c.tags ?? []).some((t) => t.toLowerCase().includes(q))
      )) return false;

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
            if (op === "contains"    && !city.includes(val))   return false;
            if (op === "starts_with" && !city.startsWith(val)) return false;
            if (op === "eq"          && city !== val)          return false;
            break;
          }
          case "service_city": {
            const city = (c.serviceCity ?? "").toLowerCase();
            const val = row.value.toLowerCase();
            if (op === "contains"    && !city.includes(val))   return false;
            if (op === "starts_with" && !city.startsWith(val)) return false;
            if (op === "eq"          && city !== val)          return false;
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
            if (op === "eq"  && cDate !== val) return false;
            if (op === "lt"  && cDate >= val)  return false;
            if (op === "gt"  && cDate <= val)  return false;
            if (op === "lte" && cDate > val)   return false;
            if (op === "gte" && cDate < val)   return false;
            break;
          }
          case "tags":
            if (op === "eq"  && !(c.tags ?? []).includes(row.value)) return false;
            if (op === "neq" && (c.tags ?? []).includes(row.value))  return false;
            break;
          case "active_service":
            break;
          case "referred_by":
            if (op === "eq" && row.value === "yes" && !c.referredBy)  return false;
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
  }, [clients, search, filterRows]);

  return (
    <div className="flex h-full flex-col">
      {/* Search + filter */}
      <div className="border-b p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-8 text-sm"
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
                className={cn("h-9 gap-1.5 shrink-0", activeFilterCount > 0 && "border-brand-500 text-brand-600")}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge className="ml-0.5 h-4 min-w-4 rounded-full px-1 text-[10px]">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[540px] p-0">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 border-b bg-[#4a4a4a] rounded-t-md">
                <span className="text-sm font-semibold text-white">Filters</span>
                {filterRows.length > 0 && (
                  <button onClick={clearAll} className="text-xs text-white/70 hover:text-white underline">
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
                      <Select
                        value={row.field}
                        onValueChange={(v) => {
                          const def = FILTER_FIELDS.find((f) => f.value === v) ?? FILTER_FIELDS[0];
                          updateFilterRow(row.id, { field: v, operator: defaultOperator(def.type), value: "" });
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs w-44 shrink-0">
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
                            <SelectTrigger className="h-7 text-xs w-full"><SelectValue placeholder="Select…" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="yes" className="text-xs">Yes</SelectItem>
                              <SelectItem value="no"  className="text-xs">No</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : fieldDef.type === "select" && fieldDef.options && fieldDef.options.length > 0 ? (
                          <Select value={row.value} onValueChange={(v) => updateFilterRow(row.id, { value: v })}>
                            <SelectTrigger className="h-7 text-xs w-full"><SelectValue placeholder="Select…" /></SelectTrigger>
                            <SelectContent className="max-h-48">
                              {fieldDef.options.map((opt) => (
                                <SelectItem key={opt.v} value={opt.v} className="text-xs">{opt.l}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : fieldDef.type === "date" ? (
                          <Input type="date" className="h-7 text-xs w-full" value={row.value}
                            onChange={(e) => updateFilterRow(row.id, { value: e.target.value })} />
                        ) : fieldDef.type === "number" ? (
                          <Input type="number" className="h-7 text-xs w-full" placeholder="0.00" value={row.value}
                            onChange={(e) => updateFilterRow(row.id, { value: e.target.value })} />
                        ) : (
                          <Input className="h-7 text-xs w-full" placeholder="Enter value…" value={row.value}
                            onChange={(e) => updateFilterRow(row.id, { value: e.target.value })} />
                        )}
                      </div>
                      <button onClick={() => removeFilterRow(row.id)} className="shrink-0 text-slate-400 hover:text-red-500 p-0.5">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
              {/* Footer */}
              <div className="border-t px-3 py-2">
                <button onClick={addFilterRow} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                  + Add Filter
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {filterRows.filter((r) => r.value).map((row) => {
              const fieldDef = FILTER_FIELDS.find((f) => f.value === row.field);
              const fieldLabel = fieldDef?.label ?? row.field;
              const opLabels: Record<string, string> = { eq: "=", neq: "≠", contains: "~", starts_with: "^", lt: "<", gt: ">", lte: "≤", gte: "≥" };
              const opLabel = opLabels[row.operator] ?? row.operator;
              const valLabel = fieldDef?.options?.find((o) => o.v === row.value)?.l ?? row.value;
              return (
                <Badge key={row.id} variant="secondary" className="gap-1 pr-1 text-xs cursor-pointer" onClick={() => removeFilterRow(row.id)}>
                  {fieldLabel} {opLabel} {valLabel}<X className="h-2.5 w-2.5" />
                </Badge>
              );
            })}
            <button onClick={clearAll} className="text-xs text-slate-400 hover:text-slate-600 underline">Clear</button>
          </div>
        )}
      </div>

      {/* Count */}
      <div className="border-b px-3 py-2">
        <span className="text-xs text-slate-500">
          {isLoading ? "Loading…" : `${filtered.length} client${filtered.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-px p-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-400">No clients found</div>
        ) : (
          <div className="divide-y">
            {filtered.map((client) => {
              const isSelected = client.id === selectedId;
              const hasBalance = client.balanceOutstandingCents > 0;
              const tags = client.tags ?? [];
              return (
                <div
                  key={client.id}
                  className={cn(
                    "group relative flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors cursor-pointer",
                    isSelected
                      ? "bg-brand-50 border-l-2 border-l-brand-500"
                      : "hover:bg-slate-50 border-l-2 border-l-transparent"
                  )}
                  onClick={() => onSelect(client)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {client.accountType === "commercial"
                        ? <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        : <Home className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                      <span className="truncate text-sm font-medium text-slate-900">{client.displayName}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {hasBalance && (
                        <span className="shrink-0 text-xs font-semibold text-red-600">
                          {formatCurrency(client.balanceOutstandingCents)}
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/crm/clients/${client.id}`); }}
                        className="opacity-0 group-hover:opacity-100 rounded p-0.5 hover:bg-slate-200 transition-opacity"
                        title="Open full screen"
                      >
                        <Maximize2 className="h-3 w-3 text-slate-400" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-slate-500">
                      {[client.serviceAddress, client.serviceCity, client.serviceState].filter(Boolean).join(", ") ||
                        client.primaryPhone || client.primaryEmail || "—"}
                    </span>
                    <Badge variant="outline" className={cn("shrink-0 rounded-full px-1.5 py-0 text-[10px] capitalize border-transparent", STATUS_COLOR[client.status] ?? "bg-slate-100 text-slate-500")}>
                      {client.status}
                    </Badge>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
