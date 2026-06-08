"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, MapPin, Search } from "lucide-react";
import { useProjects } from "@/lib/hooks/use-projects";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { PhotoModuleGuard } from "@/modules/photo-docs/components/PhotoModuleGuard";
import type { ProjectStatus } from "@/types";

const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  sold: "Sold", scheduled: "Scheduled", in_progress: "In Progress",
  complete: "Complete", on_hold: "On Hold", canceled: "Canceled",
};

export default function PhotosProjectsPage() {
  const { data: projects = [], isLoading } = useProjects(true); // include archived for reference
  const [search, setSearch] = useState("");

  const filtered = projects.filter((p) =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.customerName.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <PhotoModuleGuard>
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Projects</h1>
          <p className="text-sm text-slate-500">Reference view — link photo jobs to these for cost tracking</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search projects…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div>
        ) : (
          <div className="space-y-2">
            {filtered.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                  <Briefcase className="h-4 w-4 text-slate-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-slate-900">{p.name}</p>
                    <StatusBadge variant={p.status === "on_hold" ? "on_hold_project" : p.status} label={PROJECT_STATUS_LABELS[p.status]} />
                    {p.isArchived && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Archived</span>}
                  </div>
                  <p className="truncate text-sm text-slate-500">{p.customerName}</p>
                  {p.address && (
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <MapPin className="h-3 w-3" /><span className="truncate">{p.address}</span>
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right text-sm font-medium text-slate-700">
                  {formatCurrency(p.contractPrice)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PhotoModuleGuard>
  );
}
