"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, MapPin, Search, Images } from "lucide-react";
import { useProjects } from "@/lib/hooks/use-projects";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Input } from "@/components/ui/input";
import { cn, formatDate } from "@/lib/utils";
import { PhotoModuleGuard } from "@/modules/photo-docs/components/PhotoModuleGuard";
import type { ProjectStatus } from "@/types";

const STATUS_FILTERS: { label: string; value: ProjectStatus | "all" }[] = [
  { label: "All",         value: "all" },
  { label: "In Progress", value: "in_progress" },
  { label: "Scheduled",   value: "scheduled" },
  { label: "Sold",        value: "sold" },
  { label: "Complete",    value: "complete" },
  { label: "On Hold",     value: "on_hold" },
];

export default function PhotoJobsPage() {
  const router = useRouter();
  const { data: projects = [], isLoading } = useProjects();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");

  const filtered = projects
    .filter((p) => !p.isArchived)
    .filter((p) =>
      statusFilter === "all" || p.status === statusFilter,
    )
    .filter((p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.customerName.toLowerCase().includes(search.toLowerCase()) ||
      p.address.toLowerCase().includes(search.toLowerCase()),
    );

  return (
    <PhotoModuleGuard>
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Jobs</h1>
          <p className="text-sm text-slate-500">Photo documentation by job site</p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search jobs, customers, addresses…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Status filter pills */}
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                statusFilter === f.value
                  ? "bg-brand-500 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Jobs list */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 py-16 text-center">
            <Images className="h-10 w-10 text-slate-300" />
            <p className="text-sm text-slate-400">No jobs found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((project) => (
              <button
                key={project.id}
                className="flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md"
                onClick={() => router.push(`/photos/jobs/${project.id}`)}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                  <Camera className="h-5 w-5 text-brand-500" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-slate-900">{project.name}</p>
                    <StatusBadge variant={project.status} label={project.status.replace(/_/g, " ")} />
                  </div>
                  <p className="truncate text-sm text-slate-500">{project.customerName}</p>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                    <MapPin className="h-3 w-3" />
                    <span className="truncate">{project.address}</span>
                  </div>
                </div>

                <p className="shrink-0 text-xs text-slate-400">{formatDate(project.createdAt)}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </PhotoModuleGuard>
  );
}
