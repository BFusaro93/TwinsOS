"use client";

import { useState } from "react";
import { Search, MapPin, DollarSign } from "lucide-react";
import { useProjects } from "@/lib/hooks/use-projects";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { PhotoModuleGuard } from "@/modules/photo-docs/components/PhotoModuleGuard";
import { cn } from "@/lib/utils";
import type { ProjectStatus } from "@/types";

const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  sold: "Sold", scheduled: "Scheduled", in_progress: "In Progress",
  complete: "Complete", on_hold: "On Hold", canceled: "Canceled",
};

const STATUS_FILTERS: { label: string; value: ProjectStatus | "all" }[] = [
  { label: "All",         value: "all" },
  { label: "In Progress", value: "in_progress" },
  { label: "Scheduled",   value: "scheduled" },
  { label: "Sold",        value: "sold" },
  { label: "Complete",    value: "complete" },
  { label: "On Hold",     value: "on_hold" },
];

export default function PhotosProjectsPage() {
  const { data: projects = [], isLoading } = useProjects(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [showArchived, setShowArchived] = useState(false);

  const filtered = projects.filter((p) => {
    if (!showArchived && p.isArchived) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (!search) return true;
    return (
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.customerName.toLowerCase().includes(search.toLowerCase()) ||
      p.address.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <PhotoModuleGuard>
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Projects</h1>
          <p className="text-sm text-slate-500">Reference for cost-tracked jobs</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search projects…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {/* Status filter + archived toggle */}
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button key={f.value} onClick={() => setStatusFilter(f.value)}
              className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors",
                statusFilter === f.value ? "bg-brand-500 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
              {f.label}
            </button>
          ))}
          <button onClick={() => setShowArchived((v) => !v)}
            className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors ml-1",
              showArchived ? "bg-slate-500 text-white" : "border border-slate-200 bg-white text-slate-500 hover:border-slate-300")}>
            {showArchived ? "Hide Archived" : "Show Archived"}
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 py-12 text-sm text-slate-400">
            No projects found
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((p) => (
              <div key={p.id} className={cn("rounded-xl border bg-white p-4 shadow-sm", p.isArchived ? "border-slate-200 opacity-70" : "border-slate-200")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{p.name}</p>
                      <StatusBadge
                        variant={p.status === "on_hold" ? "on_hold_project" : p.status}
                        label={PROJECT_STATUS_LABELS[p.status]}
                      />
                      {p.isArchived && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Archived</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">{p.customerName}</p>
                    {p.address && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                        <MapPin className="h-3 w-3" /><span className="truncate">{p.address}</span>
                      </div>
                    )}
                    {p.notes && <p className="mt-1 text-xs text-slate-400 line-clamp-2">{p.notes}</p>}
                  </div>
                  {p.contractPrice > 0 && (
                    <div className="shrink-0 text-right">
                      <div className="flex items-center gap-1 text-sm font-semibold text-slate-700">
                        <DollarSign className="h-3.5 w-3.5 text-slate-400" />
                        {formatCurrency(p.contractPrice)}
                      </div>
                      <p className="text-xs text-slate-400">Contract</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PhotoModuleGuard>
  );
}
