"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, MapPin, Search, Images, Plus, X } from "lucide-react";
import { usePhotoJobs, useCreatePhotoJob } from "@/modules/photo-docs/hooks/usePhotoJobs";
import { useProjects } from "@/lib/hooks/use-projects";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn, formatDate } from "@/lib/utils";
import { PhotoModuleGuard } from "@/modules/photo-docs/components/PhotoModuleGuard";
import { usePhotoAccess } from "@/modules/photo-docs/hooks/usePhotoAccess";
import type { PhotoJobStatus } from "@/modules/photo-docs/types/photo.types";

type StatusFilter = PhotoJobStatus | "all";
type ArchiveFilter = "active" | "archived";

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "All",      value: "all" },
  { label: "Active",   value: "active" },
  { label: "Complete", value: "complete" },
  { label: "On Hold",  value: "on_hold" },
];

const STATUS_COLORS: Record<PhotoJobStatus, string> = {
  active:   "bg-brand-100 text-brand-700",
  complete: "bg-slate-100 text-slate-600",
  on_hold:  "bg-amber-100 text-amber-700",
};

const EMPTY_FORM = { name: "", customerName: "", address: "", city: "", state: "", zip: "", notes: "", projectId: "" };

export default function PhotoJobsPage() {
  const router = useRouter();
  const { canUpload } = usePhotoAccess();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("active");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);

  // Show archived when filter is "archived"
  const includeArchived = archiveFilter === "archived";
  const { data: jobs = [], isLoading } = usePhotoJobs(statusFilter, includeArchived);
  const { mutate: createJob, isPending: creating } = useCreatePhotoJob();
  const { data: projects = [] } = useProjects();
  const [form, setForm] = useState(EMPTY_FORM);

  const filtered = jobs.filter((j) => {
    if (archiveFilter === "archived" && !j.isArchived) return false;
    if (archiveFilter === "active" && j.isArchived) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const addr = [j.address, j.city, j.state, j.zip].filter(Boolean).join(" ").toLowerCase();
    return j.name.toLowerCase().includes(q) || j.customerName.toLowerCase().includes(q) || addr.includes(q);
  });

  function handleCreate() {
    if (!form.name.trim()) return;
    createJob(
      { name: form.name, customerName: form.customerName, address: form.address, city: form.city, state: form.state, zip: form.zip, notes: form.notes || undefined, projectId: form.projectId || undefined },
      { onSuccess: (job) => { setShowNew(false); setForm(EMPTY_FORM); router.push(`/photos/jobs/${job.id}`); } },
    );
  }

  return (
    <PhotoModuleGuard>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Jobs</h1>
            <p className="text-sm text-slate-500">Photo documentation by job site</p>
          </div>
          {canUpload && (
            <Button size="sm" className="gap-1.5" onClick={() => setShowNew(true)}>
              <Plus className="h-4 w-4" /> New Job
            </Button>
          )}
        </div>

        {showNew && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-medium text-slate-900">New Photo Job</p>
              <button onClick={() => setShowNew(false)}><X className="h-4 w-4 text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label className="text-xs">Job Name *</Label>
                <Input placeholder="e.g. 123 Main St — Lawn & Mulch" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Customer Name</Label>
                <Input placeholder="Optional" value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Street Address</Label>
                <Input placeholder="123 Main St" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">City</Label>
                <Input placeholder="Springfield" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">State</Label>
                  <Input placeholder="IL" value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">ZIP</Label>
                  <Input placeholder="62701" value={form.zip} onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))} />
                </div>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Notes</Label>
                <Textarea rows={2} className="resize-none text-sm" placeholder="Scope, special instructions…" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Link to Project (optional)</Label>
                <select className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500" value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}>
                  <option value="">— No project link —</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.customerName})</option>)}
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button disabled={!form.name.trim() || creating} onClick={handleCreate}>{creating ? "Creating…" : "Create Job"}</Button>
            </div>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search jobs…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status pills */}
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button key={f.value} onClick={() => setStatusFilter(f.value)}
                className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", statusFilter === f.value ? "bg-brand-500 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
                {f.label}
              </button>
            ))}
          </div>
          {/* Archive divider */}
          <div className="h-4 w-px bg-slate-200" />
          {/* Archive toggle */}
          <div className="flex gap-1.5">
            <button onClick={() => setArchiveFilter("active")}
              className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", archiveFilter === "active" ? "bg-slate-700 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
              Active
            </button>
            <button onClick={() => setArchiveFilter("archived")}
              className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", archiveFilter === "archived" ? "bg-slate-700 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
              Archived
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 py-16 text-center">
            <Images className="h-10 w-10 text-slate-300" />
            <p className="text-sm text-slate-400">{jobs.length === 0 ? "No jobs yet — create one above" : "No jobs match"}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((job) => {
              const fullAddr = [job.address, job.city, job.state, job.zip].filter(Boolean).join(", ");
              return (
                <button key={job.id} className="flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md" onClick={() => router.push(`/photos/jobs/${job.id}`)}>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                    <Camera className="h-5 w-5 text-brand-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-slate-900">{job.name}</p>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize", STATUS_COLORS[job.status])}>{job.status.replace("_", " ")}</span>
                      {job.isArchived && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Archived</span>}
                      {job.projectId && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">Project linked</span>}
                    </div>
                    {job.customerName && <p className="truncate text-sm text-slate-500">{job.customerName}</p>}
                    {fullAddr && <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400"><MapPin className="h-3 w-3" /><span className="truncate">{fullAddr}</span></div>}
                  </div>
                  <p className="shrink-0 text-xs text-slate-400">{formatDate(job.createdAt)}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </PhotoModuleGuard>
  );
}
