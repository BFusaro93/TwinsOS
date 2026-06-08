"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PhotoModuleGuard } from "@/modules/photo-docs/components/PhotoModuleGuard";
import { AnnotationEditor } from "@/modules/photo-docs/components/AnnotationEditor";
import { usePhotoAccess } from "@/modules/photo-docs/hooks/usePhotoAccess";

export default function AnnotatePhotoPage({ params }: { params: Promise<{ jobId: string; photoId: string }> }) {
  const { jobId, photoId } = use(params);
  const router = useRouter();
  const { canAnnotate } = usePhotoAccess();

  if (!canAnnotate) {
    router.replace(`/photos/jobs/${jobId}`);
    return null;
  }

  return (
    <PhotoModuleGuard>
      <div className="flex h-full flex-col gap-4">
        <div>
          <button
            onClick={() => router.push(`/photos/jobs/${jobId}`)}
            className="mb-2 flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <h1 className="text-xl font-semibold text-slate-900">Annotate Photo</h1>
          <p className="text-sm text-slate-500">Mark up areas of interest for the crew</p>
        </div>
        <AnnotationEditor photoId={photoId} projectId={jobId} />
      </div>
    </PhotoModuleGuard>
  );
}
