"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { useClientsPage } from "@/lib/hooks/use-clients";
import { useClientFilterFields } from "@/lib/hooks/use-client-filter-fields";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useLoadMoreSentinel } from "@/lib/hooks/use-load-more-sentinel";
import { ClientFilterPopover } from "@/components/crm/shared/ClientFilterPopover";
import { parseMultiValue, type FilterRow } from "@/lib/client-filters";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/shared/SearchInput";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Home, Maximize2, X } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { Client } from "@/types/crm";

const STATUS_COLOR: Record<string, string> = {
  active:    "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400",
  inactive:  "bg-muted text-muted-foreground",
  lead:      "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400",
  cancelled: "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400",
  lost:      "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400",
};

interface Props {
  selectedId: string | null;
  onSelect: (client: Client) => void;
  /** Search + filter state is owned by the page so it survives switching to
   *  the table view and drives CSV export. */
  search: string;
  onSearchChange: (search: string) => void;
  filterRows: FilterRow[];
  onFilterRowsChange: Dispatch<SetStateAction<FilterRow[]>>;
}

export function ClientList({
  selectedId, onSelect, search, onSearchChange: setSearch, filterRows, onFilterRowsChange: setFilterRows,
}: Props) {
  const { fields: FILTER_FIELDS } = useClientFilterFields();
  const router = useRouter();

  const activeFilterCount = filterRows.filter((r) => r.value !== "").length;

  // Search, filters and paging all run server-side (crm_search_clients).
  const debouncedSearch = useDebouncedValue(search);
  // Filter text/number inputs update on every keystroke; debounce them like the search box.
  const debouncedFilters = useDebouncedValue(filterRows);
  const { data, isPending, isFetching, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useClientsPage({ search: debouncedSearch, filters: debouncedFilters });
  const isLoading = isPending;
  const filtered = useMemo(() => data?.pages.flatMap((p) => p.clients) ?? [], [data]);
  const total = data?.pages[0]?.total ?? filtered.length;
  const sentinelRef = useLoadMoreSentinel({ hasNextPage, isFetchingNextPage, fetchNextPage });

  return (
    <div className="flex h-full flex-col">
      {/* Search + filter */}
      <div className="border-b p-3 space-y-2">
        <div className="flex items-center gap-2">
          <SearchInput
            className="flex-1"
            inputClassName="text-sm"
            placeholder="Search clients…"
            value={search}
            onChange={setSearch}
          />
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
            <button onClick={() => setFilterRows([])} className="text-xs text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-400 underline">Clear</button>
          </div>
        )}
      </div>

      {/* Count */}
      <div className="border-b px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {isLoading ? "Loading…" : `${total.toLocaleString()} client${total !== 1 ? "s" : ""}`}
          {isFetching && !isLoading && !isFetchingNextPage && <span className="ml-1.5 text-slate-400 dark:text-neutral-500">· Updating…</span>}
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-px p-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-400 dark:text-neutral-500">No clients found</div>
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
                      ? "bg-brand-50 dark:bg-brand-900/30 border-l-2 border-l-brand-500"
                      : "hover:bg-slate-50 dark:hover:bg-muted/40 border-l-2 border-l-transparent"
                  )}
                  onClick={() => onSelect(client)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {client.accountType === "commercial"
                        ? <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-neutral-500" />
                        : <Home className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-neutral-500" />}
                      <span className="truncate text-sm font-medium text-slate-900 dark:text-neutral-100">{client.displayName}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {hasBalance && (
                        <span className="shrink-0 text-xs font-semibold text-red-600 dark:text-red-400">
                          {formatCurrency(client.balanceOutstandingCents)}
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/crm/clients/${client.id}`); }}
                        className="opacity-0 group-hover:opacity-100 rounded p-0.5 hover:bg-slate-200 dark:hover:bg-neutral-700 transition-opacity"
                        title="Open full screen"
                      >
                        <Maximize2 className="h-3 w-3 text-slate-400 dark:text-neutral-500" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground">
                      {[client.serviceAddress, client.serviceCity, client.serviceState].filter(Boolean).join(", ") ||
                        client.primaryPhone || client.primaryEmail || "—"}
                    </span>
                    <Badge variant="outline" className={cn("shrink-0 rounded-full px-1.5 py-0 text-[10px] capitalize border-transparent", STATUS_COLOR[client.status] ?? "bg-muted text-muted-foreground")}>
                      {client.status}
                    </Badge>
                  </div>

                </div>
              );
            })}
            {hasNextPage && (
              <div ref={sentinelRef} className="flex justify-center p-3">
                <Button variant="ghost" size="sm" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
                  {isFetchingNextPage ? "Loading…" : `Load more (${(total - filtered.length).toLocaleString()} left)`}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
