"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClients } from "@/lib/hooks/use-clients";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Building2, Home, Maximize2 } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { Client } from "@/types/crm";

const STATUS_COLOR: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  inactive: "bg-slate-100 text-slate-500",
  lead: "bg-yellow-100 text-yellow-700",
  cancelled: "bg-red-100 text-red-600",
};

interface Props {
  selectedId: string | null;
  onSelect: (client: Client) => void;
}

export function ClientList({ selectedId, onSelect }: Props) {
  const { data: clients, isLoading } = useClients();
  const [search, setSearch] = useState("");
  const router = useRouter();

  const filtered = (clients ?? []).filter((c) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      c.displayName.toLowerCase().includes(q) ||
      (c.primaryEmail ?? "").toLowerCase().includes(q) ||
      (c.primaryPhone ?? "").includes(q) ||
      (c.billingCity ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="border-b p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-8 text-sm"
            placeholder="Search clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
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
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-400">
            No clients found
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((client) => {
              const isSelected = client.id === selectedId;
              const hasBalance = client.balanceOutstandingCents > 0;
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
                      {client.accountType === "commercial" ? (
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      ) : (
                        <Home className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      )}
                      <span className="truncate text-sm font-medium text-slate-900">
                        {client.displayName}
                      </span>
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
                      {[client.billingCity, client.billingState].filter(Boolean).join(", ") ||
                        client.primaryPhone ||
                        client.primaryEmail ||
                        "—"}
                    </span>
                    <Badge
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-0 text-[10px] capitalize",
                        STATUS_COLOR[client.status] ?? "bg-slate-100 text-slate-500"
                      )}
                    >
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
