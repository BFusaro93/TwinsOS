"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClients } from "@/lib/hooks/use-clients";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Building2, Home, Maximize2 } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { Client } from "@/types/crm";

const STATUS_COLOR: Record<string, string> = {
  active:    "bg-green-100 text-green-700",
  inactive:  "bg-slate-100 text-slate-500",
  lead:      "bg-yellow-100 text-yellow-700",
  cancelled: "bg-red-100 text-red-600",
};

interface Props {
  onSelect?: (client: Client) => void;
}

export function ClientsTable({ onSelect }: Props) {
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
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            className="h-8 pl-8 text-sm"
            placeholder="Search clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="text-sm text-slate-400">
          {isLoading ? "…" : `${filtered.length} client${filtered.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      <div className="flex-1 overflow-auto rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center text-sm text-slate-400">
                  {search ? "No clients match your search" : "No clients yet"}
                </td>
              </tr>
            ) : (
              filtered.map((client) => (
                <tr
                  key={client.id}
                  className="group cursor-pointer border-b hover:bg-slate-50"
                  onClick={() => onSelect?.(client)}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {client.accountType === "commercial"
                        ? <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        : <Home className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                      <span className="font-medium text-slate-900">{client.displayName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 capitalize text-slate-500 text-xs">{client.accountType}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", STATUS_COLOR[client.status] ?? "bg-slate-100 text-slate-500")}>
                      {client.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{client.primaryPhone ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{client.primaryEmail ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {[client.billingCity, client.billingState].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {client.balanceOutstandingCents > 0
                      ? <span className="font-semibold text-red-600">{formatCurrency(client.balanceOutstandingCents)}</span>
                      : <span className="text-slate-400">—</span>}
                  </td>
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
