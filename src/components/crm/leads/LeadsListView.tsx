"use client";

import { useState } from "react";
import { useLeads } from "@/lib/hooks/use-clients";
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
  Referral:    "bg-green-100 text-green-700",
  Google:      "bg-blue-100 text-blue-700",
  Facebook:    "bg-indigo-100 text-indigo-700",
  "Door Hanger": "bg-orange-100 text-orange-700",
  "Yard Sign": "bg-amber-100 text-amber-700",
};

function LeadItem({ lead, isSelected, onSelect }: { lead: Client; isSelected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col gap-0.5 border-l-2 px-4 py-3 text-left transition-colors",
        isSelected
          ? "border-l-brand-500 bg-brand-50"
          : "border-l-transparent hover:bg-slate-50"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {lead.accountType === "commercial"
            ? <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            : <Home className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
          <span className="truncate text-sm font-medium text-slate-900">{lead.displayName}</span>
        </div>
        <LeadRevenuePotential leadId={lead.id} hideEmpty className="shrink-0 text-xs font-semibold" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-slate-500">
          {[lead.serviceAddress, lead.serviceCity, lead.serviceState].filter(Boolean).join(", ") ||
            lead.primaryPhone || lead.primaryEmail || "—"}
        </span>
        {lead.source && (
          <span className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
            SOURCE_COLOR[lead.source] ?? "bg-slate-100 text-slate-500"
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
}

export function LeadsListView({ selectedId, onSelect, onBack }: LeadsListViewProps = {}) {
  const { data: leads, isLoading } = useLeads();
  const [search, setSearch] = useState("");
  const [internalSelected, setInternalSelected] = useState<Client | null>(null);
  // Leads are shown in the same ClientDetailPanel as clients, which only
  // renders its expand-to-full-page button when handed onExpandChange. The
  // Clients page wires this up; without it the button was simply missing here.
  const [expanded, setExpanded] = useState(false);

  const controlled = selectedId !== undefined;
  const selected = controlled ? (leads ?? []).find((l) => l.id === selectedId) ?? null : internalSelected;
  function selectLead(lead: Client) {
    // Picking a different lead collapses back to the split view, as on Clients
    // — otherwise the list stays hidden and there is no way back to it.
    setExpanded(false);
    if (onSelect) onSelect(lead);
    else setInternalSelected(lead);
  }

  const filtered = (leads ?? []).filter((l) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      l.displayName.toLowerCase().includes(q) ||
      (l.primaryPhone ?? "").includes(q) ||
      (l.primaryEmail ?? "").toLowerCase().includes(q) ||
      (l.billingCity ?? "").toLowerCase().includes(q)
    );
  });

  const listPanel = (
    <div className="flex h-full flex-col">
      <div className="border-b p-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search leads…"
          inputClassName="text-sm"
        />
      </div>
      <div className="border-b px-3 py-2">
        <span className="text-xs text-slate-500">
          {isLoading ? "Loading…" : `${filtered.length} lead${filtered.length !== 1 ? "s" : ""}`}
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
          <div className="flex h-32 items-center justify-center text-sm text-slate-400">No leads found</div>
        ) : (
          <div className="divide-y">
            {filtered.map((lead) => (
              <LeadItem
                key={lead.id}
                lead={lead}
                isSelected={selected?.id === lead.id}
                onSelect={() => selectLead(lead)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <MasterDetailLayout
      hasSelection={!!selected}
      expanded={expanded}
      onBack={() => {
        setExpanded(false);
        if (controlled) onBack?.();
        else setInternalSelected(null);
      }}
      listPanel={listPanel}
      detailPanel={
        selected ? (
          <ClientDetailPanel clientId={selected.id} expanded={expanded} onExpandChange={setExpanded} />
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
