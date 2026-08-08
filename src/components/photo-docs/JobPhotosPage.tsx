"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Camera, MapPin, Search, Images, Plus, X, Maximize2, Minimize2,
  Pencil, Check, Archive, ArchiveRestore, Link2, FileText, Trash2, User,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { usePhotoJobs, useCreatePhotoJob, usePhotoJob, useUpdatePhotoJob, useArchivePhotoJob, useDeletePhotoJob } from "@/modules/photo-docs/hooks/usePhotoJobs";
import { useProjects } from "@/lib/hooks/use-projects";
import { useClients } from "@/lib/hooks/use-clients";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn, formatDate, formatAddress, getInitials, getAvatarColor } from "@/lib/utils";
import { PhotoModuleGuard } from "@/modules/photo-docs/components/PhotoModuleGuard";
import { PhotoGallery } from "@/modules/photo-docs/components/PhotoGallery";
import { usePhotoAccess } from "@/modules/photo-docs/hooks/usePhotoAccess";
import { MasterDetailLayout } from "@/components/shared/MasterDetailLayout";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ProjectDetailSheet } from "@/components/po/ProjectDetailSheet";
import { PROJECT_STATUS_LABELS } from "@/lib/constants";
import { useStickyState } from "@/lib/hooks/use-sticky-state";
import { CommentsSection } from "@/components/shared/CommentsSection";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { PhotoJobStatus } from "@/modules/photo-docs/types/photo.types";

type StatusFilter = PhotoJobStatus | "all";
type ArchiveFilter = "current" | "archived";
type ViewMode = "list" | "table";

// Pending is a job Status (same axis as Active/Complete), not an archive
// state — it used to live in the View row instead, which forced the Status
// row to hide itself whenever Pending was selected there and needed a
// special-cased query/filter path. Folding it in here removes both.
const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "All",      value: "all" },
  { label: "Active",   value: "active" },
  { label: "Complete", value: "complete" },
  { label: "Pending",  value: "pending" },
];

// Display labels for the archive-bucket filter — a separate, orthogonal axis
// (is this job archived or not) from job Status above.
const ARCHIVE_FILTER_LABELS: Record<ArchiveFilter, string> = {
  current: "Current",
  archived: "Archived",
};

const STATUS_COLORS: Record<PhotoJobStatus, string> = {
  active:   "bg-brand-100 text-brand-700",
  complete: "bg-slate-100 text-slate-600",
  pending:  "bg-purple-100 text-purple-700",
};

const STATUS_OPTIONS: { value: PhotoJobStatus; label: string }[] = [
  { value: "active",   label: "Active" },
  { value: "complete", label: "Complete" },
  { value: "pending",  label: "Pending" },
];

const EMPTY_FORM = { name: "", customerName: "", address: "", city: "", state: "", zip: "", notes: "", projectId: "", clientId: "" };

// ── Full-featured detail pane (list view) ─────────────────────────────────────

function JobDetailPane({ jobId }: { jobId: string }) {
  const router = useRouter();
  const { isCrew: isCrewRole, canAnnotate } = usePhotoAccess();
  const { data: job, isLoading } = usePhotoJob(jobId);
  // Non-archived projects for the "link a new project" picker; the full list
  // (including archived) so an already-linked project doesn't appear
  // disconnected here just because it was archived elsewhere.
  const { data: projects = [] } = useProjects();
  const { data: allProjects = [] } = useProjects(true);
  const { data: clients = [] } = useClients();
  const { mutate: updateJob, isPending: saving } = useUpdatePhotoJob();
  const { mutate: archiveJob, isPending: archiving } = useArchivePhotoJob();
  const { mutate: deleteJob, isPending: deleting } = useDeletePhotoJob();

  const [editing, setEditing] = useState(false);
  const [editingLink, setEditingLink] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [editingClientLink, setEditingClientLink] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [projectSheetOpen, setProjectSheetOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", customerName: "", address: "", city: "", state: "", zip: "",
    notes: "", status: "active" as PhotoJobStatus,
  });

  function openEdit() {
    if (!job) return;
    setForm({
      name: job.name, customerName: job.customerName,
      address: job.address, city: job.city, state: job.state, zip: job.zip,
      notes: job.notes ?? "", status: job.status,
    });
    setEditing(true);
  }

  function saveEdit() {
    updateJob(
      { id: jobId, ...form, notes: form.notes || null },
      {
        onSuccess: () => { toast.success("Job updated"); setEditing(false); },
        onError: () => toast.error("Failed to save"),
      },
    );
  }

  function changeStatus(status: PhotoJobStatus) {
    updateJob(
      { id: jobId, status },
      { onSuccess: () => toast.success(`Marked ${status.replace("_", " ")}`), onError: () => toast.error("Failed to update status") },
    );
  }

  function saveLink() {
    updateJob(
      { id: jobId, projectId: selectedProjectId || null },
      {
        onSuccess: () => {
          toast.success(selectedProjectId ? "Project linked" : "Project link removed");
          setEditingLink(false);
        },
      },
    );
  }

  function saveClientLink() {
    updateJob(
      { id: jobId, clientId: selectedClientId || null },
      {
        onSuccess: () => {
          toast.success(selectedClientId ? "Client linked" : "Client link removed");
          setEditingClientLink(false);
        },
      },
    );
  }

  const linkedProject = job?.projectId ? allProjects.find((p) => p.id === job.projectId) ?? null : null;
  const linkedClient = job?.clientId ? clients.find((c) => c.id === job.clientId) ?? null : null;
  const fullAddress = job ? formatAddress(job.address, job.city, job.state, job.zip) : "";
  // Keep an already-linked archived project selectable/visible in the picker
  // even though it's excluded from the default (non-archived) project list.
  const pickerProjects = linkedProject?.isArchived
    ? [linkedProject, ...projects]
    : projects;

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-5">
        <div className="h-6 w-2/3 animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
        <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
      </div>
    );
  }

  if (!job) return null;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-col gap-4 p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-slate-900" title={job.name}>{job.name}</h2>
            {job.customerName && <p className="truncate text-sm text-slate-500">{job.customerName}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", STATUS_COLORS[job.status])}>
              {job.status.replace("_", " ")}
            </span>
            {job.isArchived && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Archived</span>}
          </div>
        </div>

        {/* Inline status actions */}
        {!isCrewRole && !editing && (
          <div className="flex flex-wrap gap-1.5">
            {job.status === "pending" && (
              <Button size="sm" onClick={() => changeStatus("active")} disabled={saving}>Mark Active</Button>
            )}
            {job.status === "active" && (
              <Button size="sm" onClick={() => changeStatus("complete")} disabled={saving}>Mark Complete</Button>
            )}
            {job.status === "complete" && (
              <Button size="sm" variant="outline" onClick={() => changeStatus("active")} disabled={saving}>Reopen</Button>
            )}
            {job.status !== "pending" && (
              <Button size="sm" variant="outline" className="text-purple-600 border-purple-200 hover:bg-purple-50" onClick={() => changeStatus("pending")} disabled={saving}>
                Mark Pending
              </Button>
            )}
          </div>
        )}

        {/* Edit / Archive / Delete buttons */}
        {!isCrewRole && !editing && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={openEdit}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button
              size="sm" variant="outline"
              className={cn("gap-1.5 text-xs", job.isArchived ? "border-brand-400 text-brand-600" : "border-slate-300 text-slate-500")}
              disabled={archiving}
              onClick={() => archiveJob({ id: job.id, archived: !job.isArchived }, { onSuccess: () => toast.success(job.isArchived ? "Job unarchived" : "Job archived") })}
            >
              {job.isArchived ? <><ArchiveRestore className="h-3.5 w-3.5" /> Unarchive</> : <><Archive className="h-3.5 w-3.5" /> Archive</>}
            </Button>
            <Button
              size="sm" variant="outline"
              className="gap-1.5 text-xs border-red-200 text-red-500 hover:bg-red-50"
              disabled={deleting}
              onClick={() => {
                if (confirm(`Permanently delete "${job.name}"? This cannot be undone.`)) {
                  deleteJob(job.id, { onSuccess: () => { toast.success("Job deleted"); router.back(); } });
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto gap-1.5 text-xs text-slate-500" onClick={() => router.push(`/photos/jobs/${job.id}`)}>
              Open Full Page
            </Button>
          </div>
        )}

        {/* Edit form */}
        {editing && (
          <div className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-900">Edit Job</p>
              <button onClick={() => setEditing(false)} className="hidden sm:inline-flex"><X className="h-4 w-4 text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label className="text-xs">Job Name *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Customer Name</Label>
                <Input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <select className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PhotoJobStatus }))}>
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
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
                <Textarea rows={2} className="resize-none text-sm" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" disabled={!form.name.trim() || saving} onClick={saveEdit}>{saving ? "Saving…" : "Save Changes"}</Button>
            </div>
          </div>
        )}

        {/* Info card */}
        {!editing && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="space-y-2">
              {fullAddress && (
                <div className="flex items-start gap-2 text-slate-600">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span>{fullAddress}</span>
                </div>
              )}
              {job.notes && (
                <div className="flex items-start gap-2 text-slate-600">
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <p className="whitespace-pre-wrap leading-relaxed">{job.notes}</p>
                </div>
              )}
              {/* Project link */}
              <div className="border-t border-slate-200 pt-2">
                {editingLink ? (
                  <div className="flex items-center gap-2">
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <select className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
                      <option value="">— No project link —</option>
                      {pickerProjects.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.customerName})</option>)}
                    </select>
                    <button onClick={saveLink} disabled={saving} className="rounded-md p-1 text-brand-600 hover:bg-brand-50 disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setEditingLink(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    {linkedProject ? (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setProjectSheetOpen(true)} className="text-xs font-medium text-brand-600 hover:underline">{linkedProject.name}</button>
                        <StatusBadge variant={linkedProject.status === "on_hold" ? "on_hold_project" : linkedProject.status} label={PROJECT_STATUS_LABELS[linkedProject.status]} />
                        {linkedProject.isArchived && (
                          <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            Archived
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">No project linked</span>
                    )}
                    {(!isCrewRole || canAnnotate) && (
                      <button onClick={() => { setSelectedProjectId(job.projectId ?? ""); setEditingLink(true); }} className="ml-auto rounded-md p-1 text-slate-400 hover:bg-slate-100">
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              {/* Client link */}
              <div className="border-t border-slate-200 pt-2">
                {editingClientLink ? (
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <select className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)}>
                      <option value="">— No client linked, matched by name only —</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
                    </select>
                    <button onClick={saveClientLink} disabled={saving} className="rounded-md p-1 text-brand-600 hover:bg-brand-50 disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setEditingClientLink(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    {linkedClient ? (
                      <span className="text-xs font-medium text-slate-700">{linkedClient.displayName}</span>
                    ) : (
                      <span className="text-xs text-slate-400">No client linked — matched by customer name only</span>
                    )}
                    {(!isCrewRole || canAnnotate) && (
                      <button onClick={() => { setSelectedClientId(job.clientId ?? ""); setEditingClientLink(true); }} className="ml-auto rounded-md p-1 text-slate-400 hover:bg-slate-100">
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-400">Created {formatDate(job.createdAt)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Full photo gallery */}
      <div className="border-t border-slate-200 px-5 py-4">
        <PhotoGallery projectId={jobId} />
      </div>

      {/* Comments + Audit Trail tabs */}
      <div className="border-t border-slate-200">
        <Tabs defaultValue="comments">
          <div className="shrink-0 overflow-x-auto border-b border-slate-200 px-5">
            <TabsList className="h-10 bg-transparent p-0">
              <TabsTrigger value="comments" className="h-10 whitespace-nowrap rounded-none border-b-2 border-transparent px-2.5 pb-0 pt-0 text-xs font-medium text-slate-500 md:px-4 md:text-sm data-[state=active]:border-brand-500 data-[state=active]:text-brand-600 data-[state=active]:shadow-none">
                Comments
              </TabsTrigger>
              {!isCrewRole && (
                <TabsTrigger value="audit" className="h-10 whitespace-nowrap rounded-none border-b-2 border-transparent px-2.5 pb-0 pt-0 text-xs font-medium text-slate-500 md:px-4 md:text-sm data-[state=active]:border-brand-500 data-[state=active]:text-brand-600 data-[state=active]:shadow-none">
                  Audit Trail
                </TabsTrigger>
              )}
            </TabsList>
          </div>
          <TabsContent value="comments" className="px-5 py-4 mt-0">
            <CommentsSection recordType="job_photo" recordId={jobId} />
          </TabsContent>
          {!isCrewRole && (
            <TabsContent value="audit" className="mt-0">
              <AuditTrailTab recordType="job_photo" recordId={jobId} />
            </TabsContent>
          )}
        </Tabs>
      </div>

      <ProjectDetailSheet project={linkedProject} open={projectSheetOpen} onOpenChange={setProjectSheetOpen} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function JobPhotosPage() {
  const router = useRouter();
  const { canUpload, canDelete } = usePhotoAccess();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("current");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [viewMode, setViewMode] = useStickyState<ViewMode>("photos-jobs-view", "table");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const includeArchived = archiveFilter === "archived";
  const { data: jobs = [], isLoading } = usePhotoJobs(statusFilter, includeArchived);
  const { mutate: createJob, isPending: creating } = useCreatePhotoJob();
  const { mutate: deleteJob } = useDeletePhotoJob();
  const { data: projects = [] } = useProjects();
  const { data: clients = [] } = useClients();
  const [form, setForm] = useState(EMPTY_FORM);

  const filtered = useMemo(() => jobs.filter((j) => {
    // "Archived" includes both archived and non-archived jobs from the server
    // (includeArchived only widens the query) — narrow to archived-only here.
    if (archiveFilter === "archived" && !j.isArchived) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const addr = formatAddress(j.address, j.city, j.state, j.zip).toLowerCase();
    return j.name.toLowerCase().includes(q) || j.customerName.toLowerCase().includes(q) || addr.includes(q);
  }), [jobs, archiveFilter, search]);

  function handleCreate() {
    if (!form.name.trim()) return;
    createJob(
      { name: form.name, customerName: form.customerName, address: form.address, city: form.city, state: form.state, zip: form.zip, notes: form.notes || undefined, projectId: form.projectId || undefined, clientId: form.clientId || undefined },
      {
        onSuccess: (job) => {
          setShowNew(false);
          setForm(EMPTY_FORM);
          if (viewMode === "list") {
            setSelectedJobId(job.id);
          } else {
            router.push(`/photos/jobs/${job.id}`);
          }
        },
      },
    );
  }

  // ── List-view left panel ─────────────────────────────────────────────────────

  const listPanel = (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-1 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <Images className="h-8 w-8 text-slate-300" />
            <p className="text-sm text-slate-400">{jobs.length === 0 ? "No jobs yet" : "No jobs match"}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((job) => {
              const isSelected = job.id === selectedJobId;
              const fullAddr = formatAddress(job.address, job.city, job.state, job.zip);
              return (
                <button
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50",
                    isSelected ? "border-l-2 border-brand-500 bg-brand-50/60 hover:bg-brand-50/60" : "border-l-2 border-transparent",
                  )}
                >
                  <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", getAvatarColor(job.customerName || job.name))}>
                    {getInitials(job.customerName || job.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-slate-900">{job.name}</p>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize", STATUS_COLORS[job.status])}>
                        {job.status.replace("_", " ")}
                      </span>
                    </div>
                    {job.customerName && <p className="truncate text-xs text-slate-500">{job.customerName}</p>}
                    {fullAddr && <p className="truncate text-xs text-slate-400">{fullAddr}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <PhotoModuleGuard>
      <div className="flex h-full flex-col gap-4">
        {/* Header */}
        <PageHeader
          title="Jobs"
          description="Photo documentation by job site"
          action={
            <>
              {/* View mode toggle */}
              <div className="flex items-center rounded-md border bg-white shadow-sm">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn("rounded-r-none border-r px-3", viewMode === "list" && "bg-slate-100 font-semibold")}
                  onClick={() => setViewMode("list")}
                >
                  <Minimize2 className="mr-1.5 h-3.5 w-3.5" />List
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn("rounded-l-none px-3", viewMode === "table" && "bg-slate-100 font-semibold")}
                  onClick={() => setViewMode("table")}
                >
                  <Maximize2 className="mr-1.5 h-3.5 w-3.5" />Table
                </Button>
              </div>
              {canUpload && (
                <Button size="sm" className="gap-1.5" onClick={() => setShowNew(true)}>
                  <Plus className="h-4 w-4" /> New Job
                </Button>
              )}
            </>
          }
        />

        {/* New job form */}
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
              <div className="sm:col-span-2">
                <Label className="text-xs">Link to Client (optional)</Label>
                <select className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500" value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}>
                  <option value="">— No client linked, matched by name only —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button disabled={!form.name.trim() || creating} onClick={handleCreate}>{creating ? "Creating…" : "Create Job"}</Button>
            </div>
          </div>
        )}

        {/* Search + Filters — inline single row */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input placeholder="Search jobs…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Status</span>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map((f) => (
                <button key={f.value} onClick={() => setStatusFilter(f.value)}
                  className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", statusFilter === f.value ? "bg-brand-500 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">View</span>
            <div className="flex gap-1.5">
              {(["current", "archived"] as ArchiveFilter[]).map((f) => (
                <button key={f} onClick={() => setArchiveFilter(f)}
                  className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    archiveFilter === f ? "bg-[#2a2a2a] text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
                  {ARCHIVE_FILTER_LABELS[f]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        {viewMode === "list" ? (
          <MasterDetailLayout
            className="min-h-0 flex-1"
            listPanel={listPanel}
            detailPanel={selectedJobId ? <JobDetailPane jobId={selectedJobId} /> : null}
            emptyState={
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <Images className="h-10 w-10 text-slate-200" />
                <p className="text-sm text-slate-400">Select a job to view details</p>
              </div>
            }
            hasSelection={!!selectedJobId}
            onBack={() => setSelectedJobId(null)}
          />
        ) : (
          /* Table / card view */
          isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 py-16 text-center">
              <Images className="h-10 w-10 text-slate-300" />
              <p className="text-sm text-slate-400">{jobs.length === 0 ? "No jobs yet — create one above" : "No jobs match"}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((job) => {
                const fullAddr = formatAddress(job.address, job.city, job.state, job.zip);
                return (
                  <div key={job.id} className="group flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                    <button className="flex flex-1 items-center gap-4 text-left min-w-0" onClick={() => router.push(`/photos/jobs/${job.id}`)}>
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
                    {canDelete && (
                      <button
                        className="shrink-0 rounded-md p-1.5 text-slate-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                        title="Delete job"
                        onClick={(e) => { e.stopPropagation(); if (confirm(`Permanently delete "${job.name}"? This cannot be undone.`)) deleteJob(job.id, { onSuccess: () => toast.success("Job deleted") }); }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </PhotoModuleGuard>
  );
}
