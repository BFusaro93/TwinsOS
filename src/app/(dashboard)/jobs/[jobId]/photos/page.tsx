"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useProjects } from "@/lib/hooks/use-projects";
import { PageHeader } from "@/components/shared/PageHeader";
import { PhotoModuleGuard } from "@/modules/photo-docs/components/PhotoModuleGuard";
import { PhotoGallery } from "@/modules/photo-docs/components/PhotoGallery";
import { CrewPhotoView } from "@/modules/photo-docs/components/CrewPhotoView";
import { usePhotoAccess } from "@/modules/photo-docs/hooks/usePhotoAccess";
import { Button } from "@/components/ui/button";

export default function JobPhotosPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = use(params);
  const router = useRouter();
  const { isCrew } = usePhotoAccess();
  const { data: projects = [] } = useProjects();
  const project = projects.find((p) => p.id === jobId);

  return (
    <PhotoModuleGuard>
      <div className="flex h-full flex-col">
        <PageHeader
          title={project?.name ?? "Job Photos"}
          description={project?.customerName ?? ""}
          action={
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-slate-400"
              onClick={() => router.push("/jobs")}
            >
              <ArrowLeft className="h-4 w-4" />
              All Jobs
            </Button>
          }
        />

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {/* Crew gets a simplified mobile view */}
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
      </div>
    </PhotoModuleGuard>
  );
}
