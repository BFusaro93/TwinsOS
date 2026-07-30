"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useClients } from "@/lib/hooks/use-clients";
import { useClientFilterFields } from "@/lib/hooks/use-client-filter-fields";
import { ClientFilterPopover } from "@/components/crm/shared/ClientFilterPopover";
import { matchesAllFilterRows, parseMultiValue, type FilterRow } from "@/lib/client-filters";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Building2, Home, Maximize2, X } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { Client } from "@/types/crm";

const STATUS_COLOR: Record<string, string> = {
  active:    "bg-green-100 text-green-700",
  inactive:  "bg-slate-100 text-slate-500",
  lead:      "bg-yellow-100 text-yellow-700",
  cancelled: "bg-red-100 text-red-600",
};

interface Props {
  selectedId: string | null;
  onSelect: (client: Client) => void;
}

export function ClientList({ selectedId, onSelect }: Props) {
  const { data: clients, isLoading } = useClients();
  const { fields: FILTER_FIELDS, ctx: filterCtx } = useClientFilterFields();
  const [search, setSearch] = useState("");
  const [filterRows, setFilterRows] = useState<FilterRow[]>([]);
  const router = useRouter();

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
      return matchesAllFilterRows(c, filterRows, filterCtx);
    });
  }, [clients, search, filterRows, filterCtx]);

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
          <ClientFilterPopover fields={FILTER_FIELDS} rows={filterRows} onRowsChange={setFilterRows} />
        </div>

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {filterRows.filter((r) => r.value).map((row) => {
              const fieldDef = FILTER_FIELDS.find((f) => f.value === row.field);
              const fieldLabel = fieldDef?.label ?? row.field;
              const opLabels: Record<string, string> = { eq: "=", neq: "≠", contains: "~", starts_with: "^", lt: "<", gt: ">", lte: "≤", gte: "≥" };
              const opLabel = opLabels[row.operator] ?? row.operator;
              const valLabel = fieldDef?.options
                ? parseMultiValue(row.value).map((v) => fieldDef.options!.find((o) => o.v === v)?.l ?? v).join(", ")
                : row.value;
              return (
                <Badge
                  key={row.id}
                  variant="secondary"
                  className="gap-1 pr-1 text-xs cursor-pointer"
                  onClick={() => setFilterRows((prev) => prev.filter((r) => r.id !== row.id))}
                >
                  {fieldLabel} {opLabel} {valLabel}<X className="h-2.5 w-2.5" />
                </Badge>
              );
            })}
            <button onClick={() => setFilterRows([])} className="text-xs text-slate-400 hover:text-slate-600 underline">Clear</button>
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
