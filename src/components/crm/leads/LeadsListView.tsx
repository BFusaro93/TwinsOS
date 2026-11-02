"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { leadQueryParams, useClientsPage } from "@/lib/hooks/use-clients";
import { useLeadFilterFields } from "@/lib/hooks/use-lead-filter-fields";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useLoadMoreSentinel } from "@/lib/hooks/use-load-more-sentinel";
import { ClientFilterPopover } from "@/components/crm/shared/ClientFilterPopover";
import { Button } from "@/components/ui/button";
import type { FilterRow } from "@/lib/client-filters";
import { Skeleton } from "@/components/ui/skeleton";
import { UserPlus, Building2, Home } from "lucide-react";
import { MasterDetailLayout } from "@/components/shared/MasterDetailLayout";
import { EmptyState } from "@/components/shared/EmptyState";
import { ClientDetailPanel } from "@/components/crm/ClientDetailPanel";
import { LeadRevenuePotential } from "@/components/crm/leads/LeadsList";
import { cn } from "@/lib/utils";
import type { Client } from "@/types/crm";
import { SearchInput } from "@/components/shared/SearchInput";

const SOURCE_COLOR: Record<string, string> = {
  Referral:    "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400",
  Google:      "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400",
  Facebook:    "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400",
  "Door Hanger": "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400",
  "Yard Sign": "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400",
};

function LeadItem({ lead, isSelected, onSelect }: { lead: Client; isSelected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col gap-0.5 border-l-2 px-4 py-3 text-left transition-colors",
        isSelected
          ? "border-l-brand-500 bg-brand-50 dark:bg-brand-900/30"
          : "border-l-transparent hover:bg-slate-50 dark:hover:bg-muted/40"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {lead.accountType === "commercial"
            ? <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-neutral-500" />
            : <Home className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-neutral-500" />}
          <span className="truncate text-sm font-medium text-slate-900 dark:text-neutral-100">{lead.displayName}</span>
        </div>
        <LeadRevenuePotential leadId={lead.id} hideEmpty className="shrink-0 text-xs font-semibold" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">
          {[lead.serviceAddress, lead.serviceCity, lead.serviceState].filter(Boolean).join(", ") ||
            lead.primaryPhone || lead.primaryEmail || "—"}
        </span>
        {lead.source && (
          <span className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
            SOURCE_COLOR[lead.source] ?? "bg-muted text-muted-foreground"
          )}>
            {lead.source}
          </span>
        )}
      </div>
    </button>
  );
}

interface LeadsListViewProps {
  selectedId?: string | null;
  onSelect?: (lead: Client) => void;
  onBack?: () => void;
  /** Shared with the table view (owned by the page). */
  search: string;
  onSearchChange: (search: string) => void;
  filterRows: FilterRow[];
  onFilterRowsChange: Dispatch<SetStateAction<FilterRow[]>>;
}

export function LeadsListView({
  selectedId, onSelect, onBack,
  search, onSearchChange: setSearch, filterRows, onFilterRowsChange: setFilterRows,
}: LeadsListViewProps) {
  const { fields: FILTER_FIELDS } = useLeadFilterFields();
  // Search, filters and paging run server-side, 100 leads at a time.
  const debouncedSearch = useDebouncedValue(search);
  const { data, isPending: isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useClientsPage(
    leadQueryParams({ search: debouncedSearch, filters: filterRows }),
  );
  const filtered = useMemo(() => data?.pages.flatMap((p) => p.clients) ?? [], [data]);
  const total = data?.pages[0]?.total ?? filtered.length;
  const sentinelRef = useLoadMoreSentinel({ hasNextPage, isFetchingNextPage, fetchNextPage });
  const [internalSelected, setInternalSelected] = useState<Client | null>(null);
  // Leads are shown in the same ClientDetailPanel as clients, which only
  // renders its expand-to-full-page button when handed onExpandChange. The
  // Clients page wires this up; without it the button was simply missing here.
  const [expanded, setExpanded] = useState(false);

  const controlled = selectedId !== undefined;
  // Only the id matters here (the detail panel loads its own record), so a
  // lead picked in the table view still opens even if it isn't loaded below.
  const selectedLeadId = controlled ? selectedId : internalSelected?.id ?? null;
  function selectLead(lead: Client) {
    // Picking a different lead collapses back to the split view, as on Clients
    // — otherwise the list stays hidden and there is no way back to it.
    setExpanded(false);
    if (onSelect) onSelect(lead);
    else setInternalSelected(lead);
  }

  const listPanel = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b p-3">
        <SearchInput
          className="flex-1"
          value={search}
          onChange={setSearch}
          placeholder="Search leads…"
          inputClassName="text-sm"
        />
        <ClientFilterPopover fields={FILTER_FIELDS} rows={filterRows} onRowsChange={setFilterRows} />
      </div>
      <div className="border-b px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {isLoading ? "Loading…" : `${total.toLocaleString()} lead${total !== 1 ? "s" : ""}`}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-px p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-400 dark:text-neutral-500">No leads found</div>
        ) : (
          <div className="divide-y">
            {filtered.map((lead) => (
              <LeadItem
                key={lead.id}
                lead={lead}
                isSelected={selectedLeadId === lead.id}
                onSelect={() => selectLead(lead)}
              />
            ))}
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

  return (
    <MasterDetailLayout
      hasSelection={!!selectedLeadId}
      expanded={expanded}
      onBack={() => {
        setExpanded(false);
        if (controlled) onBack?.();
        else setInternalSelected(null);
      }}
      listPanel={listPanel}
      detailPanel={
        selectedLeadId ? (
          <ClientDetailPanel clientId={selectedLeadId} expanded={expanded} onExpandChange={setExpanded} />
        ) : null
      }
      emptyState={
        <EmptyState
          icon={UserPlus}
          title="Select a lead"
          description="Choose a lead from the list to view their profile and activity."
        />
      }
    />
  );
}
