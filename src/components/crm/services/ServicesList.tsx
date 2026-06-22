"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { useAllCRMServices, useDeleteCRMService } from "@/lib/hooks/use-crm-jobs";
import type { CRMService } from "@/types/crm-jobs";
import { formatCurrency } from "@/lib/utils";

const MODE_LABEL: Record<string, string> = {
  flat_rate: "Flat Rate",
  hourly: "Hourly",
  per_unit: "Per Unit",
};

type Tab = "active" | "inactive" | "all";

interface Props {
  onAdd: () => void;
  onEdit: (service: CRMService) => void;
}

export function ServicesList({ onAdd, onEdit }: Props) {
  const { data: services = [], isLoading } = useAllCRMServices();
  const deleteService = useDeleteCRMService();
  const [tab, setTab] = useState<Tab>("active");
  const [search, setSearch] = useState("");

  const filtered = services.filter((s) => {
    if (tab === "active" && !s.isActive) return false;
    if (tab === "inactive" && s.isActive) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) &&
        !(s.code ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function handleDelete(s: CRMService) {
    if (!confirm(`Delete "${s.name}"? This cannot be undone.`)) return;
    deleteService.mutate(s.id);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search services…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex rounded-md border overflow-hidden text-xs">
          {(["active", "inactive", "all"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 capitalize transition-colors ${
                tab === t
                  ? "bg-brand-600 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={onAdd} className="ml-auto">
          <Plus className="mr-1.5 h-4 w-4" />
          Add Service
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left">Service Type</th>
              <th className="px-4 py-3 text-left">Code</th>
              <th className="px-4 py-3 text-left">Svc Mode</th>
              <th className="px-4 py-3 text-right">Default Rate</th>
              <th className="px-4 py-3 text-right">Default B.Hrs</th>
              <th className="px-4 py-3 text-left">Unit</th>
              <th className="px-4 py-3 text-center">Active</th>
              <th className="px-4 py-3 text-center w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  No services found.
                </td>
              </tr>
            )}
            {filtered.map((s) => (
              <tr
                key={s.id}
                className="border-b last:border-0 hover:bg-slate-50 cursor-pointer"
                onClick={() => onEdit(s)}
              >
                <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                <td className="px-4 py-3 text-slate-500">{s.code ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">
                  {MODE_LABEL[s.serviceMode] ?? s.serviceMode}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {s.defaultRateCents != null ? formatCurrency(s.defaultRateCents) : "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {s.defaultBHrs > 0 ? s.defaultBHrs.toFixed(2) : "—"}
                </td>
                <td className="px-4 py-3 text-slate-500">{s.unit}</td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={s.isActive ? "default" : "secondary"} className="text-[10px]">
                    {s.isActive ? "Yes" : "No"}
                  </Badge>
                </td>
                <td
                  className="px-4 py-3 text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => onEdit(s)}
                      className="rounded p-1 hover:bg-slate-100"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                    <button
                      onClick={() => handleDelete(s)}
                      className="rounded p-1 hover:bg-red-50"
                      title="Delete"
                    >
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
