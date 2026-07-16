"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { usePackages, useDeletePackage } from "@/lib/hooks/use-packages";
import { formatCurrency } from "@/lib/utils";
import type { CRMPackage } from "@/types/crm-packages";

interface Props {
  onAdd: () => void;
  onEdit: (pkg: CRMPackage) => void;
}

export function PackagesList({ onAdd, onEdit }: Props) {
  const { data: packages = [], isLoading } = usePackages(true);
  const deletePackage = useDeletePackage();
  const [tab, setTab] = useState<"active" | "inactive" | "all">("active");
  const [search, setSearch] = useState("");

  const filtered = packages.filter((p) => {
    if (tab === "active" && !p.isActive) return false;
    if (tab === "inactive" && p.isActive) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input placeholder="Search packages…" value={search}
            onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <div className="flex rounded-md border overflow-hidden text-xs">
          {(["active", "inactive", "all"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 capitalize transition-colors ${
                tab === t ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
              }`}>{t}</button>
          ))}
        </div>
        <Button size="sm" onClick={onAdd} className="ml-auto">
          <Plus className="mr-1.5 h-4 w-4" /> New Package
        </Button>
      </div>

      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left">Package</th>
              <th className="px-4 py-3 text-left">Code</th>
              <th className="px-4 py-3 text-right">Monthly</th>
              <th className="px-4 py-3 text-center">Season</th>
              <th className="px-4 py-3 text-center">Visits</th>
              <th className="px-4 py-3 text-left">Services</th>
              <th className="px-4 py-3 text-center">Active</th>
              <th className="px-4 py-3 w-20" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No packages found.</td></tr>
            )}
            {filtered.map((pkg) => (
              <tr key={pkg.id} onClick={() => onEdit(pkg)}
                className="border-b last:border-0 hover:bg-slate-50 cursor-pointer">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{pkg.name}</p>
                  {pkg.description && (
                    <p className="text-xs text-slate-400 truncate max-w-xs mt-0.5">{pkg.description}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">{pkg.code ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  {formatCurrency(pkg.monthlyAmountCents)}
                </td>
                <td className="px-4 py-3 text-center text-slate-600">{pkg.seasonMonths} mo</td>
                <td className="px-4 py-3 text-center text-slate-600">{(pkg.services ?? []).length}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {(pkg.services ?? []).length > 0
                    ? (pkg.services ?? []).map((s) => s.serviceName).join(", ")
                    : <span className="italic text-slate-400">None</span>
                  }
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={pkg.isActive ? "default" : "secondary"} className="text-[10px]">
                    {pkg.isActive ? "Yes" : "No"}
                  </Badge>
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => onEdit(pkg)} className="rounded p-1 hover:bg-slate-100" title="Edit">
                      <Pencil className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete "${pkg.name}"?`)) deletePackage.mutate(pkg.id); }}
                      className="rounded p-1 hover:bg-red-50" title="Delete">
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
