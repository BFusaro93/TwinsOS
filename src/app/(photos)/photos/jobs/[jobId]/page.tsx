"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MapPin, FileText, Link2, Pencil, Check, X } from "lucide-react";
import { usePhotoJob, useUpdatePhotoJob } from "@/modules/photo-docs/hooks/usePhotoJobs";
import { useProjects } from "@/lib/hooks/use-projects";
import { PhotoModuleGuard } from "@/modules/photo-docs/components/PhotoModuleGuard";
import { PhotoGallery } from "@/modules/photo-docs/components/PhotoGallery";
import { CrewPhotoView } from "@/modules/photo-docs/components/CrewPhotoView";
import { usePhotoAccess } from "@/modules/photo-docs/hooks/usePhotoAccess";
import { ProjectDetailSheet } from "@/components/po/ProjectDetailSheet";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  active:   "bg-brand-100 text-brand-700",
  complete: "bg-slate-100 text-slate-600",
  on_hold:  "bg-amber-100 text-amber-700",
};

export default function JobPhotosPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const router = useRouter();
  const { isCrew, canAnnotate } = usePhotoAccess();
  const { data: job } = usePhotoJob(jobId);
  const { data: projects = [] } = useProjects();
  const { mutate: updateJob, isPending: saving } = useUpdatePhotoJob();

  const [editingLink, setEditingLink] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [projectSheetOpen, setProjectSheetOpen] = useState(false);

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

  return (
    <PhotoModuleGuard>
      <div className="flex flex-col gap-5">
        <div>
          <button onClick={() => router.push("/photos/jobs")} className="mb-2 flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600">
            <ArrowLeft className="h-3.5 w-3.5" /> All Jobs
          </button>
          <h1 className="text-xl font-semibold text-slate-900">{job?.name ?? "Job Photos"}</h1>
        </div>

        {job && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {job.customerName && <p className="font-medium text-slate-900">{job.customerName}</p>}
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_COLORS[job.status] ?? ""}`}>
                  {job.status.replace("_", " ")}
                </span>
              </div>
              {job.address && (
                <div className="flex items-center gap-1.5 text-sm text-slate-500">
                  <MapPin className="h-3.5 w-3.5 shrink-0" /><span>{job.address}</span>
                </div>
              )}
              {job.notes && (
                <div className="flex items-start gap-1.5 text-sm text-slate-500">
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" /><p className="leading-relaxed">{job.notes}</p>
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
                      <button
                        onClick={() => setProjectSheetOpen(true)}
                        className="text-sm font-medium text-brand-600 hover:underline"
                      >
                        {linkedProject.name}
                      </button>
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
          <CrewPhotoView projectId={jobId} projectName={job?.name ?? ""} projectAddress={job?.address ?? ""} />
        ) : (
          <PhotoGallery projectId={jobId} />
        )}
      </div>

      {/* Linked project slide-in — opens within the photos window */}
      <ProjectDetailSheet
        project={linkedProject}
        open={projectSheetOpen}
        onOpenChange={setProjectSheetOpen}
      />
    </PhotoModuleGuard>
  );
}
