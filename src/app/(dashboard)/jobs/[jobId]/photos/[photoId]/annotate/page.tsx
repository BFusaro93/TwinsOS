"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { PhotoModuleGuard } from "@/modules/photo-docs/components/PhotoModuleGuard";
import { AnnotationEditor } from "@/modules/photo-docs/components/AnnotationEditor";
import { usePhotoAccess } from "@/modules/photo-docs/hooks/usePhotoAccess";

export default function AnnotatePhotoPage({
  params,
}: {
  params: Promise<{ jobId: string; photoId: string }>;
}) {
  const { jobId, photoId } = use(params);
  const router = useRouter();
  const { canAnnotate } = usePhotoAccess();

  if (!canAnnotate) {
    router.replace(`/jobs/${jobId}/photos`);
    return null;
  }

  return (
    <PhotoModuleGuard>
      <div className="flex h-full flex-col">
        <PageHeader
          title="Annotate Photo"
          description="Mark up areas of interest for the crew"
          action={
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-slate-400"
              onClick={() => router.push(`/jobs/${jobId}/photos`)}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          }
        />
        <div className="flex flex-1 flex-col overflow-hidden p-4 md:p-6">
          <AnnotationEditor photoId={photoId} projectId={jobId} />
        </div>
      </div>
    </PhotoModuleGuard>
  );
}
