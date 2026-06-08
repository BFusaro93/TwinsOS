"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, MapPin, Search, Images } from "lucide-react";
import { useProjects } from "@/lib/hooks/use-projects";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { PhotoModuleGuard } from "@/modules/photo-docs/components/PhotoModuleGuard";

export function JobsListPage() {
  const router = useRouter();
  const { data: projects = [], isLoading } = useProjects();
  const [search, setSearch] = useState("");

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.customerName.toLowerCase().includes(search.toLowerCase()) ||
      p.address.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <PhotoModuleGuard>
      <div className="flex h-full flex-col">
        <PageHeader
          title="Jobs"
          description="Photo documentation by job site"
          action={null}
        />

        <div className="flex-1 overflow-y-auto p-6">
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search jobs, customers, addresses…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-xl bg-slate-800"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <Images className="h-10 w-10 text-slate-600" />
              <p className="text-sm text-slate-400">No jobs found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((project) => (
                <button
                  key={project.id}
                  className="flex w-full items-center gap-4 rounded-xl border border-slate-700 bg-slate-800/50 p-4 text-left transition-colors hover:bg-slate-800"
                  onClick={() => router.push(`/jobs/${project.id}/photos`)}
                >
                  {/* Camera icon */}
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-500/10">
                    <Camera className="h-5 w-5 text-brand-400" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-white">{project.name}</p>
                      <StatusBadge variant={project.status} label={project.status.replace(/_/g, " ")} />
                    </div>
                    <p className="truncate text-sm text-slate-400">{project.customerName}</p>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{project.address}</span>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-xs text-slate-500">{formatDate(project.createdAt)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </PhotoModuleGuard>
  );
}
