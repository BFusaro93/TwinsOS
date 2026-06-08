"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MapPin, FileText } from "lucide-react";
import { useProjects } from "@/lib/hooks/use-projects";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PhotoModuleGuard } from "@/modules/photo-docs/components/PhotoModuleGuard";
import { PhotoGallery } from "@/modules/photo-docs/components/PhotoGallery";
import { CrewPhotoView } from "@/modules/photo-docs/components/CrewPhotoView";
import { usePhotoAccess } from "@/modules/photo-docs/hooks/usePhotoAccess";
import { Button } from "@/components/ui/button";

export default function JobPhotosPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const router = useRouter();
  const { isCrew } = usePhotoAccess();
  const { data: projects = [] } = useProjects();
  const project = projects.find((p) => p.id === jobId);

  return (
    <PhotoModuleGuard>
      <div className="flex flex-col gap-5">
        {/* Back + header */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <button
              onClick={() => router.push("/photos/jobs")}
              className="mb-2 flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              All Jobs
            </button>
            <h1 className="text-xl font-semibold text-slate-900">{project?.name ?? "Job Photos"}</h1>
          </div>
        </div>

        {/* Project info card */}
        {project && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-slate-900">{project.customerName}</p>
                  <StatusBadge variant={project.status} label={project.status.replace(/_/g, " ")} />
                </div>
                {project.address && (
                  <div className="flex items-center gap-1.5 text-sm text-slate-500">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span>{project.address}</span>
                  </div>
                )}
                {project.notes && (
                  <div className="flex items-start gap-1.5 text-sm text-slate-500">
                    <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <p className="leading-relaxed">{project.notes}</p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                {project.startDate && (
                  <div className="text-right text-xs text-slate-400">
                    <p>Start</p>
                    <p className="font-medium text-slate-600">{project.startDate}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Gallery */}
        {isCrew ? (
          <CrewPhotoView
            projectId={jobId}
            projectName={project?.name ?? ""}
            projectAddress={project?.address ?? ""}
          />
        ) : (
          <PhotoGallery projectId={jobId} />
        )}
      </div>
    </PhotoModuleGuard>
  );
}
