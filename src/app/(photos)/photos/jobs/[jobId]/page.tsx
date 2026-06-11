"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MapPin, FileText, Link2, Pencil, Check, X, Archive, ArchiveRestore } from "lucide-react";
import { usePhotoJob, useUpdatePhotoJob, useArchivePhotoJob } from "@/modules/photo-docs/hooks/usePhotoJobs";
import { useProjects } from "@/lib/hooks/use-projects";
import { PhotoModuleGuard } from "@/modules/photo-docs/components/PhotoModuleGuard";
import { PhotoGallery } from "@/modules/photo-docs/components/PhotoGallery";
import { CrewPhotoView } from "@/modules/photo-docs/components/CrewPhotoView";
import { usePhotoAccess } from "@/modules/photo-docs/hooks/usePhotoAccess";
import { ProjectDetailSheet } from "@/components/po/ProjectDetailSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatAddress } from "@/lib/utils";
import { PROJECT_STATUS_LABELS } from "@/lib/constants";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CommentsSection } from "@/components/shared/CommentsSection";
import type { PhotoJobStatus } from "@/modules/photo-docs/types/photo.types";

const STATUS_COLORS: Record<string, string> = {
  active:   "bg-brand-100 text-brand-700",
  complete: "bg-slate-100 text-slate-600",
  on_hold:  "bg-amber-100 text-amber-700",
};

const STATUS_OPTIONS: { value: PhotoJobStatus; label: string }[] = [
  { value: "active",   label: "Active" },
  { value: "complete", label: "Complete" },
  { value: "on_hold",  label: "On Hold" },
];

export default function JobPhotosPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const router = useRouter();
  const { isCrew, canAnnotate } = usePhotoAccess();
  const { data: job } = usePhotoJob(jobId);
  const { data: projects = [] } = useProjects();
  const { mutate: updateJob, isPending: saving } = useUpdatePhotoJob();
  const { mutate: archiveJob, isPending: archiving } = useArchivePhotoJob();

  const [editing, setEditing] = useState(false);
  const [editingLink, setEditingLink] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [projectSheetOpen, setProjectSheetOpen] = useState(false);

  const [form, setForm] = useState({
    name: "", customerName: "", address: "", city: "", state: "", zip: "",
    notes: "", status: "active" as PhotoJobStatus,
  });

  function openEdit() {
    if (!job) return;
    setForm({
      name: job.name,
      customerName: job.customerName,
      address: job.address,
      city: job.city,
      state: job.state,
      zip: job.zip,
      notes: job.notes ?? "",
      status: job.status,
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

  function openLinkEditor() {
    setSelectedProjectId(job?.projectId ?? "");
    setEditingLink(true);
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

  const linkedProject = job?.projectId ? projects.find((p) => p.id === job.projectId) ?? null : null;
  const fullAddress = job ? formatAddress(job.address, job.city, job.state, job.zip) : "";

  return (
    <PhotoModuleGuard>
      <div className="flex flex-col gap-5 pb-28">{/* pb-28: clears the fixed Upload Progress Photo bar on crew tablets */}
        {/* Back nav */}
        <div>
          <button onClick={() => router.push("/photos/jobs")} className="mb-2 flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600">
            <ArrowLeft className="h-3.5 w-3.5" /> Job Photos
          </button>
          <div className="flex items-center justify-between gap-2">
            <h1 className="min-w-0 flex-1 truncate text-xl font-semibold text-slate-900" title={job?.name}>{job?.name ?? "Job Photos"}</h1>
            {!isCrew && !editing && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={openEdit}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                {job && (
                  <Button
                    size="sm"
                    variant="outline"
                    className={job.isArchived ? "gap-1.5 border-brand-400 text-brand-600" : "gap-1.5 border-slate-300 text-slate-500"}
                    disabled={archiving}
                    onClick={() =>
                      archiveJob(
                        { id: job.id, archived: !job.isArchived },
                        { onSuccess: () => toast.success(job.isArchived ? "Job unarchived" : "Job archived") },
                      )
                    }
                  >
                    {job.isArchived ? <><ArchiveRestore className="h-3.5 w-3.5" /> Unarchive</> : <><Archive className="h-3.5 w-3.5" /> Archive</>}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Edit form */}
        {editing && job && (
          <div className="rounded-xl border border-brand-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-medium text-slate-900">Edit Job</p>
              <button onClick={() => setEditing(false)} className="hidden sm:inline-flex"><X className="h-4 w-4 text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PhotoJobStatus }))}
                >
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
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button disabled={!form.name.trim() || saving} onClick={saveEdit}>{saving ? "Saving…" : "Save Changes"}</Button>
            </div>
          </div>
        )}

        {/* Job info card (read mode) */}
        {job && !editing && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {job.customerName && <p className="font-medium text-slate-900">{job.customerName}</p>}
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_COLORS[job.status] ?? ""}`}>
                  {job.status.replace("_", " ")}
                </span>
                {job.isArchived && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Archived</span>
                )}
              </div>
              {fullAddress && (
                <div className="flex items-center gap-1.5 text-sm text-slate-500">
                  <MapPin className="h-3.5 w-3.5 shrink-0" /><span>{fullAddress}</span>
                </div>
              )}
              {job.notes && (
                <div className="flex items-start gap-1.5 text-sm text-slate-500">
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" /><p className="whitespace-pre-wrap leading-relaxed">{job.notes}</p>
                </div>
              )}

              {/* Project link row */}
              <div className="mt-3 border-t border-slate-100 pt-3">
                {editingLink ? (
                  <div className="flex items-center gap-2">
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <select
                      className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      value={selectedProjectId}
                      onChange={(e) => setSelectedProjectId(e.target.value)}
                    >
                      <option value="">— No project link —</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.customerName})</option>)}
                    </select>
                    <button onClick={saveLink} disabled={saving} className="rounded-md p-1.5 text-brand-600 hover:bg-brand-50 disabled:opacity-50">
                      <Check className="h-4 w-4" />
                    </button>
                    <button onClick={() => setEditingLink(false)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    {linkedProject ? (
                      <div className="flex items-center gap-2">
                        <button onClick={() => setProjectSheetOpen(true)} className="text-sm font-medium text-brand-600 hover:underline">
                          {linkedProject.name}
                        </button>
                        <StatusBadge
                          variant={linkedProject.status === "on_hold" ? "on_hold_project" : linkedProject.status}
                          label={PROJECT_STATUS_LABELS[linkedProject.status]}
                        />
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400">No project linked</span>
                    )}
                    {(!isCrew || canAnnotate) && (
                      <button onClick={openLinkEditor} className="ml-auto rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {isCrew ? (
          <CrewPhotoView projectId={jobId} projectName={job?.name ?? ""} projectAddress={fullAddress} />
        ) : (
          <PhotoGallery projectId={jobId} />
        )}

        {/* Job-level comments — crew can message the office about the job as a whole */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Comments</h2>
          <CommentsSection recordType="job_photo" recordId={jobId} />
        </div>
      </div>

      <ProjectDetailSheet
        project={linkedProject}
        open={projectSheetOpen}
        onOpenChange={setProjectSheetOpen}
      />
    </PhotoModuleGuard>
  );
}
