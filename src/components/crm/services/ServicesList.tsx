"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { useAllCRMServices, useDeleteCRMService, useBulkImportCRMServices } from "@/lib/hooks/use-crm-jobs";
import type { CRMService } from "@/types/crm-jobs";
import { formatCurrency } from "@/lib/utils";
import { ImportExportMenu } from "@/components/shared/ImportExportMenu";
import { exportCSV } from "@/lib/csv";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { toast } from "sonner";

const SERVICE_TEMPLATE_COLUMNS = [
  "name", "code", "category", "unit", "defaultRate", "productionRate", "isActive",
];

const MODE_LABEL: Record<string, string> = {
  flat_rate: "Flat Rate",
  hourly: "Hourly",
  per_unit: "Per Unit",
};

type Tab = "active" | "inactive" | "all";

// Groups services so each parent is immediately followed by its children
// (sorted by name), instead of an unrelated flat alphabetical list.
function groupServices(list: CRMService[]): { service: CRMService; depth: number }[] {
  const idSet = new Set(list.map((s) => s.id));
  const byParent = new Map<string, CRMService[]>();
  for (const s of list) {
    const key = s.parentServiceId && idSet.has(s.parentServiceId) ? s.parentServiceId : "__root__";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(s);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.name.localeCompare(b.name));

  const result: { service: CRMService; depth: number }[] = [];
  function walk(key: string, depth: number) {
    for (const s of byParent.get(key) ?? []) {
      result.push({ service: s, depth });
      walk(s.id, depth + 1);
    }
  }
  walk("__root__", 0);
  return result;
}

interface Props {
  onAdd: () => void;
  onEdit: (service: CRMService) => void;
}

export function ServicesList({ onAdd, onEdit }: Props) {
  const { can } = usePermissions();
  const canAdd = can("service_add");
  const canEdit = can("service_edit");
  const canDelete = can("service_delete");
  const { data: services = [], isLoading } = useAllCRMServices();
  const deleteService = useDeleteCRMService();
  const { mutateAsync: bulkImportServices } = useBulkImportCRMServices();
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
    deleteService.mutate(s.id, {
      onError: () => toast.error(`Failed to delete "${s.name}"`),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 gap-y-2">
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
        <div className="ml-auto flex items-center gap-2">
          <ImportExportMenu
            entityLabel="Services"
            templateColumns={SERVICE_TEMPLATE_COLUMNS}
            templateFilename="services-template.csv"
            requiredColumns={["name"]}
            onExport={() =>
              exportCSV(
                services.map((s) => ({
                  name: s.name,
                  code: s.code ?? "",
                  category: s.category,
                  unit: s.unit,
                  defaultRate: s.defaultRateCents != null ? (s.defaultRateCents / 100).toFixed(2) : "",
                  productionRate: s.productionRateSqftPerHr != null ? String(s.productionRateSqftPerHr) : "",
                  isActive: s.isActive ? "yes" : "no",
                })),
                "services-export.csv"
              )
            }
            onImport={async (rows) => {
              const { created, updated, skipped } = await bulkImportServices(rows);
              const parts = [`${created} created`];
              if (updated > 0) parts.push(`${updated} updated`);
              if (skipped > 0) parts.push(`${skipped} skipped (missing name)`);
              toast[skipped > 0 ? "warning" : "success"](`Services import: ${parts.join(", ")}.`);
            }}
          />
          {canAdd && (
            <Button size="sm" onClick={onAdd}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Service
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-white shadow-sm overflow-x-auto">
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
            {groupServices(filtered).map(({ service: s, depth }) => (
              <tr
                key={s.id}
                className={`border-b last:border-0 hover:bg-slate-50 ${canEdit ? "cursor-pointer" : ""}`}
                onClick={canEdit ? () => onEdit(s) : undefined}
              >
                <td className="px-4 py-3 font-medium text-slate-800">
                  <span style={depth > 0 ? { paddingLeft: depth * 20 } : undefined} className="inline-flex items-center gap-1.5">
                    {depth > 0 && <span className="text-slate-300">↳</span>}
                    <span className={depth > 0 ? "font-normal text-slate-600" : undefined}>{s.name}</span>
                  </span>
                </td>
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
                    {canEdit && (
                      <button
                        onClick={() => onEdit(s)}
                        className="rounded p-1 hover:bg-slate-100"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5 text-slate-400" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(s)}
                        className="rounded p-1 hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </button>
                    )}
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
